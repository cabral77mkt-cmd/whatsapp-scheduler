/**
 * GET    /api/crm/rescues/today        — lista os rescues do dia
 * POST   /api/crm/rescues/generate     — força regeneração manual
 * POST   /api/crm/rescues/:id/dismiss  — descarta rescue
 * POST   /api/crm/rescues/:id/acted    — marca como ação realizada
 * POST   /api/crm/rescues/:id/send     — envia a mensagem sugerida pro lead
 */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { getOrgId } = require('../middleware/tenant');
const rescueGen = require('../crm/rescueGenerator');

/* ── GET /today — rescues do dia ── */
router.get('/today', (req, res) => {
  const userId = Number(req.user.sub);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const rows = db.prepare(`
      SELECT
        r.*,
        l.name            AS lead_name,
        l.phone           AS lead_phone,
        l.stage           AS lead_stage,
        l.temperature     AS lead_temperature,
        l.potential_value AS lead_potential_value,
        l.last_interaction_at,
        (SELECT score FROM crm_lead_ai WHERE lead_id = l.id) AS ai_score
      FROM crm_daily_rescues r
      JOIN crm_leads l ON l.id = r.lead_id
      WHERE r.user_id = ?
        AND r.rescue_date = ?
        AND r.status = 'pending'
      ORDER BY r.priority DESC
    `).all(userId, today);

    res.json({ date: today, count: rows.length, rescues: rows });
  } catch (e) {
    console.error('[Rescue] GET /today erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /generate — força regeneração manual (botão "Regerar agora") ── */
router.post('/generate', async (req, res) => {
  const userId = Number(req.user.sub);
  try {
    const result = await rescueGen.generateRescuesForUser(userId, getOrgId(req));
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /:id/dismiss — descartar rescue (usuário decidiu não agir) ── */
router.post('/:id/dismiss', (req, res) => {
  const userId = Number(req.user.sub);
  const result = db.prepare(`
    UPDATE crm_daily_rescues
    SET status = 'dismissed', dismissed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(Number(req.params.id), userId);
  if (!result.changes) return res.status(404).json({ error: 'Rescue não encontrado' });
  res.json({ ok: true });
});

/* ── POST /:id/acted — marca como ação realizada ── */
router.post('/:id/acted', (req, res) => {
  const userId = Number(req.user.sub);
  const result = db.prepare(`
    UPDATE crm_daily_rescues
    SET status = 'acted', acted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(Number(req.params.id), userId);
  if (!result.changes) return res.status(404).json({ error: 'Rescue não encontrado' });
  res.json({ ok: true });
});

/* ── POST /:id/send — envia a mensagem sugerida (revisada/editada) pro lead ── */
router.post('/:id/send', async (req, res) => {
  const userId = Number(req.user.sub);
  const rescue = db.prepare(`
    SELECT r.*, l.phone FROM crm_daily_rescues r
    JOIN crm_leads l ON l.id = r.lead_id
    WHERE r.id = ? AND r.user_id = ?
  `).get(Number(req.params.id), userId);

  if (!rescue) return res.status(404).json({ error: 'Rescue não encontrado' });

  const message = (req.body?.message || rescue.suggested_message || '').trim();
  if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

  try {
    const { sendMessage } = require('../whatsapp/client');
    await sendMessage(userId, rescue.phone, message);

    // Marca como acted + registra tentativa de reengajamento
    db.prepare(`
      UPDATE crm_daily_rescues
      SET status = 'acted', acted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rescue.id);

    db.prepare(`
      INSERT INTO crm_reengagement_attempts
        (org_id, user_id, lead_id, cooling_reason, message_sent, sent_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(getOrgId(req), userId, rescue.lead_id, rescue.reason, message);

    // Atualiza last_reengagement_at no lead
    db.prepare(`
      UPDATE crm_leads SET last_reengagement_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(rescue.lead_id);

    res.json({ ok: true, sent_to: rescue.phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
