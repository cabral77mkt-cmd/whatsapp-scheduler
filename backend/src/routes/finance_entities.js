const express = require('express');
const router = express.Router();
const db = require('../database');

// GET / — lista entidades com saldo calculado
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const entities = db.prepare(`
    SELECT
      e.*,
      COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount
                        WHEN t.type = 'expense' THEN -t.amount ELSE 0 END), 0) AS balance
    FROM finance_entities e
    LEFT JOIN finance_transactions t ON t.entity_id = e.id
    WHERE e.user_id = ?
    GROUP BY e.id
    ORDER BY e.created_at ASC
  `).all(userId);
  res.json(entities);
});

// POST / — cria entidade
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { name, description = '', wa_group_id = null, color = '#3B82F6', icon = '💰' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = db.prepare(
    'INSERT INTO finance_entities (user_id, name, description, wa_group_id, color, icon) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name.trim(), description, wa_group_id, color, icon);
  const entity = db.prepare('SELECT * FROM finance_entities WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entity);
});

// PUT /:id — atualiza entidade
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const { name, description, wa_group_id, color, icon } = req.body;
  const entity = db.prepare('SELECT * FROM finance_entities WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!entity) return res.status(404).json({ error: 'Entidade não encontrada' });

  db.prepare(`
    UPDATE finance_entities SET
      name = ?, description = ?, wa_group_id = ?, color = ?, icon = ?
    WHERE id = ? AND user_id = ?
  `).run(
    name ?? entity.name,
    description ?? entity.description,
    wa_group_id !== undefined ? wa_group_id : entity.wa_group_id,
    color ?? entity.color,
    icon ?? entity.icon,
    req.params.id, userId
  );
  res.json(db.prepare('SELECT * FROM finance_entities WHERE id = ?').get(req.params.id));
});

// DELETE /:id — deleta entidade (só se não tiver transações)
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const entity = db.prepare('SELECT * FROM finance_entities WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!entity) return res.status(404).json({ error: 'Entidade não encontrada' });
  const txCount = db.prepare('SELECT COUNT(*) AS c FROM finance_transactions WHERE entity_id = ?').get(req.params.id);
  if (txCount.c > 0) {
    return res.status(400).json({ error: `Não é possível excluir: existem ${txCount.c} transação(ões) vinculadas.` });
  }
  db.prepare('DELETE FROM finance_entities WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

module.exports = router;
