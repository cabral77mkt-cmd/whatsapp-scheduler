const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/search?q=term
// Busca unificada: leads, contatos e mensagens agendadas pendentes
router.get('/', (req, res) => {
  const { q = '' } = req.query;
  const userId = Number(req.user.sub);
  const term = q.trim();

  if (term.length < 1) {
    return res.json({ leads: [], contacts: [], messages: [] });
  }

  const like = `%${term}%`;

  let leads = [], contacts = [], messages = [];

  try {
    leads = db.prepare(`
      SELECT id, name, phone, stage, temperature
      FROM crm_leads
      WHERE user_id = ?
        AND (name LIKE ? OR phone LIKE ?)
      ORDER BY last_interaction_at DESC
      LIMIT 6
    `).all(userId, like, like);
  } catch (e) {
    // tabela pode não existir em instâncias sem CRM
  }

  try {
    contacts = db.prepare(`
      SELECT id, name, phone
      FROM contacts
      WHERE user_id = ?
        AND (name LIKE ? OR phone LIKE ?)
      ORDER BY name ASC
      LIMIT 5
    `).all(userId, like, like);
  } catch (e) {}

  try {
    messages = db.prepare(`
      SELECT id, phone_number AS phone, SUBSTR(message, 1, 70) AS preview, scheduled_at
      FROM scheduled_messages
      WHERE user_id = ?
        AND status = 'pending'
        AND (phone_number LIKE ? OR message LIKE ?)
      ORDER BY scheduled_at ASC
      LIMIT 4
    `).all(userId, like, like);
  } catch (e) {}

  res.json({ leads, contacts, messages });
});

module.exports = router;
