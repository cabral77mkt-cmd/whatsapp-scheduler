const express = require('express');
const router = express.Router();
const db = require('../database');
const leadService = require('../crm/leadService');
const automationRules = require('../crm/automationRules');
const autoLead = require('../crm/autoLead');
const aiScorer = require('../crm/aiScorer');
const coaching = require('../crm/coachingService');
const commission = require('../crm/commissionService');
const { sendMessage, getStatus } = require('../whatsapp/client');
const { logAudit } = require('../middleware/audit');
const { dispatch: dispatchWebhook } = require('../webhooks/outbound');
const { ROLE_LEVELS } = require('../middleware/roles');

// Retorna true se o usuário pode ver leads de outros (admin ou manager)
function canSeeAllLeads(req) {
  if (req.user?.isAdmin) return true;
  const level = ROLE_LEVELS[req.user?.role || 'seller'] || 1;
  return level >= ROLE_LEVELS.manager;
}

function ensureSeeds(userId) {
  db.ensureCrmSeeds(userId);
}

function loadTagsForLead(leadId) {
  return db.prepare(`
    SELECT t.* FROM crm_tags t
    JOIN crm_lead_tags lt ON lt.tag_id = t.id
    WHERE lt.lead_id = ? ORDER BY t.name
  `).all(leadId);
}

function attachTags(leads) {
  if (!leads.length) return leads;
  const ids = leads.map(l => l.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT lt.lead_id, t.id, t.name, t.color
    FROM crm_lead_tags lt JOIN crm_tags t ON t.id = lt.tag_id
    WHERE lt.lead_id IN (${placeholders})
  `).all(...ids);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.lead_id)) map.set(r.lead_id, []);
    map.get(r.lead_id).push({ id: r.id, name: r.name, color: r.color });
  }
  for (const l of leads) l.tags = map.get(l.id) || [];
  return leads;
}

// GET /export.csv — exportação de leads para CSV
router.get('/export.csv', (req, res) => {
  const userId = Number(req.user.sub);
  const leads = db.prepare(`
    SELECT l.id, l.name, l.phone, l.stage, l.temperature, l.source,
           l.potential_value, l.notes, l.first_contact_at, l.last_interaction_at,
           l.automations_enabled,
           (SELECT event_name FROM crm_lead_event WHERE lead_id = l.id) AS event_name,
           (SELECT city FROM crm_lead_event WHERE lead_id = l.id) AS city,
           (SELECT event_date FROM crm_lead_event WHERE lead_id = l.id) AS event_date
    FROM crm_leads l WHERE l.user_id = ?
    ORDER BY l.last_interaction_at DESC
  `).all(userId);

  const escapeCSV = (v) => {
    if (v == null) return '';
    const str = String(v);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['ID','Nome','Telefone','Etapa','Temperatura','Origem','Valor Potencial',
    'Evento','Cidade','Data do Evento','Primeira Interacao','Ultima Interacao','Observacoes'];

  const rows = leads.map(l => [
    l.id, l.name, l.phone, l.stage, l.temperature, l.source, l.potential_value,
    l.event_name, l.city, l.event_date, l.first_contact_at, l.last_interaction_at, l.notes
  ].map(escapeCSV).join(','));

  const csv = '﻿' + [headers.join(','), ...rows].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(csv);
});

// GET /users — lista de usuários do sistema (para dropdown de responsável)
router.get('/users', (req, res) => {
  const rows = db.prepare(
    'SELECT id, username, display_name FROM users ORDER BY display_name, username'
  ).all();
  res.json(rows.map(r => ({ id: r.id, name: r.display_name || r.username })));
});

/* ── Saved Filters ──────────────────────────────────────────── */
// GET /filters/saved
router.get('/filters/saved', (req, res) => {
  const userId = Number(req.user.sub);
  const rows = db.prepare('SELECT * FROM crm_lead_filters WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  res.json(rows.map(f => ({ id: f.id, name: f.name, filters: JSON.parse(f.filters_json) })));
});

// POST /filters/saved
router.post('/filters/saved', (req, res) => {
  const userId = Number(req.user.sub);
  const { name, filters } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name obrigatório' });
  const result = db.prepare('INSERT INTO crm_lead_filters (user_id, name, filters_json) VALUES (?, ?, ?)')
    .run(userId, name.trim(), JSON.stringify(filters || {}));
  res.json({ id: result.lastInsertRowid, name: name.trim(), filters: filters || {} });
});

// DELETE /filters/saved/:id
router.delete('/filters/saved/:id', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare('DELETE FROM crm_lead_filters WHERE id = ? AND user_id = ?').run(Number(req.params.id), userId);
  res.json({ ok: true });
});

/* ── Bulk Actions ───────────────────────────────────────────── */
// POST /bulk/move — mover vários leads de estágio
router.post('/bulk/move', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_ids = [], stage } = req.body || {};
  if (!stage || !lead_ids.length) return res.status(400).json({ error: 'lead_ids e stage obrigatórios' });
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE crm_leads SET stage = ?, stage_changed_at = ? WHERE id = ? AND user_id = ?
  `);
  let updated = 0;
  for (const id of lead_ids) {
    const info = stmt.run(stage, now, Number(id), userId);
    if (info.changes) updated++;
  }
  res.json({ updated });
});

// POST /bulk/tag — adicionar tag a vários leads
router.post('/bulk/tag', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_ids = [], tag_id } = req.body || {};
  if (!tag_id || !lead_ids.length) return res.status(400).json({ error: 'lead_ids e tag_id obrigatórios' });
  const stmt = db.prepare('INSERT OR IGNORE INTO crm_lead_tags (lead_id, tag_id) VALUES (?, ?)');
  for (const id of lead_ids) {
    const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (lead) stmt.run(lead.id, Number(tag_id));
  }
  res.json({ ok: true });
});

// POST /bulk/assign — atribuir responsável a vários leads
router.post('/bulk/assign', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_ids = [], assignee_user_id } = req.body || {};
  if (!lead_ids.length) return res.status(400).json({ error: 'lead_ids obrigatório' });
  const stmt = db.prepare('UPDATE crm_leads SET responsible_user_id = ? WHERE id = ? AND user_id = ?');
  for (const id of lead_ids) stmt.run(assignee_user_id || null, Number(id), userId);
  res.json({ ok: true });
});

// POST /bulk/cadence — enroll vários leads em uma cadência
router.post('/bulk/cadence', (req, res) => {
  const userId = Number(req.user.sub);
  const { lead_ids = [], cadence_id } = req.body || {};
  if (!cadence_id || !lead_ids.length) return res.status(400).json({ error: 'lead_ids e cadence_id obrigatórios' });
  const cadence = db.prepare('SELECT id FROM crm_cadences WHERE id = ? AND user_id = ?').get(Number(cadence_id), userId);
  if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO crm_cadence_enrollments (lead_id, cadence_id, current_step, status, enrolled_at, next_step_at)
    VALUES (?, ?, 0, 'active', ?, ?)
    ON CONFLICT(lead_id, cadence_id) DO UPDATE SET
      status = 'active', current_step = 0, next_step_at = excluded.next_step_at
  `);
  let enrolled = 0;
  for (const id of lead_ids) {
    const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (lead) { stmt.run(lead.id, Number(cadence_id), now, now); enrolled++; }
  }
  res.json({ enrolled });
});

// GET /sources — lista de origens distintas cadastradas
router.get('/sources', (req, res) => {
  const userId = Number(req.user.sub);
  const rows = db.prepare(`
    SELECT DISTINCT source FROM crm_leads
    WHERE user_id = ? AND source IS NOT NULL AND source != ''
    ORDER BY source
  `).all(userId);
  res.json(rows.map(r => r.source));
});

// GET / — lista com filtros
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  ensureSeeds(userId);
  const { stage, search, temperature, source, value_min, value_max, stale_days, sort, responsible_user_id } = req.query;
  // Scope: sellers veem apenas seus próprios leads; admin/manager veem todos
  const where = canSeeAllLeads(req)
    ? []
    : ['(user_id = ? OR responsible_user_id = ?)'];
  const params = canSeeAllLeads(req) ? [] : [userId, userId];
  if (stage)               { where.push('stage = ?');               params.push(stage); }
  if (temperature)         { where.push('temperature = ?');         params.push(temperature); }
  if (source)              { where.push('source = ?');              params.push(source); }
  if (responsible_user_id) { where.push('responsible_user_id = ?'); params.push(Number(responsible_user_id)); }
  if (value_min)   { where.push('potential_value >= ?'); params.push(Number(value_min)); }
  if (value_max)   { where.push('potential_value <= ?'); params.push(Number(value_max)); }
  if (stale_days)  {
    where.push(`(last_interaction_at IS NULL OR last_interaction_at < datetime('now','-${Number(stale_days)} days'))`);
    where.push("stage NOT IN ('fechado','perdido')");
  }
  if (search) {
    where.push('(name LIKE ? OR phone LIKE ? OR source LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const orderMap = {
    'last_interaction': 'last_interaction_at DESC',
    'value_desc':       'potential_value DESC',
    'value_asc':        'potential_value ASC',
    'name':             'name ASC',
    'created':          'first_contact_at DESC',
  };
  const orderBy = orderMap[sort] || 'position ASC, last_interaction_at DESC';

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT * FROM crm_leads
    ${whereClause}
    ORDER BY ${orderBy}
  `).all(...params);
  // Enriquece com nome do responsável
  if (rows.length) {
    const userIds = [...new Set(rows.map(r => r.responsible_user_id).filter(Boolean))];
    if (userIds.length) {
      const phs = userIds.map(() => '?').join(',');
      const uRows = db.prepare(
        `SELECT id, COALESCE(display_name, username) AS name FROM users WHERE id IN (${phs})`
      ).all(...userIds);
      const uMap = Object.fromEntries(uRows.map(u => [u.id, u.name]));
      for (const r of rows) r.responsible_user_name = uMap[r.responsible_user_id] || null;
    }
  }
  res.json(attachTags(rows));
});

// GET /kanban — agrupado por etapa
router.get('/kanban', (req, res) => {
  const userId = Number(req.user.sub);
  ensureSeeds(userId);
  const scopeWhere = canSeeAllLeads(req) ? '' : 'WHERE (l.user_id = ? OR l.responsible_user_id = ?)';
  const scopeParams = canSeeAllLeads(req) ? [] : [userId, userId];
  const leads = db.prepare(`
    SELECT l.*,
      (SELECT event_name FROM crm_lead_event WHERE lead_id = l.id) AS event_name,
      (SELECT city FROM crm_lead_event WHERE lead_id = l.id) AS city,
      (SELECT event_date FROM crm_lead_event WHERE lead_id = l.id) AS event_date,
      (SELECT scheduled_at FROM crm_followups
        WHERE lead_id = l.id AND status = 'pending'
        ORDER BY scheduled_at ASC LIMIT 1) AS next_followup_at,
      (SELECT COALESCE(u.display_name, u.username) FROM users u WHERE u.id = l.responsible_user_id) AS responsible_user_name
    FROM crm_leads l ${scopeWhere}
    ORDER BY l.position ASC, l.last_interaction_at DESC
  `).all(...scopeParams);
  attachTags(leads);

  // Attach AI scores em batch
  if (leads.length) {
    const ids = leads.map((l) => l.id);
    const phs = ids.map(() => '?').join(',');
    const aiRows = db.prepare(`SELECT * FROM crm_lead_ai WHERE lead_id IN (${phs})`).all(...ids);
    const aiMap = Object.fromEntries(aiRows.map((r) => [r.lead_id, r]));
    for (const l of leads) l.ai = aiMap[l.id] || null;
  }

  const grouped = {};
  for (const s of leadService.VALID_STAGES) grouped[s] = [];
  for (const lead of leads) {
    if (!grouped[lead.stage]) grouped[lead.stage] = [];
    grouped[lead.stage].push(lead);
  }
  res.json(grouped);
});

// GET /:id — detalhe completo
router.get('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  lead.event = db.prepare('SELECT * FROM crm_lead_event WHERE lead_id = ?').get(lead.id) || null;
  lead.tags = loadTagsForLead(lead.id);
  lead.tasks = db.prepare('SELECT * FROM crm_tasks WHERE lead_id = ? ORDER BY done_at IS NOT NULL, due_date ASC').all(lead.id);
  lead.meetings = db.prepare('SELECT * FROM crm_meetings WHERE lead_id = ? ORDER BY meeting_at DESC').all(lead.id);
  lead.proposals = db.prepare('SELECT * FROM crm_proposals WHERE lead_id = ? ORDER BY created_at DESC').all(lead.id);
  lead.followups = db.prepare(`
    SELECT * FROM crm_followups WHERE lead_id = ? ORDER BY scheduled_at ASC LIMIT 100
  `).all(lead.id);
  lead.messages = db.prepare(`
    SELECT * FROM crm_message_log WHERE lead_id = ? ORDER BY occurred_at DESC LIMIT 200
  `).all(lead.id);
  lead.ai = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(lead.id) || null;
  res.json(lead);
});

// POST / — cadastro manual
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  ensureSeeds(userId);
  const { name, phone, source, temperature = 'morno', potential_value, notes, tag_ids = [] } = req.body;
  if (!phone?.trim()) return res.status(400).json({ error: 'Telefone é obrigatório' });
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const existing = db.prepare('SELECT id FROM crm_leads WHERE user_id = ? AND phone = ?').get(userId, cleanPhone);
  if (existing) return res.status(409).json({ error: 'Lead já existe', lead_id: existing.id });

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO crm_leads
      (user_id, name, phone, stage, source, temperature, potential_value, notes,
       first_contact_at, last_interaction_at, stage_changed_at)
    VALUES (?, ?, ?, 'entrou_contato', ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, name || null, cleanPhone, source || null, temperature, potential_value || null,
         notes || null, now, now, now);
  const leadId = info.lastInsertRowid;

  if (tag_ids.length) {
    const stmt = db.prepare('INSERT OR IGNORE INTO crm_lead_tags (lead_id, tag_id) VALUES (?, ?)');
    for (const tid of tag_ids) stmt.run(leadId, tid);
  }

  const newLead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
  logAudit({ userId, entityType: 'crm_lead', entityId: leadId, action: 'create', after: newLead, ip: req.ip });
  dispatchWebhook(userId, 'lead.created', { id: leadId, name: newLead.name, phone: newLead.phone, stage: newLead.stage }).catch(() => {});
  res.status(201).json(newLead);
});

// PUT /:id — atualiza dados + diagnóstico
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const b = req.body || {};
  db.prepare(`
    UPDATE crm_leads SET
      name = ?, source = ?, responsible_user_id = ?, temperature = ?,
      potential_value = ?, automations_enabled = ?, notes = ?
    WHERE id = ?
  `).run(
    b.name ?? lead.name,
    b.source ?? lead.source,
    b.responsible_user_id ?? lead.responsible_user_id,
    b.temperature ?? lead.temperature,
    b.potential_value ?? lead.potential_value,
    b.automations_enabled ?? lead.automations_enabled,
    b.notes ?? lead.notes,
    lead.id
  );

  if (b.event) {
    const e = b.event;
    const cur = db.prepare('SELECT * FROM crm_lead_event WHERE lead_id = ?').get(lead.id);
    if (cur) {
      db.prepare(`
        UPDATE crm_lead_event SET
          event_name = ?, city = ?, event_date = ?, event_type = ?,
          expected_audience = ?, sells_tickets = ?, ticket_platform = ?,
          runs_paid_ads = ?, has_creative_team = ?, main_difficulty = ?
        WHERE lead_id = ?
      `).run(
        e.event_name ?? cur.event_name, e.city ?? cur.city, e.event_date ?? cur.event_date,
        e.event_type ?? cur.event_type, e.expected_audience ?? cur.expected_audience,
        e.sells_tickets ?? cur.sells_tickets, e.ticket_platform ?? cur.ticket_platform,
        e.runs_paid_ads ?? cur.runs_paid_ads, e.has_creative_team ?? cur.has_creative_team,
        e.main_difficulty ?? cur.main_difficulty, lead.id
      );
    } else {
      db.prepare(`
        INSERT INTO crm_lead_event
          (lead_id, event_name, city, event_date, event_type, expected_audience,
           sells_tickets, ticket_platform, runs_paid_ads, has_creative_team, main_difficulty)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        lead.id, e.event_name || null, e.city || null, e.event_date || null, e.event_type || null,
        e.expected_audience || null, e.sells_tickets || null, e.ticket_platform || null,
        e.runs_paid_ads || null, e.has_creative_team || null, e.main_difficulty || null
      );
    }
  }

  res.json(db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(lead.id));
});

// PUT /:id/stage — move de etapa (dispara automações)
router.put('/:id/stage', (req, res) => {
  const userId = Number(req.user.sub);
  const { stage, position } = req.body || {};
  try {
    const before = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(Number(req.params.id), userId);
    const lead = leadService.moveStage(Number(req.params.id), userId, stage, position ?? null);
    logAudit({ userId, entityType: 'crm_lead', entityId: lead.id, action: 'stage_change', before: { stage: before?.stage }, after: { stage: lead.stage }, ip: req.ip });
    dispatchWebhook(userId, 'stage.changed', { id: lead.id, from: before?.stage, to: lead.stage }).catch(() => {});
    res.json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /:id/tags — substitui tags
router.put('/:id/tags', (req, res) => {
  const userId = Number(req.user.sub);
  const { tag_ids = [] } = req.body || {};
  const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  db.prepare('DELETE FROM crm_lead_tags WHERE lead_id = ?').run(lead.id);
  const stmt = db.prepare('INSERT OR IGNORE INTO crm_lead_tags (lead_id, tag_id) VALUES (?, ?)');
  for (const tid of tag_ids) stmt.run(lead.id, tid);
  res.json(loadTagsForLead(lead.id));
});

// POST /:id/message — envia mensagem ad-hoc
router.post('/:id/message', async (req, res) => {
  const userId = Number(req.user.sub);
  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Mensagem vazia' });
  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  if (getStatus(userId) !== 'connected') return res.status(400).json({ error: 'WhatsApp não conectado' });
  try {
    const result = await sendMessage(userId, lead.phone, message);
    autoLead.logOutboundMessage(lead.id, message, result?.msgId || null, null);
    res.json({ ok: true, msg_id: result?.msgId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/close — marca como fechado
router.post('/:id/close', (req, res) => {
  const userId = Number(req.user.sub);
  const { value, service, payment_terms, start_date, notes } = req.body || {};
  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE crm_leads SET stage = 'fechado', closed_value = ?, stage_changed_at = ?, notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(value || null, now, notes || null, lead.id);
  if (service || payment_terms || start_date) {
    db.prepare(`INSERT INTO crm_message_log (lead_id, direction, body)
                VALUES (?, 'system', ?)`).run(lead.id,
      `Fechado: ${service || ''} | Pagamento: ${payment_terms || ''} | Início: ${start_date || ''}`);
  }
  automationRules.scheduleClosedWelcome(lead.id);
  // Salva learning para o AI scorer aprender com negócios ganhos
  const aiRow = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(lead.id);
  if (aiRow) {
    const lesson = `Lead fechado com R$${value || 0}. Score era ${aiRow.score}/100. Estágio antes do fechamento: ${lead.stage}.`;
    aiScorer.saveLeadLearning(lead.id, userId, 'won', lesson);
  }
  // Onda 3: gera coaching card de vitória em background
  coaching.generateWinCoaching(lead.id, userId).catch(() => {});
  // Onda 5: registra comissão
  const freshLead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(lead.id);
  commission.maybeCreateCommission(freshLead, value);
  res.json(freshLead);
});

// POST /:id/lose — marca como perdido
router.post('/:id/lose', (req, res) => {
  const userId = Number(req.user.sub);
  const { reason, detail } = req.body || {};
  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE crm_leads SET stage = 'perdido', loss_reason = ?, loss_reason_detail = ?, stage_changed_at = ?
    WHERE id = ?
  `).run(reason || null, detail || null, now, lead.id);
  db.prepare("UPDATE crm_followups SET status='canceled' WHERE lead_id = ? AND status = 'pending'").run(lead.id);
  // Salva learning para o AI scorer aprender com negócios perdidos
  const aiRow = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(lead.id);
  if (aiRow) {
    const lesson = `Lead perdido. Motivo: ${reason || 'não informado'}. Score era ${aiRow.score}/100. Resumo: ${aiRow.conversation_summary || '—'}`;
    aiScorer.saveLeadLearning(lead.id, userId, 'lost', lesson);
  }
  // Onda 3: gera coaching card de aprendizado em background
  coaching.generateLossCoaching(lead.id, userId).catch(() => {});
  res.json(db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(lead.id));
});

// POST /:id/ai-refresh — força reanálise do lead pela IA
router.post('/:id/ai-refresh', async (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.id);
  const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'ANTHROPIC_API_KEY não configurada' });
  try {
    const ai = await aiScorer.scoreLead(leadId, userId);
    res.json({ ok: true, ai });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  db.prepare('DELETE FROM crm_leads WHERE id = ?').run(lead.id);
  res.json({ ok: true });
});

// ─── F5: Adormecer com Graça ─────────────────────────────────────────────────
// POST /:id/snooze — adormece o lead até uma data futura
router.post('/:id/snooze', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.id);
  const { until, reason } = req.body;
  if (!until) return res.status(400).json({ error: 'Campo "until" (data) é obrigatório' });

  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const untilDate = new Date(until);
  if (isNaN(untilDate.getTime()) || untilDate <= new Date()) {
    return res.status(400).json({ error: 'Data inválida — deve ser futura' });
  }

  db.prepare(`
    UPDATE crm_leads
    SET dormant_until = ?,
        cooling_reason = ?,
        stage_changed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(until, reason || 'Adormecido manualmente', leadId);

  res.json({ ok: true, dormant_until: until });
});

// POST /:id/wake — acorda um lead adormecido manualmente
router.post('/:id/wake', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.id);
  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  db.prepare(`UPDATE crm_leads SET dormant_until = NULL, cooling_reason = NULL WHERE id = ?`).run(leadId);
  res.json({ ok: true });
});

// ─── F2: Re-engajamento Inteligente ─────────────────────────────────────────
// POST /:id/suggest-reengagement — IA sugere mensagem personalizada única
router.post('/:id/suggest-reengagement', async (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.id);

  const lead = db.prepare(`
    SELECT l.*,
      (SELECT score FROM crm_lead_ai WHERE lead_id = l.id)          AS ai_score,
      (SELECT conversation_summary FROM crm_lead_ai WHERE lead_id = l.id) AS ai_summary
    FROM crm_leads l WHERE l.id = ? AND l.user_id = ?
  `).get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  // Pega histórico de mensagens + tentativas anteriores de reengajamento
  const messages = db.prepare(`
    SELECT direction, body, occurred_at FROM crm_message_log
    WHERE lead_id = ? ORDER BY occurred_at DESC LIMIT 10
  `).all(leadId).reverse();

  const prevAttempts = db.prepare(`
    SELECT message_sent, sent_at FROM crm_reengagement_attempts
    WHERE lead_id = ? ORDER BY sent_at DESC LIMIT 3
  `).all(leadId);

  // Fallback determinístico
  const fallback = () => {
    const firstName = lead.name?.split(' ')[0] || '';
    const stage = lead.stage;
    const templates = {
      proposta_enviada:    `Oi ${firstName}! Aquela proposta que te enviei ainda faz sentido pra você? Posso ajustar alguma coisa se precisar.`,
      analisando_proposta: `Oi ${firstName}! Você teve chance de analisar o que te enviei? Se tiver alguma dúvida, pode mandar.`,
      negociacao:          `Oi ${firstName}! Como ficou a conversa interna por aí? Ainda faz sentido a gente seguir em frente?`,
      reuniao_realizada:   `Oi ${firstName}! Passou um tempinho desde nossa conversa — ainda está pensando no que discutimos?`,
      default:             `Oi ${firstName}! Tudo bem por aí? Estava pensando em você, queria saber se posso te ajudar com algo.`,
    };
    return { message: templates[stage] || templates.default, source: 'fallback' };
  };

  if (!process.env.ANTHROPIC_API_KEY) return res.json(fallback());

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msgLines = messages.map(m => `[${m.direction === 'in' ? 'LEAD' : 'VOCÊ'}] ${m.body}`).join('\n');
    const prevLines = prevAttempts.map((a, i) => `Tentativa ${i + 1} (${new Date(a.sent_at).toLocaleDateString('pt-BR')}): "${a.message_sent}"`).join('\n');

    const prompt = `Você é copiloto comercial de um vendedor de marketing para eventos.
Precisa criar UMA mensagem de reengajamento altamente personalizada para este lead.

LEAD: ${lead.name || 'sem nome'} | Estágio: ${lead.stage} | Temperatura: ${lead.temperature}
Evento: ${lead.event_name || 'não informado'} | Cidade: ${lead.city || 'não informado'}
Valor potencial: R$ ${lead.potential_value || '?'} | Dias sem resposta: ${lead.last_interaction_at ? Math.floor((Date.now() - new Date(lead.last_interaction_at).getTime()) / 86400000) : '?'}

ÚLTIMAS MENSAGENS:
${msgLines || '(sem histórico)'}

${prevAttempts.length ? `TENTATIVAS ANTERIORES (NÃO REPITA ESSES PADRÕES):\n${prevLines}` : ''}

${lead.ai_summary ? `RESUMO IA: ${lead.ai_summary}` : ''}

REGRAS:
- Mensagem CURTA (2-4 linhas máx), tom natural BR, nada de "espero que esteja bem"
- DIFERENTE das tentativas anteriores
- Mencione algo específico do contexto (evento, proposta, conversa) se houver
- NÃO seja ansioso, seja confiante e curioso
- Finalize com uma pergunta aberta ou gancho

Retorne APENAS a mensagem, sem JSON, sem aspas, pronta pra enviar.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const message = response.content?.[0]?.text?.trim() || fallback().message;
    res.json({ message, source: 'ai' });
  } catch (e) {
    console.warn('[ReengagementAI] Falhou, usando fallback:', e.message);
    res.json(fallback());
  }
});

// ── GET /:id/timeline — Onda 9: linha do tempo unificada ──────────────
router.get('/:id/timeline', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.id);

  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const events = [];

  // 1. Criação do lead
  events.push({
    type: 'created',
    at:   lead.first_contact_at || lead.stage_changed_at,
    data: { stage: lead.stage, source: lead.source, name: lead.name, phone: lead.phone },
  });

  // 2. Mensagens (in / out / system)
  const messages = db.prepare(`
    SELECT * FROM crm_message_log WHERE lead_id = ? ORDER BY occurred_at ASC
  `).all(leadId);
  for (const m of messages) {
    events.push({
      type: m.direction === 'in'     ? 'message_in'
          : m.direction === 'system' ? 'note'
          : 'message_out',
      at:   m.occurred_at,
      data: {
        body:          m.body,
        auto_response: m.auto_response,
        followup_id:   m.followup_id,
        wa_msg_id:     m.wa_msg_id,
      },
    });
  }

  // 3. Reuniões
  try {
    const meetings = db.prepare(`
      SELECT * FROM crm_meetings WHERE lead_id = ? ORDER BY meeting_at ASC
    `).all(leadId);
    for (const m of meetings) {
      events.push({
        type: 'meeting',
        at:   m.meeting_at,
        data: { id: m.id, format: m.format, status: m.status, link: m.link, notes: m.notes },
      });
    }
  } catch {}

  // 4. Propostas
  try {
    const proposals = db.prepare(`
      SELECT * FROM crm_proposals WHERE lead_id = ? ORDER BY created_at ASC
    `).all(leadId);
    for (const p of proposals) {
      events.push({
        type: 'proposal',
        at:   p.created_at,
        data: { id: p.id, title: p.service, value: p.amount, status: p.status, due_date: p.due_date },
      });
      if (p.status === 'accepted' && p.sent_at) {
        events.push({ type: 'proposal_accepted', at: p.sent_at, data: { id: p.id, value: p.amount } });
      }
    }
  } catch {}

  // 5. Follow-ups
  try {
    const followups = db.prepare(`
      SELECT * FROM crm_followups WHERE lead_id = ? ORDER BY scheduled_at ASC
    `).all(leadId);
    for (const f of followups) {
      events.push({
        type: 'followup',
        at:   f.status === 'sent' ? (f.sent_at || f.scheduled_at) : f.scheduled_at,
        data: { id: f.id, message: f.message?.slice(0, 120), status: f.status, automation_type: f.automation_type },
      });
    }
  } catch {}

  // 6. Tarefas
  try {
    const tasks = db.prepare(`
      SELECT * FROM crm_tasks WHERE lead_id = ? ORDER BY created_at ASC
    `).all(leadId);
    for (const t of tasks) {
      events.push({
        type: 'task',
        at:   t.created_at,
        data: { id: t.id, title: t.title, done: !!t.done_at, done_at: t.done_at, due_date: t.due_date },
      });
    }
  } catch {}

  // 7. AI score (snapshot atual)
  try {
    const ai = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(leadId);
    if (ai?.last_updated_at) {
      events.push({
        type: 'ai_score',
        at:   ai.last_updated_at,
        data: { score: ai.score, score_reason: ai.score_reason, next_step: ai.next_step_text, summary: ai.conversation_summary },
      });
    }
  } catch {}

  // 8. Tickfy syncs
  try {
    const syncs = db.prepare(`
      SELECT s.*, ts.trn_id, ts.comprador_email
      FROM crm_tickfy_lead_sync s
      JOIN tickfy_sales ts ON ts.id = s.sale_id AND ts.user_id = s.user_id
      WHERE s.lead_id = ? AND s.user_id = ?
      ORDER BY s.synced_at ASC
    `).all(leadId, userId);
    for (const s of syncs) {
      events.push({
        type: 'tickfy',
        at:   s.synced_at,
        data: { evento: s.evento, valor: s.valor, status_code: s.status_code, action: s.action },
      });
    }
  } catch {}

  // 9. Mudança de estágio (se fechado ou perdido — registrado em stage_changed_at)
  if ((lead.stage === 'fechado' || lead.stage === 'perdido') && lead.stage_changed_at) {
    events.push({
      type: lead.stage === 'fechado' ? 'closed' : 'lost',
      at:   lead.stage_changed_at,
      data: {
        closed_value: lead.closed_value,
        loss_reason:  lead.loss_reason,
        loss_detail:  lead.loss_reason_detail,
      },
    });
  }

  // 10. Hot recovery
  if (lead.hot_recovery_at) {
    events.push({
      type: 'hot_recovery',
      at:   lead.hot_recovery_at,
      data: {},
    });
  }

  // Ordena cronologicamente e filtra eventos sem data
  const sorted = events
    .filter(e => e.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  // Dados extras do lead para o header
  let tags = [];
  try {
    tags = db.prepare(`
      SELECT t.id, t.name, t.color FROM crm_tags t
      JOIN crm_lead_tags lt ON lt.tag_id = t.id
      WHERE lt.lead_id = ?
    `).all(leadId);
  } catch {}

  let ai_data = null;
  try { ai_data = db.prepare('SELECT * FROM crm_lead_ai WHERE lead_id = ?').get(leadId); } catch {}

  let responsible = null;
  try {
    if (lead.responsible_user_id) {
      responsible = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(lead.responsible_user_id);
    }
  } catch {}

  res.json({ lead, tags, ai_data, responsible, timeline: sorted });
});

module.exports = router;
