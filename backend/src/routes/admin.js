const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { insertDefaultCategories } = require('../database');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// GET /api/admin/users - listar todos os usuários
router.get('/users', (req, res) => {
  const users = db.prepare(
    'SELECT id, username, display_name, email, is_admin, role, created_at FROM users ORDER BY id ASC'
  ).all();
  res.json(users);
});

// POST /api/admin/users - criar novo usuário
router.post('/users', (req, res) => {
  const { username, password, display_name, email } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'username é obrigatório' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  try {
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, is_admin) VALUES (?, ?, ?, ?, 0)'
    ).run(username.trim(), `${salt}:${hash}`, display_name?.trim() || null, email?.trim() || null);

    const newUserId = Number(result.lastInsertRowid);
    insertDefaultCategories(newUserId);

    const newUser = db.prepare(
      'SELECT id, username, display_name, email, is_admin, created_at FROM users WHERE id = ?'
    ).get(newUserId);

    res.status(201).json(newUser);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nome de usuário já está em uso' });
    }
    throw err;
  }
});

// PUT /api/admin/users/:id - editar usuário (nome, email, ou reset senha)
router.put('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const { display_name, email, password, role } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (password !== undefined) {
    if (password.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(`${salt}:${hash}`, userId);
  }

  const VALID_ROLES = ['seller', 'manager', 'admin'];
  const newRole = role && VALID_ROLES.includes(role) ? role : user.role || 'seller';
  const newIsAdmin = newRole === 'admin' ? 1 : 0;

  db.prepare('UPDATE users SET display_name = ?, email = ?, role = ?, is_admin = ? WHERE id = ?').run(
    display_name !== undefined ? (display_name?.trim() || null) : user.display_name,
    email !== undefined ? (email?.trim() || null) : user.email,
    newRole,
    newIsAdmin,
    userId,
  );

  const updated = db.prepare(
    'SELECT id, username, display_name, email, is_admin, role, created_at FROM users WHERE id = ?'
  ).get(userId);
  res.json(updated);
});

// DELETE /api/admin/users/:id - remover usuário
router.delete('/users/:id', (req, res) => {
  const userId = Number(req.params.id);

  // Não pode remover o próprio usuário
  if (userId === req.user.sub) {
    return res.status(400).json({ error: 'Não é possível remover seu próprio usuário' });
  }
  // Não pode remover o admin principal (id=1)
  if (userId === 1) {
    return res.status(400).json({ error: 'Não é possível remover o administrador principal' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ success: true });
});

module.exports = router;
