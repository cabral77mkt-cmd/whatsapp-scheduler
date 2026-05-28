const express = require('express');
const router = express.Router();
const db = require('../database');
const { VALID_STAGES } = require('../crm/leadService');

router.get('/pipeline', (req, res) => {
  const userId = Number(req.user.sub);
  const rows = db.prepare(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(potential_value),0) AS total_potential
    FROM crm_leads WHERE user_id = ?
    GROUP BY stage
  `).all(userId);
  const byStage = Object.fromEntries(VALID_STAGES.map(s => [s, { count: 0, total_potential: 0 }]));
  for (const r of rows) byStage[r.stage] = { count: r.count, total_potential: r.total_potential };
  res.json({ stages: byStage });
});

router.get('/closing', (req, res) => {
  const userId = Number(req.user.sub);
  const { from, to } = req.query;
  const where = ["user_id = ?", "stage = 'fechado'"];
  const params = [userId];
  if (from) { where.push("stage_changed_at >= ?"); params.push(from); }
  if (to)   { where.push("stage_changed_at <= ?"); params.push(to); }
  const rows = db.prepare(`
    SELECT id, name, phone, closed_value, stage_changed_at
    FROM crm_leads WHERE ${where.join(' AND ')}
    ORDER BY stage_changed_at DESC
  `).all(...params);
  const total = rows.reduce((s, r) => s + (r.closed_value || 0), 0);
  res.json({ count: rows.length, total_value: total, deals: rows });
});

router.get('/loss-reasons', (req, res) => {
  const userId = Number(req.user.sub);
  const rows = db.prepare(`
    SELECT COALESCE(loss_reason, 'sem motivo') AS reason, COUNT(*) AS count
    FROM crm_leads WHERE user_id = ? AND stage = 'perdido'
    GROUP BY loss_reason
    ORDER BY count DESC
  `).all(userId);
  res.json(rows);
});

router.get('/activity', (req, res) => {
  const userId = Number(req.user.sub);
  const sent = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_followups f JOIN crm_leads l ON l.id = f.lead_id
    WHERE l.user_id = ? AND f.status = 'sent'
  `).get(userId).c;
  const pending = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_followups f JOIN crm_leads l ON l.id = f.lead_id
    WHERE l.user_id = ? AND f.status = 'pending'
  `).get(userId).c;
  const stale = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
      AND (last_interaction_at IS NULL OR last_interaction_at < datetime('now','-7 days'))
  `).get(userId).c;
  const no_response = db.prepare(`
    SELECT COUNT(*) AS c FROM crm_leads l
    WHERE l.user_id = ? AND l.stage NOT IN ('fechado','perdido')
      AND NOT EXISTS (
        SELECT 1 FROM crm_message_log m WHERE m.lead_id = l.id AND m.direction = 'in'
        AND m.occurred_at > l.first_contact_at
      )
  `).get(userId).c;
  res.json({ followups_sent: sent, followups_pending: pending, leads_stale_7d: stale, leads_no_response: no_response });
});

// GET /conversion — taxa de conversao entre etapas (baseado no historico)
router.get('/conversion', (req, res) => {
  const userId = Number(req.user.sub);

  const entries = db.prepare(`
    SELECT to_stage AS stage, COUNT(DISTINCT lead_id) AS entered
    FROM crm_stage_history
    WHERE user_id = ?
    GROUP BY to_stage
  `).all(userId);

  const current = db.prepare(`
    SELECT stage, COUNT(*) AS count
    FROM crm_leads WHERE user_id = ?
    GROUP BY stage
  `).all(userId);

  const closed = db.prepare(`SELECT COUNT(*) AS c FROM crm_leads WHERE user_id = ? AND stage = 'fechado'`).get(userId).c;
  const lost   = db.prepare(`SELECT COUNT(*) AS c FROM crm_leads WHERE user_id = ? AND stage = 'perdido'`).get(userId).c;
  const total  = db.prepare(`SELECT COUNT(*) AS c FROM crm_leads WHERE user_id = ?`).get(userId).c;

  const entryMap   = Object.fromEntries(entries.map(r => [r.stage, r.entered]));
  const currentMap = Object.fromEntries(current.map(r => [r.stage, r.count]));

  res.json({
    total_leads: total,
    closed,
    lost,
    win_rate: total > 0 ? Math.round((closed / total) * 100) : 0,
    by_stage: VALID_STAGES.map(stage => ({
      stage,
      entered: entryMap[stage]  || 0,
      current: currentMap[stage] || 0,
    })),
  });
});

// GET /stage-time — tempo medio (em dias) que leads ficam em cada etapa
router.get('/stage-time', (req, res) => {
  const userId = Number(req.user.sub);

  const rows = db.prepare(`
    SELECT
      h1.to_stage AS stage,
      AVG(
        (JULIANDAY(h2.changed_at) - JULIANDAY(h1.changed_at))
      ) AS avg_days,
      COUNT(*) AS sample_count
    FROM crm_stage_history h1
    JOIN crm_stage_history h2
      ON h2.lead_id = h1.lead_id
      AND h2.from_stage = h1.to_stage
      AND h2.changed_at > h1.changed_at
    WHERE h1.user_id = ?
    GROUP BY h1.to_stage
    ORDER BY h1.to_stage
  `).all(userId);

  const current = db.prepare(`
    SELECT stage,
      AVG(JULIANDAY('now') - JULIANDAY(stage_changed_at)) AS avg_days_so_far,
      COUNT(*) AS count
    FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('fechado','perdido')
    GROUP BY stage
  `).all(userId);

  const avgMap = Object.fromEntries(rows.map(r => [r.stage, { avg_days: r.avg_days, sample: r.sample_count }]));
  const curMap = Object.fromEntries(current.map(r => [r.stage, { avg_days_so_far: r.avg_days_so_far, count: r.count }]));

  res.json({
    by_stage: VALID_STAGES.map(stage => ({
      stage,
      avg_days:        avgMap[stage]?.avg_days        ?? null,
      sample_count:    avgMap[stage]?.sample          ?? 0,
      avg_days_so_far: curMap[stage]?.avg_days_so_far ?? null,
      current_count:   curMap[stage]?.count           ?? 0,
    })),
  });
});

// GET /forecast — receita ponderada por probabilidade de fechamento por etapa
router.get('/forecast', (req, res) => {
  const userId = Number(req.user.sub);

  const WIN_PROB = {
    entrou_contato:      0.05,
    conversando:         0.10,
    diagnostico:         0.15,
    reuniao_agendada:    0.25,
    reuniao_realizada:   0.35,
    aguardando_proposta: 0.40,
    proposta_enviada:    0.50,
    analisando_proposta: 0.60,
    negociacao:          0.75,
    fechado:             1.00,
    perdido:             0.00,
  };

  const rows = db.prepare(`
    SELECT stage,
      COUNT(*) AS count,
      COALESCE(SUM(potential_value), 0) AS total_potential
    FROM crm_leads
    WHERE user_id = ? AND stage NOT IN ('perdido')
    GROUP BY stage
  `).all(userId);

  let forecast_total = 0;
  let pipeline_total = 0;
  const by_stage = VALID_STAGES.filter(s => s !== 'perdido').map(stage => {
    const row = rows.find(r => r.stage === stage);
    const count     = row?.count || 0;
    const potential = row?.total_potential || 0;
    const prob      = WIN_PROB[stage] ?? 0;
    const weighted  = Math.round(potential * prob);
    forecast_total += weighted;
    pipeline_total += potential;
    return { stage, count, potential, prob, weighted };
  });

  const closed = db.prepare(`
    SELECT COALESCE(SUM(closed_value), 0) AS total
    FROM crm_leads WHERE user_id = ? AND stage = 'fechado'
  `).get(userId);

  res.json({
    forecast_total,
    pipeline_total,
    realized: closed.total || 0,
    by_stage,
  });
});

module.exports = router;
