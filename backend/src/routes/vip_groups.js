const express = require('express');
const router = express.Router();
const db = require('../database');
const { getSocket, getStatus } = require('../whatsapp/client');

// GET /api/vip-groups?lancamento_id=X - listar grupos de um lançamento
router.get('/', (req, res) => {
  const { lancamento_id } = req.query;
  const userId = Number(req.user.sub);
  if (!lancamento_id) return res.status(400).json({ error: 'lancamento_id é obrigatório' });
  // Verifica que o lançamento pertence ao usuário
  const lancamento = db.prepare('SELECT id FROM lancamentos WHERE id = ? AND user_id = ?').get(lancamento_id, userId);
  if (!lancamento) return res.status(404).json({ error: 'Lançamento não encontrado' });
  const grupos = db.prepare('SELECT * FROM vip_groups WHERE lancamento_id = ? ORDER BY created_at ASC').all(lancamento_id);
  res.json(grupos);
});

// POST /api/vip-groups - registrar grupo (sem criar no WhatsApp ainda)
router.post('/', (req, res) => {
  const { lancamento_id, name, admin_phone, admin_name } = req.body;
  const userId = Number(req.user.sub);
  if (!lancamento_id || !name || !admin_phone) {
    return res.status(400).json({ error: 'lancamento_id, name e admin_phone são obrigatórios' });
  }
  // Verifica que o lançamento pertence ao usuário
  const lancamento = db.prepare('SELECT id FROM lancamentos WHERE id = ? AND user_id = ?').get(lancamento_id, userId);
  if (!lancamento) return res.status(404).json({ error: 'Lançamento não encontrado' });
  const phone = admin_phone.replace(/[^0-9]/g, '');
  const result = db.prepare(
    'INSERT INTO vip_groups (lancamento_id, name, admin_phone, admin_name) VALUES (?, ?, ?, ?)'
  ).run(lancamento_id, name.trim(), phone, admin_name || null);
  const novo = db.prepare('SELECT * FROM vip_groups WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json(novo);
});

// POST /api/vip-groups/:id/create-wa - criar o grupo no WhatsApp
router.post('/:id/create-wa', async (req, res) => {
  const userId = Number(req.user.sub);
  if (getStatus(userId) !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp não está conectado' });
  }

  const grupo = db.prepare('SELECT vg.* FROM vip_groups vg JOIN lancamentos l ON l.id = vg.lancamento_id WHERE vg.id = ? AND l.user_id = ?').get(req.params.id, userId);
  if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
  if (grupo.wa_group_id) return res.status(400).json({ error: 'Grupo já foi criado no WhatsApp' });

  const sock = getSocket(userId);
  const adminJid = grupo.admin_phone + '@s.whatsapp.net';

  try {
    const result = await sock.groupCreate(grupo.name, [adminJid]);
    const groupJid = result.id;

    await sock.groupParticipantsUpdate(groupJid, [adminJid], 'promote');

    db.prepare(
      "UPDATE vip_groups SET wa_group_id = ?, status = 'created', error_msg = NULL WHERE id = ?"
    ).run(groupJid, grupo.id);

    res.json({ success: true, wa_group_id: groupJid });
  } catch (err) {
    db.prepare(
      "UPDATE vip_groups SET status = 'failed', error_msg = ? WHERE id = ?"
    ).run(err.message, grupo.id);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vip-groups/:id - remover registro
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const grupo = db.prepare('SELECT vg.* FROM vip_groups vg JOIN lancamentos l ON l.id = vg.lancamento_id WHERE vg.id = ? AND l.user_id = ?').get(req.params.id, userId);
  if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
  db.prepare('DELETE FROM vip_groups WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
