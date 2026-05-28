const db = require('../database');
const automationRules = require('./automationRules');

const VALID_STAGES = [
  'entrou_contato', 'conversando', 'diagnostico', 'reuniao_agendada',
  'reuniao_realizada', 'aguardando_proposta', 'proposta_enviada',
  'analisando_proposta', 'negociacao', 'fechado', 'perdido'
];

function moveStage(leadId, userId, newStage, position = null) {
  if (!VALID_STAGES.includes(newStage)) throw new Error('Etapa inválida');
  const lead = db.prepare('SELECT id, user_id, stage FROM crm_leads WHERE id = ? AND user_id = ?').get(leadId, userId);
  if (!lead) throw new Error('Lead não encontrado');
  if (lead.stage === newStage && position === null) return lead;

  const now = new Date().toISOString();
  if (position !== null) {
    db.prepare('UPDATE crm_leads SET stage = ?, position = ?, stage_changed_at = ? WHERE id = ?')
      .run(newStage, position, now, leadId);
  } else {
    db.prepare('UPDATE crm_leads SET stage = ?, stage_changed_at = ? WHERE id = ?')
      .run(newStage, now, leadId);
  }

  if (lead.stage !== newStage) {
    // Registra histórico de mudança de etapa para métricas de conversão e tempo
    db.prepare(`
      INSERT INTO crm_stage_history (lead_id, user_id, from_stage, to_stage, changed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(leadId, userId, lead.stage, newStage, now);

    automationRules.onStageChange(leadId, newStage);
  }
  return db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
}

function cancelPendingFollowups(leadId, types = null) {
  if (types && types.length) {
    automationRules.cancelPendingByTypes(leadId, types);
  } else {
    db.prepare("UPDATE crm_followups SET status='canceled' WHERE lead_id = ? AND status = 'pending'").run(leadId);
  }
}

module.exports = { moveStage, cancelPendingFollowups, VALID_STAGES };
