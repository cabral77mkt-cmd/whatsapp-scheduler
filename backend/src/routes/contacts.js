const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/contacts
router.get('/', (req, res) => {
  const { search } = req.query;
  const userId = Number(req.user.sub);
  let contacts;

  if (search) {
    contacts = db.prepare(
      `SELECT * FROM contacts WHERE user_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name ASC`
    ).all(userId, `%${search}%`, `%${search}%`);
  } else {
    contacts = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC').all(userId);
  }

  res.json(contacts);
});

// POST /api/contacts
router.post('/', (req, res) => {
  const { name, phone } = req.body;
  const userId = Number(req.user.sub);

  if (!name || !phone) {
    return res.status(400).json({ error: 'name e phone são obrigatórios' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  try {
    const result = db.prepare(
      'INSERT INTO contacts (name, phone, user_id) VALUES (?, ?, ?)'
    ).run(name.trim(), cleanPhone, userId);

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(contact);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Número de telefone já cadastrado' });
    }
    throw err;
  }
});

// PUT /api/contacts/:id
router.put('/:id', (req, res) => {
  const { name, phone } = req.body;
  const userId = Number(req.user.sub);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, userId);

  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : contact.phone;

  try {
    db.prepare(
      'UPDATE contacts SET name = ?, phone = ? WHERE id = ? AND user_id = ?'
    ).run(name || contact.name, cleanPhone, req.params.id, userId);

    const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Número de telefone já cadastrado' });
    }
    throw err;
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
