const express = require('express');
const router = express.Router();
const db = require('../database');

// GET / — lista orçamentos com gasto atual
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const now = new Date();
  const month = Number(req.query.month) || now.getMonth() + 1;
  const year  = Number(req.query.year)  || now.getFullYear();
  const entity_id = req.query.entity_id ? Number(req.query.entity_id) : null;

  let where = 'b.user_id = ? AND b.month = ? AND b.year = ?';
  const params = [userId, month, year];
  if (entity_id) { where += ' AND (b.entity_id = ? OR b.entity_id IS NULL)'; params.push(entity_id); }

  const budgets = db.prepare(`
    SELECT
      b.*,
      c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
      COALESCE(SUM(t.amount), 0) AS spent
    FROM finance_budgets b
    LEFT JOIN finance_categories c ON c.id = b.category_id
    LEFT JOIN finance_transactions t
      ON t.category_id = b.category_id
      AND t.user_id = b.user_id
      AND t.type = 'expense'
      AND strftime('%m', t.date) = printf('%02d', b.month)
      AND strftime('%Y', t.date) = CAST(b.year AS TEXT)
      AND (b.entity_id IS NULL OR t.entity_id = b.entity_id)
    WHERE ${where}
    GROUP BY b.id
    ORDER BY c.name
  `).all(...params);

  const result = budgets.map(b => ({
    ...b,
    percent: b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0,
  }));

  res.json(result);
});

// POST / — cria ou atualiza orçamento
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const now = new Date();
  const { category_id, amount, entity_id = null, month = now.getMonth() + 1, year = now.getFullYear() } = req.body;
  if (!category_id || !amount) return res.status(400).json({ error: 'category_id e amount são obrigatórios' });

  try {
    db.prepare(`
      INSERT INTO finance_budgets (user_id, entity_id, category_id, amount, month, year)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, category_id, entity_id, month, year) DO UPDATE SET amount = excluded.amount
    `).run(userId, entity_id || null, category_id, Math.abs(Number(amount)), month, year);
  } catch (e) {
    // fallback para SQLite sem ON CONFLICT support
    const existing = db.prepare(
      'SELECT id FROM finance_budgets WHERE user_id=? AND category_id=? AND month=? AND year=? AND (entity_id IS ? OR entity_id = ?)'
    ).get(userId, category_id, month, year, entity_id || null, entity_id || null);
    if (existing) {
      db.prepare('UPDATE finance_budgets SET amount = ? WHERE id = ?').run(Math.abs(Number(amount)), existing.id);
    } else {
      db.prepare('INSERT INTO finance_budgets (user_id, entity_id, category_id, amount, month, year) VALUES (?,?,?,?,?,?)')
        .run(userId, entity_id || null, category_id, Math.abs(Number(amount)), month, year);
    }
  }

  res.status(201).json({ ok: true });
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare('DELETE FROM finance_budgets WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

module.exports = router;
