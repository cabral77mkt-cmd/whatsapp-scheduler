'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// ── Listar contas ─────────────────────────────────────────────────────────────
// GET /api/finance/payables?entity_id=X&type=payable|receivable&status=pending|paid|overdue
router.get('/', (req, res) => {
  const userId   = Number(req.user.sub);
  const entityId = req.query.entity_id ? Number(req.query.entity_id) : null;
  const type     = req.query.type   || null;  // 'payable' | 'receivable'
  const status   = req.query.status || null;  // 'pending' | 'paid' | 'overdue'

  const today = new Date().toISOString().split('T')[0];

  let sql = `
    SELECT p.*,
           e.name as entity_name, e.icon as entity_icon, e.color as entity_color,
           fc.name as category_name, fc.icon as category_icon
    FROM finance_payables p
    LEFT JOIN finance_entities e ON e.id = p.entity_id
    LEFT JOIN finance_categories fc ON fc.id = p.category_id
    WHERE p.user_id = ?
  `;
  const params = [userId];

  if (entityId) { sql += ' AND p.entity_id = ?'; params.push(entityId); }
  if (type)     { sql += ' AND p.type = ?';      params.push(type); }

  if (status === 'paid')    { sql += ' AND p.paid_date IS NOT NULL'; }
  if (status === 'pending') { sql += ' AND p.paid_date IS NULL AND p.due_date >= ?'; params.push(today); }
  if (status === 'overdue') { sql += ' AND p.paid_date IS NULL AND p.due_date < ?';  params.push(today); }

  sql += ' ORDER BY p.due_date ASC, p.created_at DESC';

  try {
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Criar conta ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const {
    entity_id, type, amount, description, category_id,
    counterpart, due_date, installment_total, installment_current, notes
  } = req.body;

  if (!entity_id || !type || !amount || !description || !due_date) {
    return res.status(400).json({ error: 'entity_id, type, amount, description e due_date são obrigatórios' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO finance_payables
        (user_id, entity_id, type, amount, description, category_id, counterpart,
         due_date, installment_total, installment_current, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      userId, entity_id, type, amount, description,
      category_id || null, counterpart || null, due_date,
      installment_total || 1, installment_current || 1,
      notes || null
    );

    const created = db.prepare('SELECT * FROM finance_payables WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Editar conta ──────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  const {
    amount, description, category_id, counterpart,
    due_date, paid_date, notes, type
  } = req.body;

  const existing = db.prepare('SELECT * FROM finance_payables WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

  try {
    db.prepare(`
      UPDATE finance_payables SET
        amount      = COALESCE(?, amount),
        description = COALESCE(?, description),
        category_id = ?,
        counterpart = ?,
        due_date    = COALESCE(?, due_date),
        paid_date   = ?,
        notes       = ?,
        type        = COALESCE(?, type)
      WHERE id = ? AND user_id = ?
    `).run(
      amount || null, description || null,
      category_id !== undefined ? category_id : existing.category_id,
      counterpart !== undefined ? counterpart : existing.counterpart,
      due_date || null,
      paid_date !== undefined ? paid_date : existing.paid_date,
      notes !== undefined ? notes : existing.notes,
      type || null,
      id, userId
    );

    const updated = db.prepare('SELECT * FROM finance_payables WHERE id = ?').get(id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Marcar como pago (cria transação automaticamente) ─────────────────────────
router.post('/:id/pay', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);
  const paidDate = req.body.paid_date || new Date().toISOString().split('T')[0];

  const payable = db.prepare('SELECT * FROM finance_payables WHERE id = ? AND user_id = ?').get(id, userId);
  if (!payable) return res.status(404).json({ error: 'Conta não encontrada' });
  if (payable.paid_date) return res.status(400).json({ error: 'Conta já foi paga' });

  try {
    // Criar transação financeira
    const txType = payable.type === 'payable' ? 'expense' : 'income';
    const txResult = db.prepare(`
      INSERT INTO finance_transactions
        (entity_id, user_id, type, amount, description, category_id, date, source)
      VALUES (?,?,?,?,?,?,?,'payable')
    `).run(
      payable.entity_id, userId, txType, payable.amount,
      payable.description, payable.category_id || null, paidDate
    );

    // Atualizar a conta
    db.prepare(`
      UPDATE finance_payables SET paid_date = ?, transaction_id = ? WHERE id = ?
    `).run(paidDate, txResult.lastInsertRowid, id);

    res.json({
      ok: true,
      transaction_id: txResult.lastInsertRowid,
      paid_date: paidDate,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Excluir conta ─────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id     = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM finance_payables WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

  db.prepare('DELETE FROM finance_payables WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
