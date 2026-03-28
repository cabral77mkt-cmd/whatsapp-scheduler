const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/contacts
router.get('/', (req, res) => {
  const { search } = req.query;
  let contacts;

  if (search) {
    contacts = db.prepare(
      `SELECT * FROM contacts WHERE name LIKE ? OR phone LIKE ? ORDER BY name ASC`
    ).all(`%${search}%`, `%${search}%`);
  } else {
    contacts = db.prepare('SELECT * FROM contacts ORDER BY name ASC').all();
  }

  res.json(contacts);
});

// POST /api/contacts
router.post('/', (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'name e phone são obrigatórios' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  try {
    const result = db.prepare(
      'INSERT INTO contacts (name, phone) VALUES (?, ?)'
    ).run(name.trim(), cleanPhone);

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
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);

  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : contact.phone;

  try {
    db.prepare(
      'UPDATE contacts SET name = ?, phone = ? WHERE id = ?'
    ).run(name || contact.name, cleanPhone, req.params.id);

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
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
