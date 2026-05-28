'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { syncAll } = require('../crm/tickfyCrmSync');

const STATUS_LABELS = { PG: 'Pago', NP: 'Não Pago', EA: 'Em Análise', CA: 'Cancelado', DV: 'Devolvido' };

/* ── GET /config ─────────────────────────────────────────────────────── */
router.get('/config', (req, res) => {
  const userId = Number(req.user.sub);
  const cfg = db.prepare('SELECT * FROM crm_tickfy_integration WHERE user_id = ?').get(userId)
    || {
      user_id:        userId,
      enabled:        0,
      sync_statuses:  '["PG"]',
      default_stage:  'entrou_contato',
      default_tag:    'Tickfy',
      tag_with_event: 1,
      create_note:    1,
    };

  // Estatísticas rápidas
  const stats = db.prepare(`
    SELECT
      COUNT(*)                                                  AS total_synced,
      SUM(CASE WHEN action = 'created' THEN 1 ELSE 0 END)      AS leads_created,
      SUM(CASE WHEN action = 'updated' THEN 1 ELSE 0 END)      AS leads_updated,
      SUM(CASE WHEN action = 'skipped' THEN 1 ELSE 0 END)      AS skipped,
      MAX(synced_at)                                            AS last_sync_at
    FROM crm_tickfy_lead_sync WHERE user_id = ?
  `).get(userId) || {};

  // Pendentes (ainda não sincronizados)
  const pending = db.prepare(`
    SELECT COUNT(*) AS c FROM tickfy_sales ts
    WHERE ts.user_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM crm_tickfy_lead_sync s
        WHERE s.user_id = ts.user_id AND s.sale_id = ts.id
      )
  `).get(userId)?.c || 0;

  res.json({ config: cfg, stats: { ...stats, pending } });
});

/* ── PUT /config ─────────────────────────────────────────────────────── */
router.put('/config', (req, res) => {
  const userId = Number(req.user.sub);
  const {
    enabled, sync_statuses, default_stage,
    default_tag, tag_with_event, create_note,
  } = req.body;

  // Valida sync_statuses (deve ser array de strings)
  let statuses = ['PG'];
  try {
    const parsed = JSON.parse(sync_statuses || '["PG"]');
    if (Array.isArray(parsed)) statuses = parsed.filter(s => typeof s === 'string');
  } catch {}

  db.prepare(`
    INSERT INTO crm_tickfy_integration
      (user_id, org_id, enabled, sync_statuses, default_stage, default_tag, tag_with_event, create_note, updated_at)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled        = excluded.enabled,
      sync_statuses  = excluded.sync_statuses,
      default_stage  = excluded.default_stage,
      default_tag    = excluded.default_tag,
      tag_with_event = excluded.tag_with_event,
      create_note    = excluded.create_note,
      updated_at     = CURRENT_TIMESTAMP
  `).run(
    userId,
    enabled ? 1 : 0,
    JSON.stringify(statuses),
    default_stage || 'entrou_contato',
    default_tag   || 'Tickfy',
    tag_with_event ? 1 : 0,
    create_note    ? 1 : 0,
  );

  res.json({ ok: true });
});

/* ── POST /sync — sincronização manual ───────────────────────────────── */
router.post('/sync', (req, res) => {
  const userId = Number(req.user.sub);
  const result = syncAll(userId);
  res.json({ ok: true, ...result });
});

/* ── GET /history — histórico de syncs ──────────────────────────────── */
router.get('/history', (req, res) => {
  const userId = Number(req.user.sub);
  const { limit = 50, action } = req.query;

  let query = `
    SELECT s.*,
           l.name  AS lead_name,
           l.stage AS lead_stage
    FROM crm_tickfy_lead_sync s
    LEFT JOIN crm_leads l ON l.id = s.lead_id
    WHERE s.user_id = ?
  `;
  const params = [userId];

  if (action) { query += ' AND s.action = ?'; params.push(action); }
  query += ' ORDER BY s.synced_at DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 50, 200));

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

/* ── GET /lead-events/:leadId — eventos Tickfy de um lead específico ── */
router.get('/lead-events/:leadId', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);

  // Confirma que o lead pertence ao usuário
  const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  // Busca todas as vendas Tickfy vinculadas a este lead
  const events = db.prepare(`
    SELECT s.*, ts.trn_id, ts.eve_cod, ts.comprador_email, ts.wa_sent, ts.detected_at
    FROM crm_tickfy_lead_sync s
    JOIN tickfy_sales ts ON ts.id = s.sale_id AND ts.user_id = s.user_id
    WHERE s.user_id = ? AND s.lead_id = ?
    ORDER BY s.synced_at DESC
  `).all(userId, leadId);

  // Enriquece com label de status
  const enriched = events.map(e => ({
    ...e,
    status_label: STATUS_LABELS[e.status_code] || e.status_code,
    valor_fmt: e.valor ? `R$ ${Number(e.valor).toFixed(2).replace('.', ',')}` : null,
  }));

  res.json(enriched);
});

/* ── GET /preview — vendas não sincronizadas (preview antes do sync) ── */
router.get('/preview', (req, res) => {
  const userId = Number(req.user.sub);
  const cfg = db.prepare('SELECT * FROM crm_tickfy_integration WHERE user_id = ?').get(userId);

  let syncStatuses = ['PG'];
  try { syncStatuses = JSON.parse(cfg?.sync_statuses || '["PG"]'); } catch {}

  const placeholders = syncStatuses.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT ts.id, ts.trn_id, ts.evento, ts.comprador_nome,
           ts.comprador_telefone, ts.valor, ts.status_code, ts.detected_at
    FROM tickfy_sales ts
    WHERE ts.user_id = ?
      AND ts.status_code IN (${placeholders})
      AND NOT EXISTS (
        SELECT 1 FROM crm_tickfy_lead_sync s
        WHERE s.user_id = ts.user_id AND s.sale_id = ts.id
      )
    ORDER BY ts.detected_at DESC
    LIMIT 20
  `).all(userId, ...syncStatuses);

  res.json(rows);
});

module.exports = router;
