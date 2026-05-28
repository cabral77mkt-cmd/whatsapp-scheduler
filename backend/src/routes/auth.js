const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { createToken, authMiddleware } = require('../middleware/auth');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username e password são obrigatórios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  try {
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
  } catch {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  const token = createToken(user);
  const role = user.is_admin ? 'admin' : (user.role || 'seller');
  res.json({
    token, username: user.username, id: user.id, userId: user.id,
    isAdmin: !!user.is_admin, role, orgId: user.org_id || 1,
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, email, is_admin FROM users WHERE id = ?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ ...user, isAdmin: !!user.is_admin });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const newHash = `${salt}:${hashPassword(newPassword, salt)}`;
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  res.json({ success: true, message: 'Senha alterada com sucesso' });
});

module.exports = router;
