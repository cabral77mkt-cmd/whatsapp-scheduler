const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

// Configura upload de comprovantes
const uploadDir = path.join(__dirname, '../../../data/receipts');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `receipt_${req.params.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// GET / — lista transações com filtros
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { entity_id, type, category_id, start, end, source, page = 1, limit = 50 } = req.query;

  let where = ['t.user_id = ?'];
  const params = [userId];

  if (entity_id) { where.push('t.entity_id = ?'); params.push(Number(entity_id)); }
  if (type)      { where.push('t.type = ?');      params.push(type); }
  if (category_id) { where.push('t.category_id = ?'); params.push(Number(category_id)); }
  if (source)    { where.push('t.source = ?');    params.push(source); }
  if (start)     { where.push('t.date >= ?');     params.push(start); }
  if (end)       { where.push('t.date <= ?');     params.push(end); }

  const offset = (Number(page) - 1) * Number(limit);
  const whereStr = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS c FROM finance_transactions t WHERE ${whereStr}`).get(...params).c;
  const rows = db.prepare(`
    SELECT
      t.*,
      e.name AS entity_name, e.color AS entity_color, e.icon AS entity_icon,
      c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
      p.name AS project_name, p.type AS project_type
    FROM finance_transactions t
    LEFT JOIN finance_entities e ON e.id = t.entity_id
    LEFT JOIN finance_categories c ON c.id = t.category_id
    LEFT JOIN finance_projects p ON p.id = t.project_id
    WHERE ${whereStr}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ total, page: Number(page), limit: Number(limit), data: rows });
});

// POST / — cria manualmente
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { entity_id, type, amount, description = '', category_id = null, date, project_id = null } = req.body;

  if (!entity_id || !type || !amount) {
    return res.status(400).json({ error: 'entity_id, type e amount são obrigatórios' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'type deve ser income ou expense' });
  }
  const entity = db.prepare('SELECT id FROM finance_entities WHERE id = ? AND user_id = ?').get(entity_id, userId);
  if (!entity) return res.status(404).json({ error: 'Entidade não encontrada' });

  // Valida projeto se fornecido
  if (project_id) {
    const proj = db.prepare('SELECT id FROM finance_projects WHERE id = ? AND user_id = ?').get(project_id, userId);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
  }

  const txDate = date || new Date().toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO finance_transactions
      (entity_id, user_id, type, amount, description, category_id, date, source, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
  `).run(entity_id, userId, type, Math.abs(Number(amount)), description, category_id || null, txDate, project_id || null);

  res.status(201).json(db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /:id — atualiza transação
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const tx = db.prepare('SELECT * FROM finance_transactions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

  const { type, amount, description, category_id, date, entity_id, project_id } = req.body;

  // Valida projeto se fornecido
  if (project_id) {
    const proj = db.prepare('SELECT id FROM finance_projects WHERE id = ? AND user_id = ?').get(project_id, userId);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
  }

  db.prepare(`
    UPDATE finance_transactions SET
      type = ?, amount = ?, description = ?, category_id = ?, date = ?, entity_id = ?, project_id = ?
    WHERE id = ? AND user_id = ?
  `).run(
    type ?? tx.type,
    amount !== undefined ? Math.abs(Number(amount)) : tx.amount,
    description ?? tx.description,
    category_id !== undefined ? (category_id || null) : tx.category_id,
    date ?? tx.date,
    entity_id ?? tx.entity_id,
    project_id !== undefined ? (project_id || null) : tx.project_id,
    req.params.id, userId
  );
  res.json(db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(req.params.id));
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const tx = db.prepare('SELECT * FROM finance_transactions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  // Remove comprovante se existir
  if (tx.receipt_path) {
    const full = path.join(__dirname, '../../../data/receipts', path.basename(tx.receipt_path));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  db.prepare('DELETE FROM finance_transactions WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

// POST /:id/receipt — anexa comprovante
router.post('/:id/receipt', upload.single('file'), (req, res) => {
  const userId = Number(req.user.sub);
  const tx = db.prepare('SELECT * FROM finance_transactions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const receiptPath = `/receipts/${req.file.filename}`;
  db.prepare(
    'UPDATE finance_transactions SET receipt_path = ?, receipt_requested = 0 WHERE id = ?'
  ).run(receiptPath, req.params.id);
  res.json({ ok: true, receipt_path: receiptPath });
});

module.exports = router;
