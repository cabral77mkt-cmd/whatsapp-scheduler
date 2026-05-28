'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { runOutboundCampaign } = require('../crm/outboundWorker');

let _io = null;
function setIO(io) { _io = io; }

/* ─── Helper: query leads por filtros ───────────────────────────────────── */
function getTargetLeads(userId, filters = {}) {
  const { stages, temperature, source, no_interaction_days, tag } = filters;
  let where  = 'l.user_id = ? AND l.stage NOT IN (\'fechado\',\'perdido\')';
  const params = [userId];

  if (stages?.length) {
    where += ` AND l.stage IN (${stages.map(() => '?').join(',')})`;
    params.push(...stages);
  }
  if (temperature) {
    where += ' AND l.temperature = ?';
    params.push(temperature);
  }
  if (source) {
    where += ' AND l.source LIKE ?';
    params.push(`%${source}%`);
  }
  if (no_interaction_days) {
    where += ` AND (l.last_interaction_at IS NULL OR l.last_interaction_at < datetime('now','-${Number(no_interaction_days)} days'))`;
  }
  if (tag) {
    where += ` AND EXISTS (SELECT 1 FROM crm_lead_tags lt JOIN crm_tags t ON t.id = lt.tag_id WHERE lt.lead_id = l.id AND LOWER(t.name) = LOWER(?))`;
    params.push(tag);
  }

  return db.prepare(`
    SELECT l.id, l.name, l.phone, l.stage, l.source, l.notes, l.potential_value, l.temperature
    FROM crm_leads l
    WHERE ${where} AND l.phone IS NOT NULL
    ORDER BY l.last_interaction_at DESC
  `).all(...params);
}

/* ── GET / — lista campanhas ─────────────────────────────────────────── */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const campaigns = db.prepare(`
    SELECT * FROM crm_outbound_campaigns
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(userId);
  res.json(campaigns);
});

/* ── GET /:id — detalhe + progresso ─────────────────────────────────── */
router.get('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const campaign = db.prepare(
    'SELECT * FROM crm_outbound_campaigns WHERE id = ? AND user_id = ?'
  ).get(id, userId);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

  const jobs = db.prepare(`
    SELECT j.id, j.lead_id, j.status, j.sent_at, j.error_msg,
           l.name AS lead_name, l.phone AS lead_phone
    FROM crm_outbound_jobs j
    JOIN crm_leads l ON l.id = j.lead_id
    WHERE j.campaign_id = ?
    ORDER BY j.id ASC
    LIMIT 100
  `).all(id);

  res.json({ ...campaign, jobs });
});

/* ── POST / — criar campanha (draft) ─────────────────────────────────── */
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const {
    name, template, target_filters, ai_personalize, delay_seconds,
  } = req.body;

  if (!name?.trim())     return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!template?.trim()) return res.status(400).json({ error: 'Template é obrigatório' });

  const filters = target_filters || {};
  const leads = getTargetLeads(userId, filters);

  const info = db.prepare(`
    INSERT INTO crm_outbound_campaigns
      (user_id, org_id, name, template, target_filters_json, ai_personalize, delay_seconds,
       status, total_leads)
    VALUES (?, 1, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    userId, name.trim(), template.trim(),
    JSON.stringify(filters),
    ai_personalize ? 1 : 0,
    Number(delay_seconds) || 10,
    leads.length,
  );

  res.status(201).json({
    id: info.lastInsertRowid,
    total_leads: leads.length,
    preview_leads: leads.slice(0, 5).map(l => ({ name: l.name, phone: l.phone, stage: l.stage })),
  });
});

/* ── PUT /:id — atualizar draft ──────────────────────────────────────── */
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const campaign = db.prepare(
    "SELECT * FROM crm_outbound_campaigns WHERE id = ? AND user_id = ? AND status = 'draft'"
  ).get(id, userId);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada ou já iniciada' });

  const { name, template, target_filters, ai_personalize, delay_seconds } = req.body;
  const filters = target_filters || JSON.parse(campaign.target_filters_json || '{}');
  const leads   = getTargetLeads(userId, filters);

  db.prepare(`
    UPDATE crm_outbound_campaigns
    SET name = ?, template = ?, target_filters_json = ?, ai_personalize = ?, delay_seconds = ?, total_leads = ?
    WHERE id = ?
  `).run(
    name?.trim() || campaign.name,
    template?.trim() || campaign.template,
    JSON.stringify(filters),
    ai_personalize !== undefined ? (ai_personalize ? 1 : 0) : campaign.ai_personalize,
    Number(delay_seconds) || campaign.delay_seconds,
    leads.length,
    id,
  );

  res.json({ ok: true, total_leads: leads.length });
});

/* ── POST /:id/preview — mostra leads que serão atingidos ───────────── */
router.post('/:id/preview', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const campaign = db.prepare(
    'SELECT * FROM crm_outbound_campaigns WHERE id = ? AND user_id = ?'
  ).get(id, userId);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

  const filters = JSON.parse(campaign.target_filters_json || '{}');
  const leads   = getTargetLeads(userId, filters);

  res.json({
    total: leads.length,
    leads: leads.slice(0, 20).map(l => ({
      id: l.id, name: l.name, phone: l.phone, stage: l.stage, temperature: l.temperature,
    })),
  });
});

/* ── POST /:id/launch — dispara campanha ─────────────────────────────── */
router.post('/:id/launch', async (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const campaign = db.prepare(
    "SELECT * FROM crm_outbound_campaigns WHERE id = ? AND user_id = ? AND status IN ('draft','paused')"
  ).get(id, userId);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada ou já em execução' });

  // Verifica WhatsApp conectado
  const { getStatus } = require('../whatsapp/client');
  if (getStatus(userId) !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp não está conectado' });
  }

  // Se ainda não tem jobs (draft), cria agora
  const existingJobs = db.prepare('SELECT COUNT(*) AS c FROM crm_outbound_jobs WHERE campaign_id = ?').get(id)?.c || 0;
  if (existingJobs === 0) {
    const filters = JSON.parse(campaign.target_filters_json || '{}');
    const leads   = getTargetLeads(userId, filters);
    if (leads.length === 0) return res.status(400).json({ error: 'Nenhum lead encontrado com os filtros atuais' });

    const stmt = db.prepare('INSERT INTO crm_outbound_jobs (campaign_id, lead_id) VALUES (?, ?)');
    for (const l of leads) stmt.run(id, l.id);

    db.prepare('UPDATE crm_outbound_campaigns SET total_leads = ? WHERE id = ?').run(leads.length, id);
  }

  // Marca como running
  db.prepare(`
    UPDATE crm_outbound_campaigns SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);

  res.json({ ok: true, status: 'running' });

  // Processa em background (não bloqueia a resposta)
  setImmediate(() => {
    runOutboundCampaign(id, userId, _io).catch(e =>
      console.error('[Outbound] Erro no worker:', e.message)
    );
  });
});

/* ── POST /:id/pause — pausa campanha ────────────────────────────────── */
router.post('/:id/pause', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const campaign = db.prepare(
    "SELECT id FROM crm_outbound_campaigns WHERE id = ? AND user_id = ? AND status = 'running'"
  ).get(id, userId);
  if (!campaign) return res.status(404).json({ error: 'Campanha não está em execução' });
  db.prepare("UPDATE crm_outbound_campaigns SET status = 'paused' WHERE id = ?").run(id);
  res.json({ ok: true });
});

/* ── DELETE /:id — remove draft ───────────────────────────────────────── */
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const campaign = db.prepare(
    "SELECT id FROM crm_outbound_campaigns WHERE id = ? AND user_id = ? AND status = 'draft'"
  ).get(id, userId);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada ou já iniciada' });
  db.prepare('DELETE FROM crm_outbound_campaigns WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.setIO = setIO;
