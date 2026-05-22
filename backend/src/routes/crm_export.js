const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { ROLE_LEVELS } = require('../middleware/roles');

function canSeeAll(req) {
  if (req.user?.isAdmin) return true;
  return (ROLE_LEVELS[req.user?.role || 'seller'] || 1) >= ROLE_LEVELS.manager;
}

/* ── CSV helpers ───────────────────────────────────────────────── */
function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function toCsv(cols, rows) {
  const header = cols.map(c => c.label).join(',');
  const body   = rows.map(r => cols.map(c => esc(r[c.key])).join(',')).join('\r\n');
  return '﻿' + header + '\r\n' + body; // BOM para Excel
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ── GET /leads (versão melhorada com filtros e responsável) ─────── */
router.get('/leads', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { stage, temperature, responsible_user_id, date_from, date_to, source } = req.query;

    let sql = `
      SELECT l.id, l.name, l.phone, l.stage, l.temperature, l.source,
             l.potential_value, l.closed_value, l.loss_reason,
             u.username       AS responsible,
             l.first_contact_at, l.last_interaction_at, l.stage_changed_at,
             l.notes,
             (SELECT event_name FROM crm_lead_event WHERE lead_id = l.id LIMIT 1) AS event_name,
             (SELECT city      FROM crm_lead_event WHERE lead_id = l.id LIMIT 1) AS city,
             ai.score         AS ai_score
      FROM crm_leads l
      LEFT JOIN users u         ON u.id = l.user_id
      LEFT JOIN crm_lead_ai ai  ON ai.lead_id = l.id
      WHERE l.org_id = ?
    `;
    const params = [orgId];

    if (!all)                { sql += ' AND l.user_id = ?';   params.push(userId); }
    if (stage)               { sql += ' AND l.stage = ?';     params.push(stage); }
    if (temperature)         { sql += ' AND l.temperature = ?'; params.push(temperature); }
    if (responsible_user_id) { sql += ' AND l.user_id = ?';   params.push(Number(responsible_user_id)); }
    if (source)              { sql += ' AND l.source = ?';    params.push(source); }
    if (date_from)           { sql += ' AND l.created_at >= ?'; params.push(date_from); }
    if (date_to)             { sql += ' AND l.created_at <= ?'; params.push(date_to + ' 23:59:59'); }
    sql += ' ORDER BY l.created_at DESC';

    const rows = db.prepare(sql).all(...params);

    const cols = [
      { key: 'id',                 label: 'ID' },
      { key: 'name',               label: 'Nome' },
      { key: 'phone',              label: 'Telefone' },
      { key: 'stage',              label: 'Etapa' },
      { key: 'temperature',        label: 'Temperatura' },
      { key: 'source',             label: 'Origem' },
      { key: 'responsible',        label: 'Responsável' },
      { key: 'potential_value',    label: 'Valor Potencial (R$)' },
      { key: 'closed_value',       label: 'Valor Fechado (R$)' },
      { key: 'loss_reason',        label: 'Motivo Perda' },
      { key: 'ai_score',           label: 'Score IA' },
      { key: 'event_name',         label: 'Evento' },
      { key: 'city',               label: 'Cidade' },
      { key: 'first_contact_at',   label: 'Primeiro Contato' },
      { key: 'last_interaction_at',label: 'Última Interação' },
      { key: 'stage_changed_at',   label: 'Mudança de Etapa' },
      { key: 'notes',              label: 'Observações' },
    ];

    sendCsv(res, `leads-${today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /pipeline ─────────────────────────────────────────────── */
router.get('/pipeline', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;

    const where = all ? 'WHERE org_id = ?' : 'WHERE org_id = ? AND user_id = ?';
    const params = all ? [orgId] : [orgId, userId];

    const rows = db.prepare(`
      SELECT stage,
             COUNT(*) AS total_leads,
             COALESCE(SUM(potential_value), 0) AS total_valor_potencial,
             COALESCE(SUM(CASE WHEN stage = 'fechado' THEN closed_value ELSE 0 END), 0) AS total_fechado,
             ROUND(AVG(potential_value), 2) AS ticket_medio
      FROM crm_leads
      ${where}
      GROUP BY stage
      ORDER BY CASE stage
        WHEN 'entrou_contato'   THEN 1
        WHEN 'qualificando'     THEN 2
        WHEN 'proposta_enviada' THEN 3
        WHEN 'negociando'       THEN 4
        WHEN 'fechado'          THEN 5
        WHEN 'perdido'          THEN 6
        ELSE 7
      END
    `).all(...params);

    const cols = [
      { key: 'stage',                    label: 'Etapa' },
      { key: 'total_leads',              label: 'Total Leads' },
      { key: 'total_valor_potencial',    label: 'Valor Potencial (R$)' },
      { key: 'ticket_medio',             label: 'Ticket Médio (R$)' },
      { key: 'total_fechado',            label: 'Valor Fechado (R$)' },
    ];

    sendCsv(res, `pipeline-${today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /commissions ──────────────────────────────────────────── */
router.get('/commissions', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { date_from, date_to, status } = req.query;

    let sql = `
      SELECT c.id, u.username AS vendedor, l.name AS lead_nome, l.phone AS lead_telefone,
             l.stage, c.commission_value AS comissao, c.percentage AS percentual,
             c.status, c.deal_value AS valor_base, c.paid_at, c.created_at
      FROM crm_commissions c
      JOIN crm_leads l ON l.id = c.lead_id
      JOIN users u     ON u.id = c.user_id
      WHERE c.org_id = ?
    `;
    const params = [orgId];

    if (!all)    { sql += ' AND c.user_id = ?'; params.push(userId); }
    if (status)  { sql += ' AND c.status = ?';  params.push(status); }
    if (date_from){ sql += ' AND c.created_at >= ?'; params.push(date_from); }
    if (date_to)  { sql += ' AND c.created_at <= ?'; params.push(date_to + ' 23:59:59'); }
    sql += ' ORDER BY c.created_at DESC';

    const rows = db.prepare(sql).all(...params);

    const cols = [
      { key: 'id',             label: 'ID' },
      { key: 'vendedor',       label: 'Vendedor' },
      { key: 'lead_nome',      label: 'Lead' },
      { key: 'lead_telefone',  label: 'Telefone' },
      { key: 'stage',          label: 'Etapa do Lead' },
      { key: 'valor_base',     label: 'Valor Base (R$)' },
      { key: 'percentual',     label: '% Comissão' },
      { key: 'comissao',       label: 'Comissão (R$)' },
      { key: 'status',         label: 'Status' },
      { key: 'paid_at',        label: 'Pago em' },
      { key: 'created_at',     label: 'Criado em' },
    ];

    sendCsv(res, `comissoes-${today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /meetings ─────────────────────────────────────────────── */
router.get('/meetings', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { date_from, date_to, status } = req.query;

    // crm_meetings não tem user_id/org_id direto — join via crm_leads
    let sql = `
      SELECT m.id, u.username AS responsável, l.name AS lead_nome, l.phone,
             m.meeting_at AS scheduled_at, m.format AS meeting_type, m.link AS location,
             m.status, m.notes, m.created_at
      FROM crm_meetings m
      JOIN crm_leads l ON l.id = m.lead_id
      JOIN users u     ON u.id = l.user_id
      WHERE l.org_id = ?
    `;
    const params = [orgId];

    if (!all)     { sql += ' AND l.user_id = ?';       params.push(userId); }
    if (status)   { sql += ' AND m.status = ?';        params.push(status); }
    if (date_from){ sql += ' AND m.meeting_at >= ?';   params.push(date_from); }
    if (date_to)  { sql += ' AND m.meeting_at <= ?';   params.push(date_to + ' 23:59:59'); }
    sql += ' ORDER BY m.meeting_at DESC';

    const rows = db.prepare(sql).all(...params);

    const cols = [
      { key: 'id',           label: 'ID' },
      { key: 'responsável',  label: 'Responsável' },
      { key: 'lead_nome',    label: 'Lead' },
      { key: 'phone',        label: 'Telefone' },
      { key: 'scheduled_at', label: 'Agendada Para' },
      { key: 'meeting_type', label: 'Formato' },
      { key: 'location',     label: 'Link' },
      { key: 'status',       label: 'Status' },
      { key: 'notes',        label: 'Notas' },
      { key: 'created_at',   label: 'Criado em' },
    ];

    sendCsv(res, `reunioes-${today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /proposals ────────────────────────────────────────────── */
router.get('/proposals', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { date_from, date_to, status } = req.query;

    // crm_proposals não tem user_id direto — join via crm_leads
    let sql = `
      SELECT p.id, u.username AS responsável, l.name AS lead_nome, l.phone,
             p.service AS titulo, p.amount, p.negotiated_amount, p.status,
             p.due_date, p.notes, p.created_at
      FROM crm_proposals p
      JOIN crm_leads l ON l.id = p.lead_id
      JOIN users u     ON u.id = l.user_id
      WHERE p.org_id = ?
    `;
    const params = [orgId];

    if (!all)     { sql += ' AND p.user_id = ?';    params.push(userId); }
    if (status)   { sql += ' AND p.status = ?';     params.push(status); }
    if (date_from){ sql += ' AND p.created_at >= ?'; params.push(date_from); }
    if (date_to)  { sql += ' AND p.created_at <= ?'; params.push(date_to + ' 23:59:59'); }
    sql += ' ORDER BY p.created_at DESC';

    const rows = db.prepare(sql).all(...params);

    const cols = [
      { key: 'id',                 label: 'ID' },
      { key: 'responsável',        label: 'Responsável' },
      { key: 'lead_nome',          label: 'Lead' },
      { key: 'phone',              label: 'Telefone' },
      { key: 'titulo',             label: 'Serviço' },
      { key: 'amount',             label: 'Valor (R$)' },
      { key: 'negotiated_amount',  label: 'Valor Negociado (R$)' },
      { key: 'status',             label: 'Status' },
      { key: 'due_date',           label: 'Validade' },
      { key: 'notes',              label: 'Notas' },
      { key: 'created_at',         label: 'Criado em' },
    ];

    sendCsv(res, `propostas-${today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /followups ────────────────────────────────────────────── */
router.get('/followups', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { date_from, date_to, status } = req.query;

    let sql = `
      SELECT f.id, u.username AS responsável, l.name AS lead_nome, l.phone,
             f.scheduled_at, f.sent_at AS completed_at, f.status, f.channel, f.notes,
             f.created_at
      FROM crm_followups f
      JOIN crm_leads l ON l.id = f.lead_id
      JOIN users u     ON u.id = f.user_id
      WHERE f.org_id = ?
    `;
    const params = [orgId];

    if (!all)     { sql += ' AND f.user_id = ?';       params.push(userId); }
    if (status)   { sql += ' AND f.status = ?';        params.push(status); }
    if (date_from){ sql += ' AND f.scheduled_at >= ?'; params.push(date_from); }
    if (date_to)  { sql += ' AND f.scheduled_at <= ?'; params.push(date_to + ' 23:59:59'); }
    sql += ' ORDER BY f.scheduled_at DESC';

    const rows = db.prepare(sql).all(...params);

    const cols = [
      { key: 'id',           label: 'ID' },
      { key: 'responsável',  label: 'Responsável' },
      { key: 'lead_nome',    label: 'Lead' },
      { key: 'phone',        label: 'Telefone' },
      { key: 'scheduled_at', label: 'Agendado Para' },
      { key: 'completed_at', label: 'Concluído em' },
      { key: 'channel',      label: 'Canal' },
      { key: 'status',       label: 'Status' },
      { key: 'notes',        label: 'Notas' },
      { key: 'created_at',   label: 'Criado em' },
    ];

    sendCsv(res, `followups-${today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /goals ────────────────────────────────────────────────── */
router.get('/goals', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { period } = req.query;

    let sql = `
      SELECT g.period, u.username AS vendedor,
             g.target_revenue, g.target_deals, g.target_meetings, g.target_followups,
             g.target_new_leads
      FROM crm_personal_goals g
      JOIN users u ON u.id = g.user_id
      WHERE g.org_id = ?
    `;
    const params = [orgId];

    if (!all)   { sql += ' AND g.user_id = ?'; params.push(userId); }
    if (period) { sql += ' AND g.period = ?';  params.push(period); }
    sql += ' ORDER BY g.period DESC, u.username';

    const goals = db.prepare(sql).all(...params);

    // Para cada goal, calcular progresso atual
    function calcActual(gUserId, gPeriod) {
      const monthStart = gPeriod + '-01';
      const [y, m] = gPeriod.split('-').map(Number);
      const next   = new Date(y, m, 1).toISOString().slice(0, 10);
      try {
        const deals = db.prepare(`
          SELECT COUNT(*) AS deals, COALESCE(SUM(closed_value), 0) AS revenue
          FROM crm_leads WHERE user_id = ? AND stage = 'fechado'
          AND stage_changed_at >= ? AND stage_changed_at < ?
        `).get(gUserId, monthStart, next) || {};
        const meetings = db.prepare(`
          SELECT COUNT(*) AS c FROM crm_meetings m
          JOIN crm_leads l ON l.id = m.lead_id
          WHERE l.user_id = ? AND m.status IN ('done','realizada') AND m.meeting_at >= ? AND m.meeting_at < ?
        `).get(gUserId, monthStart, next)?.c || 0;
        const followups = db.prepare(`
          SELECT COUNT(*) AS c FROM crm_followups
          WHERE user_id = ? AND status = 'sent' AND sent_at >= ? AND sent_at < ?
        `).get(gUserId, monthStart, next)?.c || 0;
        const newLeads = db.prepare(`
          SELECT COUNT(*) AS c FROM crm_leads
          WHERE user_id = ? AND created_at >= ? AND created_at < ?
        `).get(gUserId, monthStart, next)?.c || 0;
        return { revenue: deals.revenue || 0, deals: deals.deals || 0, meetings, followups, new_leads: newLeads };
      } catch { return { revenue: 0, deals: 0, meetings: 0, followups: 0, new_leads: 0 }; }
    }

    // Enriquecer com userId para o cálculo
    const userMap = {};
    if (all) {
      db.prepare('SELECT id, username FROM users').all().forEach(u => { userMap[u.username] = u.id; });
    }

    const rows = goals.map(g => {
      const uid = all ? (userMap[g.vendedor] || userId) : userId;
      const actual = calcActual(uid, g.period);
      return {
        period:          g.period,
        vendedor:        g.vendedor,
        meta_receita:    g.target_revenue,
        real_receita:    actual.revenue,
        pct_receita:     g.target_revenue ? Math.round((actual.revenue / g.target_revenue) * 100) : 0,
        meta_deals:      g.target_deals,
        real_deals:      actual.deals,
        meta_reunioes:   g.target_meetings,
        real_reunioes:   actual.meetings,
        meta_followups:  g.target_followups,
        real_followups:  actual.followups,
        meta_novos_leads: g.target_new_leads,
        real_novos_leads: actual.new_leads,
      };
    });

    const cols = [
      { key: 'period',           label: 'Período' },
      { key: 'vendedor',         label: 'Vendedor' },
      { key: 'meta_receita',     label: 'Meta Receita (R$)' },
      { key: 'real_receita',     label: 'Real Receita (R$)' },
      { key: 'pct_receita',      label: '% Receita' },
      { key: 'meta_deals',       label: 'Meta Fechamentos' },
      { key: 'real_deals',       label: 'Real Fechamentos' },
      { key: 'meta_reunioes',    label: 'Meta Reuniões' },
      { key: 'real_reunioes',    label: 'Real Reuniões' },
      { key: 'meta_followups',   label: 'Meta Follow-ups' },
      { key: 'real_followups',   label: 'Real Follow-ups' },
      { key: 'meta_novos_leads', label: 'Meta Novos Leads' },
      { key: 'real_novos_leads', label: 'Real Novos Leads' },
    ];

    sendCsv(res, `metas-${period || today()}.csv`, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /activity ─────────────────────────────────────────────── */
router.get('/activity', (req, res) => {
  try {
    const userId = Number(req.user.sub);
    const all    = canSeeAll(req);
    const orgId  = req.user.orgId || 1;
    const { date_from, date_to } = req.query;

    const df = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const dt = date_to   || today();

    // Resumo de atividade por vendedor
    const where = all ? 'u.org_id = ?' : 'u.org_id = ? AND u.id = ?';
    const params = all ? [orgId] : [orgId, userId];

    const users = db.prepare(`SELECT id, username FROM users WHERE ${where} ORDER BY username`).all(...params);

    const rows = users.map(u => {
      // crm_message_log não tem user_id direto — join via crm_leads
      const msgs = db.prepare(`
        SELECT COUNT(*) AS c FROM crm_message_log ml
        JOIN crm_leads l ON l.id = ml.lead_id
        WHERE l.user_id = ? AND ml.direction = 'out' AND ml.occurred_at >= ? AND ml.occurred_at <= ?
      `).get(u.id, df, dt + ' 23:59:59')?.c || 0;
      // crm_meetings não tem user_id direto — join via crm_leads
      const meetings = db.prepare(`
        SELECT COUNT(*) AS c FROM crm_meetings m
        JOIN crm_leads l ON l.id = m.lead_id
        WHERE l.user_id = ? AND m.status IN ('done','realizada') AND m.meeting_at >= ? AND m.meeting_at <= ?
      `).get(u.id, df, dt + ' 23:59:59')?.c || 0;
      const followups = db.prepare(`
        SELECT COUNT(*) AS c FROM crm_followups
        WHERE user_id = ? AND status = 'sent' AND sent_at >= ? AND sent_at <= ?
      `).get(u.id, df, dt + ' 23:59:59')?.c || 0;
      // conta leads que tiveram mudança de estágio no período (proxy para "leads movidos")
      const leads_moved = db.prepare(`
        SELECT COUNT(*) AS c FROM crm_leads
        WHERE user_id = ? AND stage_changed_at >= ? AND stage_changed_at <= ?
      `).get(u.id, df, dt + ' 23:59:59')?.c || 0;
      const new_leads = db.prepare(`
        SELECT COUNT(*) AS c FROM crm_leads
        WHERE user_id = ? AND created_at >= ? AND created_at <= ?
      `).get(u.id, df, dt + ' 23:59:59')?.c || 0;
      const revenue = db.prepare(`
        SELECT COALESCE(SUM(closed_value), 0) AS r FROM crm_leads
        WHERE user_id = ? AND stage = 'fechado' AND stage_changed_at >= ? AND stage_changed_at <= ?
      `).get(u.id, df, dt + ' 23:59:59')?.r || 0;
      return { vendedor: u.username, mensagens_enviadas: msgs, reunioes_realizadas: meetings,
               followups_concluidos: followups, leads_movidos: leads_moved,
               novos_leads: new_leads, receita_fechada: revenue };
    });

    const cols = [
      { key: 'vendedor',             label: 'Vendedor' },
      { key: 'mensagens_enviadas',   label: 'Mensagens Enviadas' },
      { key: 'reunioes_realizadas',  label: 'Reuniões Realizadas' },
      { key: 'followups_concluidos', label: 'Follow-ups Concluídos' },
      { key: 'leads_movidos',        label: 'Leads Movidos de Etapa' },
      { key: 'novos_leads',          label: 'Novos Leads' },
      { key: 'receita_fechada',      label: 'Receita Fechada (R$)' },
    ];

    const fname = `atividade-${df.slice(0, 7)}.csv`;
    sendCsv(res, fname, toCsv(cols, rows));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
