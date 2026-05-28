const express = require('express');
const router = express.Router();
const db = require('../database');
const businessHours = require('../crm/businessHours');

const UNIT_MS = {
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
};

/* ── GET / — lista cadências do usuário + templates do sistema ── */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);

  const cadences = db.prepare(`
    SELECT c.*,
      (CASE WHEN c.user_id = 0 THEN 1 ELSE 0 END) AS is_template,
      (SELECT COUNT(*) FROM crm_cadence_steps WHERE cadence_id = c.id) AS steps_count,
      (SELECT COUNT(*) FROM crm_cadence_enrollments WHERE cadence_id = c.id AND status = 'active') AS active_enrollments,
      (SELECT COUNT(*) FROM crm_cadence_enrollments WHERE cadence_id = c.id) AS total_enrollments
    FROM crm_cadences c
    WHERE c.user_id = ? OR c.user_id = 0
    ORDER BY c.user_id DESC, c.created_at DESC
  `).all(userId);

  res.json(cadences);
});

/* ── GET /:id — detalhe com steps e stats ────────────────── */
router.get('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);

  const cadence = db.prepare('SELECT * FROM crm_cadences WHERE id = ? AND (user_id = ? OR user_id = 0)').get(id, userId);
  if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });

  const steps = db.prepare(`
    SELECT * FROM crm_cadence_steps WHERE cadence_id = ? ORDER BY step_order ASC
  `).all(id);

  const stats = db.prepare(`
    SELECT status, COUNT(*) AS count FROM crm_cadence_enrollments
    WHERE cadence_id = ? GROUP BY status
  `).all(id);

  res.json({ ...cadence, steps, stats });
});

/* ── POST / — criar cadência com steps ──────────────────── */
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { name, description, trigger_stage, steps = [] } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

  const info = db.prepare(`
    INSERT INTO crm_cadences (user_id, name, description, trigger_stage)
    VALUES (?, ?, ?, ?)
  `).run(userId, name.trim(), description || null, trigger_stage || null);

  const cadenceId = info.lastInsertRowid;
  saveSteps(cadenceId, steps);

  const cadence = db.prepare('SELECT * FROM crm_cadences WHERE id = ?').get(cadenceId);
  const savedSteps = db.prepare('SELECT * FROM crm_cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(cadenceId);
  res.status(201).json({ ...cadence, steps: savedSteps });
});

/* ── PUT /:id — atualizar cadência + steps ───────────────── */
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const cadence = db.prepare('SELECT id FROM crm_cadences WHERE id = ? AND user_id = ?').get(id, userId);
  if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });

  const { name, description, trigger_stage, steps } = req.body;
  db.prepare(`
    UPDATE crm_cadences SET name = ?, description = ?, trigger_stage = ? WHERE id = ?
  `).run(name?.trim() || '', description || null, trigger_stage || null, id);

  if (Array.isArray(steps)) saveSteps(id, steps);

  const updated = db.prepare('SELECT * FROM crm_cadences WHERE id = ?').get(id);
  const savedSteps = db.prepare('SELECT * FROM crm_cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(id);
  res.json({ ...updated, steps: savedSteps });
});

/* ── PATCH /:id/toggle — ativar/desativar ────────────────── */
router.patch('/:id/toggle', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const cadence = db.prepare('SELECT * FROM crm_cadences WHERE id = ? AND user_id = ?').get(id, userId);
  if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });
  db.prepare('UPDATE crm_cadences SET active = ? WHERE id = ?').run(cadence.active ? 0 : 1, id);
  res.json({ ok: true, active: !cadence.active });
});

/* ── DELETE /:id ─────────────────────────────────────────── */
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const id = Number(req.params.id);
  const cadence = db.prepare('SELECT id FROM crm_cadences WHERE id = ? AND user_id = ?').get(id, userId);
  if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });
  db.prepare('DELETE FROM crm_cadences WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ── POST /:id/enroll — matricular lead ──────────────────── */
router.post('/:id/enroll', (req, res) => {
  const userId = Number(req.user.sub);
  const cadenceId = Number(req.params.id);
  const { lead_id } = req.body;

  if (!lead_id) return res.status(400).json({ error: 'lead_id é obrigatório' });

  const cadence = db.prepare('SELECT * FROM crm_cadences WHERE id = ? AND (user_id = ? OR user_id = 0)').get(cadenceId, userId);
  if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });

  const lead = db.prepare('SELECT id, user_id FROM crm_leads WHERE id = ? AND user_id = ?').get(lead_id, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  // Primeiro passo da cadência
  const firstStep = db.prepare(`
    SELECT * FROM crm_cadence_steps WHERE cadence_id = ? ORDER BY step_order ASC LIMIT 1
  `).get(cadenceId);

  if (!firstStep) return res.status(400).json({ error: 'Cadência sem passos configurados' });

  // Calcula quando disparar o primeiro passo
  const waitMs = (firstStep.wait_amount || 0) * (UNIT_MS[firstStep.wait_unit] || UNIT_MS.days);
  const rawNext = waitMs > 0 ? new Date(Date.now() + waitMs) : new Date();
  const nextAt = businessHours.nextAllowedSlot(userId, rawNext);

  try {
    const info = db.prepare(`
      INSERT INTO crm_cadence_enrollments
        (lead_id, cadence_id, current_step, status, next_step_at)
      VALUES (?, ?, ?, 'active', ?)
      ON CONFLICT(lead_id, cadence_id) DO UPDATE SET
        current_step = 0,
        status = 'active',
        next_step_at = excluded.next_step_at,
        enrolled_at = CURRENT_TIMESTAMP
    `).run(lead_id, cadenceId, firstStep.step_order, nextAt.toISOString());

    res.status(201).json({ ok: true, enrollment_id: info.lastInsertRowid, next_step_at: nextAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /enrollments/:leadId — matrículas de um lead ────── */
router.get('/enrollments/:leadId', (req, res) => {
  const userId = Number(req.user.sub);
  const leadId = Number(req.params.leadId);

  const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const enrollments = db.prepare(`
    SELECT e.*, c.name AS cadence_name, c.active AS cadence_active,
      (SELECT COUNT(*) FROM crm_cadence_steps WHERE cadence_id = e.cadence_id) AS total_steps
    FROM crm_cadence_enrollments e
    JOIN crm_cadences c ON c.id = e.cadence_id
    WHERE e.lead_id = ?
    ORDER BY e.enrolled_at DESC
  `).all(leadId);

  res.json(enrollments);
});

/* ── PATCH /enrollments/:enrollId/status ─────────────────── */
router.patch('/enrollments/:enrollId/status', (req, res) => {
  const userId = Number(req.user.sub);
  const enrollId = Number(req.params.enrollId);
  const { status } = req.body;

  const VALID = ['active', 'paused', 'canceled'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  // Verifica ownership via join
  const enrollment = db.prepare(`
    SELECT e.id FROM crm_cadence_enrollments e
    JOIN crm_leads l ON l.id = e.lead_id
    WHERE e.id = ? AND l.user_id = ?
  `).get(enrollId, userId);
  if (!enrollment) return res.status(404).json({ error: 'Matrícula não encontrada' });

  db.prepare('UPDATE crm_cadence_enrollments SET status = ? WHERE id = ?').run(status, enrollId);
  res.json({ ok: true });
});

/* ── Helper: substituir steps de uma cadência ───────────── */
function saveSteps(cadenceId, steps) {
  db.prepare('DELETE FROM crm_cadence_steps WHERE cadence_id = ?').run(cadenceId);
  const stmt = db.prepare(`
    INSERT INTO crm_cadence_steps (cadence_id, step_order, wait_amount, wait_unit, message_template, skip_if_replied)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  steps.forEach((s, idx) => {
    stmt.run(
      cadenceId,
      idx,
      Number(s.wait_amount) || 1,
      ['minutes', 'hours', 'days'].includes(s.wait_unit) ? s.wait_unit : 'days',
      s.message_template || '',
      s.skip_if_replied !== false ? 1 : 0,
    );
  });
}

module.exports = router;
