const express = require('express');
const router = express.Router();
const { getGroups, getStatus } = require('../whatsapp/client');

// GET /api/groups - listar grupos do WhatsApp
router.get('/', async (req, res) => {
  if (getStatus() !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp não está conectado' });
  }

  try {
    const groups = await getGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar grupos: ' + err.message });
  }
});

module.exports = router;
