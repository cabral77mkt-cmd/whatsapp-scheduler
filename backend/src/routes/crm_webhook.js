/**
 * crm_webhook.js
 * Endpoint público para captura de leads via webhook.
 *
 * POST /api/webhooks/lead
 * Header: Authorization: Bearer <webhook_token>
 *   OU query: ?token=<webhook_token>
 *
 * Body JSON:
 *   { name, phone, source, temperature, potential_value, notes,
 *     event_name, city, event_date }
 *
 * Compatível com: Zapier, Make (Integromat), formulários HTML, Instagram Ads (via Make)
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

function resolveUserByToken(token) {
  if (!token) return null;
  return db.prepare('SELECT user_id FROM crm_settings WHERE webhook_token = ?').get(token) || null;
}

router.post('/lead', (req, res) => {
  // Aceita token via header Bearer ou query param
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken  = req.query.token || null;
  const token = headerToken || queryToken;

  const row = resolveUserByToken(token);
  if (!row) {
    return res.status(401).json({ error: 'Token inválido ou não configurado.' });
  }
  const userId = Number(row.user_id);

  const {
    name, phone, source, temperature = 'morno',
    potential_value, notes,
    event_name, city, event_date,
  } = req.body || {};

  if (!phone?.toString().trim()) {
    return res.status(400).json({ error: 'Campo "phone" é obrigatório.' });
  }

  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  if (cleanPhone.length < 8) {
    return res.status(400).json({ error: 'Telefone inválido.' });
  }

  // Verifica se lead já existe
  const existing = db.prepare('SELECT id FROM crm_leads WHERE user_id = ? AND phone = ?').get(userId, cleanPhone);
  if (existing) {
    return res.status(409).json({ error: 'Lead já existe.', lead_id: existing.id });
  }

  const now = new Date().toISOString();
  const validTemps = ['frio', 'morno', 'quente'];
  const temp = validTemps.includes(temperature) ? temperature : 'morno';

  const info = db.prepare(`
    INSERT INTO crm_leads
      (user_id, name, phone, stage, source, temperature, potential_value, notes,
       first_contact_at, last_interaction_at, stage_changed_at)
    VALUES (?, ?, ?, 'entrou_contato', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    name ? String(name).trim() : null,
    cleanPhone,
    source ? String(source).trim() : 'Webhook',
    temp,
    potential_value ? Number(potential_value) : null,
    notes ? String(notes).trim() : null,
    now, now, now
  );
  const leadId = info.lastInsertRowid;

  // Cria evento se fornecido
  if (event_name || event_date) {
    db.prepare(`
      INSERT INTO crm_lead_event (lead_id, event_name, city, event_date)
      VALUES (?, ?, ?, ?)
    `).run(leadId, event_name || null, city || null, event_date || null);
  }

  console.log(`[Webhook] Lead criado: #${leadId} (${cleanPhone}) via webhook — user ${userId}`);

  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
  return res.status(201).json({ ok: true, lead_id: leadId, lead });
});

module.exports = router;
