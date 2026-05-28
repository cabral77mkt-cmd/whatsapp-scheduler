const express = require('express');
const router = express.Router();
const db = require('../database');
const { getGroups, getStatus } = require('../whatsapp/client');

// GET /api/groups - listar grupos do WhatsApp
// Se o usuário atual não tem WhatsApp conectado, usa a sessão de qualquer usuário conectado (ex: admin)
router.get('/', async (req, res) => {
  const userId = Number(req.user.sub);

  let effectiveUserId = userId;

  if (getStatus(userId) !== 'connected') {
    // Fallback: procura qualquer usuário com sessão ativa
    const users = db.prepare('SELECT id FROM users').all();
    const connected = users.find(u => getStatus(u.id) === 'connected');
    if (!connected) {
      return res.status(503).json({ error: 'WhatsApp não está conectado' });
    }
    effectiveUserId = connected.id;
  }

  try {
    const groups = await getGroups(effectiveUserId);
    console.log(`[Groups] userId=${userId} efectivo=${effectiveUserId} → ${groups.length} grupos encontrados`);
    groups.forEach(g => console.log(`  - ${g.name} | id=${g.id}`));
    res.json(groups);
  } catch (err) {
    console.error(`[Groups] Erro ao buscar grupos:`, err.message);
    res.status(500).json({ error: 'Erro ao buscar grupos: ' + err.message });
  }
});

module.exports = router;
