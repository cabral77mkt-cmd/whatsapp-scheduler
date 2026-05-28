'use strict';

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const db      = require('../database');
const metrics = require('../crm/metricsService');

/* ─── Multer (memória, max 5MB) ─────────────────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'text/csv'
      || file.originalname.toLowerCase().endsWith('.csv');
    cb(ok ? null : new Error('Apenas arquivos CSV são aceitos'), ok);
  },
});

/* ─── Parser CSV mínimo (sem dependências externas) ─────────────────────── */
function parseCSV(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 1) return { headers: [], rows: [] };

  // Detecta separador
  const first = lines[0];
  const commas = (first.match(/,/g) || []).length;
  const semis  = (first.match(/;/g) || []).length;
  const delim  = semis > commas ? ';' : ',';

  const splitLine = (line) => {
    const res = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) {
        res.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else { cur += ch; }
    }
    res.push(cur.trim().replace(/^"|"$/g, ''));
    return res;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = splitLine(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v.trim()));

  return { headers, rows };
}

/* ── POST /parse — envia CSV e recebe preview + headers ─────────────────── */
router.post('/parse', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  try {
    const { headers, rows } = parseCSV(req.file.buffer.toString('utf-8'));
    const preview = rows.slice(0, 5);
    res.json({ headers, preview, total_rows: rows.length });
  } catch (e) {
    res.status(400).json({ error: 'Erro ao processar CSV: ' + e.message });
  }
});

/* ── POST /import — importa de fato (envia CSV + mapeamento) ──────────── */
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

  const userId = Number(req.user.sub);
  let mapping;
  try {
    mapping = typeof req.body.mapping === 'string'
      ? JSON.parse(req.body.mapping)
      : (req.body.mapping || {});
  } catch {
    return res.status(400).json({ error: 'Mapeamento inválido' });
  }

  if (!mapping.phone) {
    return res.status(400).json({ error: 'Coluna de telefone é obrigatória no mapeamento' });
  }

  let parsed;
  try {
    parsed = parseCSV(req.file.buffer.toString('utf-8'));
  } catch (e) {
    return res.status(400).json({ error: 'Erro ao processar CSV: ' + e.message });
  }

  const { rows } = parsed;
  const now = new Date().toISOString();

  let imported = 0, skipped = 0, errors = 0;

  const stmtInsert = db.prepare(`
    INSERT INTO crm_leads
      (user_id, org_id, name, phone, source, temperature, potential_value, notes, stage,
       first_contact_at, last_interaction_at, stage_changed_at)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'entrou_contato', ?, ?, ?)
  `);

  for (const row of rows) {
    try {
      const rawPhone = (row[mapping.phone] || '').replace(/[^0-9]/g, '');
      if (!rawPhone || rawPhone.length < 8) { errors++; continue; }

      // Verifica duplicata
      const exists = db.prepare(
        'SELECT id FROM crm_leads WHERE user_id = ? AND phone = ?'
      ).get(userId, rawPhone);
      if (exists) { skipped++; continue; }

      const name        = mapping.name        ? (row[mapping.name]        || '').trim() || null : null;
      const source      = (mapping.source ? (row[mapping.source] || '').trim() : null) || 'csv_import';
      const temperature = mapping.temperature ? (row[mapping.temperature] || '').trim().toLowerCase() || 'cold' : 'cold';
      const potVal      = mapping.potential_value ? parseFloat(row[mapping.potential_value]) || null : null;
      const notes       = mapping.notes       ? (row[mapping.notes]       || '').trim() || null : null;

      stmtInsert.run(userId, name, rawPhone, source, temperature, potVal, notes, now, now, now);
      imported++;
      metrics.increment(userId, 'leads_created');
    } catch {
      errors++;
    }
  }

  // Salva histórico
  const importId = db.prepare(`
    INSERT INTO crm_lead_imports (user_id, org_id, filename, total_rows, imported, skipped, errors, status)
    VALUES (?, 1, ?, ?, ?, ?, ?, 'done')
  `).run(userId, req.file.originalname, rows.length, imported, skipped, errors).lastInsertRowid;

  res.json({ import_id: importId, total_rows: rows.length, imported, skipped, errors });
});

/* ── GET /history ─────────────────────────────────────────────────────── */
router.get('/history', (req, res) => {
  const userId = Number(req.user.sub);
  const history = db.prepare(`
    SELECT * FROM crm_lead_imports WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId);
  res.json(history);
});

module.exports = router;
