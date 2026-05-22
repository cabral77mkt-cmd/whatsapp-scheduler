/**
 * Public API v1 — authenticated via API Key (Bearer token)
 *
 * Base: /api/v1
 *
 * Endpoints:
 *   GET  /leads              — list leads (paginated)
 *   GET  /leads/:id          — single lead
 *   POST /leads              — create lead
 *   POST /leads/:id/stage    — change stage
 *   GET  /pipeline           — aggregate counts per stage
 *   POST /inbound            — generic inbound webhook (create/update lead from external source)
 */
const express  = require('express');
const router   = express.Router();
const db       = require('../../database');
const { authenticateApiKey } = require('../api_keys');
const { dispatch } = require('../../webhooks/outbound');
const { logAudit }  = require('../../middleware/audit');

// All v1 routes use API key auth
router.use(authenticateApiKey);

const VALID_STAGES = [
  'entrou_contato','conversando','diagnostico','reuniao_agendada',
  'reuniao_realizada','aguardando_proposta','proposta_enviada',
  'analisando_proposta','negociacao','fechado','perdido',
];

/* ── GET /leads ── */
router.get('/leads', (req, res) => {
  const { stage, q, page = 1, limit = 50 } = req.query;
  const conditions = ['l.user_id = ?'];
  const params     = [req.user.sub];

  if (stage) { conditions.push('l.stage = ?'); params.push(stage); }
  if (q) {
    conditions.push('(l.name LIKE ? OR l.phone LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const where  = 'WHERE ' + conditions.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);
  const total  = db.prepare(`SELECT COUNT(*) as n FROM crm_leads l ${where}`).get(...params)?.n || 0;
  const rows   = db.prepare(`
    SELECT l.id, l.name, l.phone, l.stage, l.temperature, l.source,
           l.created_at, l.last_interaction_at AS updated_at, e.event_name, e.city
    FROM crm_leads l
    LEFT JOIN crm_lead_event e ON e.lead_id = l.id
    ${where}
    ORDER BY l.last_interaction_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ total, page: Number(page), limit: Number(limit), leads: rows });
});

/* ── GET /leads/:id ── */
router.get('/leads/:id', (req, res) => {
  const lead = db.prepare(`
    SELECT l.*, e.event_name, e.city, e.event_date
    FROM crm_leads l
    LEFT JOIN crm_lead_event e ON e.lead_id = l.id
    WHERE l.id = ? AND l.user_id = ?
  `).get(Number(req.params.id), req.user.sub);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  res.json(lead);
});

/* ── POST /leads ── */
router.post('/leads', (req, res) => {
  const { name, phone, stage = 'entrou_contato', source = 'api_v1', notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });

  const info = db.prepare(`
    INSERT INTO crm_leads (user_id, name, phone, stage, source, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Number(req.user.sub), name || null, phone, stage, source, notes || null);

  const newLead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(info.lastInsertRowid);

  logAudit({ userId: req.user.sub, entityType: 'crm_lead', entityId: newLead.id, action: 'create', after: newLead, ip: req.ip });
  dispatch(Number(req.user.sub), 'lead.created', { id: newLead.id, name: newLead.name, phone: newLead.phone, stage: newLead.stage }).catch(() => {});

  res.status(201).json(newLead);
});

/* ── POST /leads/:id/stage ── */
router.post('/leads/:id/stage', (req, res) => {
  const { stage } = req.body;
  if (!stage || !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: 'stage inválido', valid: VALID_STAGES });
  }
  const before = db.prepare('SELECT * FROM crm_leads WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.sub);
  if (!before) return res.status(404).json({ error: 'Lead não encontrado' });

  db.prepare('UPDATE crm_leads SET stage = ?, stage_changed_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(stage, before.id);
  const after = { ...before, stage };

  logAudit({ userId: req.user.sub, entityType: 'crm_lead', entityId: before.id, action: 'stage_change', before, after, ip: req.ip });
  dispatch(Number(req.user.sub), 'stage.changed', { id: before.id, from: before.stage, to: stage }).catch(() => {});

  res.json({ ok: true, stage });
});

/* ── GET /pipeline ── */
router.get('/pipeline', (req, res) => {
  const rows = db.prepare(`
    SELECT stage, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total_value
    FROM crm_leads l
    LEFT JOIN crm_proposals p ON p.lead_id = l.id AND p.status = 'sent'
    WHERE l.user_id = ?
    GROUP BY l.stage
  `).all(req.user.sub);
  res.json(rows);
});

/* ── POST /inbound — generic webhook receiver ── */
router.post('/inbound', (req, res) => {
  const { name, phone, source = 'webhook', stage = 'entrou_contato', event_name, notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });

  // Upsert by phone + user_id
  const existing = db.prepare('SELECT id FROM crm_leads WHERE user_id = ? AND phone = ?')
    .get(req.user.sub, phone);

  if (existing) {
    db.prepare('UPDATE crm_leads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    return res.json({ id: existing.id, action: 'existing' });
  }

  const info = db.prepare(`
    INSERT INTO crm_leads (user_id, name, phone, stage, source, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Number(req.user.sub), name || phone, phone, stage, source, notes || null);

  if (event_name) {
    db.prepare(`INSERT OR IGNORE INTO crm_lead_event (lead_id, event_name) VALUES (?, ?)`)
      .run(info.lastInsertRowid, event_name);
  }

  dispatch(Number(req.user.sub), 'lead.created', { id: info.lastInsertRowid, name, phone, stage }).catch(() => {});

  res.status(201).json({ id: info.lastInsertRowid, action: 'created' });
});

module.exports = router;
