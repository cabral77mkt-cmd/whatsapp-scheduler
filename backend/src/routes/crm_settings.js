const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { recoverMissingLeads } = require('../whatsapp/client');

router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  db.ensureCrmSeeds(userId);
  const row = db.prepare('SELECT * FROM crm_settings WHERE user_id = ?').get(userId);
  let businessHours = {}, templates = {};
  try { businessHours = JSON.parse(row.business_hours_json || '{}'); } catch {}
  try { templates = JSON.parse(row.templates_json || '{}'); } catch {}
  res.json({
    auto_create_leads: !!row.auto_create_leads,
    business_hours: businessHours,
    templates,
    webhook_token: row.webhook_token || null,
  });
});

router.put('/', (req, res) => {
  const userId = Number(req.user.sub);
  db.ensureCrmSeeds(userId);
  const cur = db.prepare('SELECT * FROM crm_settings WHERE user_id = ?').get(userId);
  const b = req.body || {};
  const bh = b.business_hours ? JSON.stringify(b.business_hours) : cur.business_hours_json;
  const tpl = b.templates ? JSON.stringify(b.templates) : cur.templates_json;
  const auto = b.auto_create_leads !== undefined ? (b.auto_create_leads ? 1 : 0) : cur.auto_create_leads;
  db.prepare(`UPDATE crm_settings SET business_hours_json = ?, templates_json = ?, auto_create_leads = ? WHERE user_id = ?`)
    .run(bh, tpl, auto, userId);
  res.json({ ok: true });
});

// POST /webhook-token — gera ou regenera o token de webhook
router.post('/webhook-token', (req, res) => {
  const userId = Number(req.user.sub);
  db.ensureCrmSeeds(userId);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE crm_settings SET webhook_token = ? WHERE user_id = ?').run(token, userId);
  res.json({ webhook_token: token });
});

// DELETE /webhook-token — revoga o token
router.delete('/webhook-token', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare('UPDATE crm_settings SET webhook_token = NULL WHERE user_id = ?').run(userId);
  res.json({ ok: true });
});

// Disparo manual do recovery de leads
router.post('/recover', async (req, res) => {
  const userId = Number(req.user.sub);
  try {
    const count = await recoverMissingLeads(userId);
    res.json({ ok: true, recovered: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
