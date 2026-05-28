const db = require('../database');

function loadTemplates(userId) {
  const row = db.prepare('SELECT templates_json FROM crm_settings WHERE user_id = ?').get(userId);
  if (!row || !row.templates_json) return {};
  try { return JSON.parse(row.templates_json); }
  catch { return {}; }
}

function getLead(leadId) {
  return db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId);
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function setHourMinute(date, hh, mm) {
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function insertFollowup(lead, message, scheduledAt, automationType, extra = {}) {
  if (!message || !message.trim()) return null;
  const info = db.prepare(`
    INSERT INTO crm_followups
      (lead_id, user_id, message, scheduled_at, status, stage_at_schedule, automation_type, meeting_id, proposal_id)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    lead.id, lead.user_id, message, scheduledAt.toISOString(),
    lead.stage, automationType,
    extra.meeting_id || null, extra.proposal_id || null
  );
  return info.lastInsertRowid;
}

function cancelPendingByTypes(leadId, types) {
  if (!types.length) return;
  const placeholders = types.map(() => '?').join(',');
  db.prepare(
    `UPDATE crm_followups SET status='canceled'
     WHERE lead_id = ? AND status = 'pending' AND automation_type IN (${placeholders})`
  ).run(leadId, ...types);
}

function scheduleNoReplySequence(leadId, baseTime) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  cancelPendingByTypes(leadId, ['no_reply_24h', 'no_reply_48h', 'no_reply_7d']);
  const base = new Date(baseTime);
  insertFollowup(lead, tpls.no_reply_24h, addMinutes(base, 60 * 24), 'no_reply_24h');
  insertFollowup(lead, tpls.no_reply_48h, addMinutes(base, 60 * 48), 'no_reply_48h');
  insertFollowup(lead, tpls.no_reply_7d, addMinutes(base, 60 * 24 * 7), 'no_reply_7d');
}

function onLeadCreated(leadId) {
  scheduleNoReplySequence(leadId, new Date());
}

function onInboundMessage(leadId) {
  cancelPendingByTypes(leadId, [
    'no_reply_24h', 'no_reply_48h', 'no_reply_7d',
    'proposal_24h', 'proposal_3d', 'proposal_5d',
    'analyzing_2d', 'analyzing_5d',
    'post_meeting',
  ]);
  // Pausa cadências ativas quando o lead responde
  try {
    db.prepare(`
      UPDATE crm_cadence_enrollments SET status = 'paused'
      WHERE lead_id = ? AND status = 'active'
    `).run(leadId);
  } catch (e) { /* tabela pode não existir ainda */ }
}

function scheduleMeetingConfirmation(leadId, meetingId) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  cancelPendingByTypes(leadId, ['meeting_confirmation']);
  // Envia confirmação imediata (2 min de delay para evitar envio instantâneo)
  insertFollowup(lead, tpls.meeting_confirmation, addMinutes(new Date(), 2), 'meeting_confirmation', { meeting_id: meetingId });
}

function scheduleMeetingReminders(leadId, meetingId, meetingAt) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  const meeting = new Date(meetingAt);
  const horario = String(meeting.getHours()).padStart(2, '0') + ':' + String(meeting.getMinutes()).padStart(2, '0');

  cancelPendingByTypes(leadId, ['meeting_morning', 'meeting_30min']);

  const morning = setHourMinute(meeting, 8, 0);
  if (morning < meeting) {
    const txt = (tpls.meeting_morning || '').replace(/\[HORARIO\]/g, horario);
    insertFollowup(lead, txt, morning, 'meeting_morning', { meeting_id: meetingId });
  }
  const thirty = addMinutes(meeting, -30);
  if (thirty > new Date()) {
    const txt = (tpls.meeting_30min || '').replace(/\[HORARIO\]/g, horario);
    insertFollowup(lead, txt, thirty, 'meeting_30min', { meeting_id: meetingId });
  }
}

function schedulePostMeetingFollowup(leadId) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  cancelPendingByTypes(leadId, ['post_meeting']);
  // Envia 1 hora após entrar na etapa "reunião realizada"
  insertFollowup(lead, tpls.post_meeting, addMinutes(new Date(), 60), 'post_meeting');
}

function scheduleLostReactivation(leadId) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  cancelPendingByTypes(leadId, ['lost_30d', 'lost_60d', 'lost_90d']);
  const base = new Date();
  insertFollowup(lead, tpls.lost_30d, addMinutes(base, 60 * 24 * 30), 'lost_30d');
  insertFollowup(lead, tpls.lost_60d, addMinutes(base, 60 * 24 * 60), 'lost_60d');
  insertFollowup(lead, tpls.lost_90d, addMinutes(base, 60 * 24 * 90), 'lost_90d');
}

function scheduleProposalFollowups(leadId, proposalId, sentAt) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  cancelPendingByTypes(leadId, ['proposal_24h', 'proposal_3d', 'proposal_5d']);
  const base = new Date(sentAt);
  insertFollowup(lead, tpls.proposal_24h, addMinutes(base, 60 * 24), 'proposal_24h', { proposal_id: proposalId });
  insertFollowup(lead, tpls.proposal_3d,  addMinutes(base, 60 * 24 * 3), 'proposal_3d', { proposal_id: proposalId });
  insertFollowup(lead, tpls.proposal_5d,  addMinutes(base, 60 * 24 * 5), 'proposal_5d', { proposal_id: proposalId });
}

function scheduleAnalyzingFollowups(leadId) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  cancelPendingByTypes(leadId, ['analyzing_2d', 'analyzing_5d']);
  const base = new Date();
  insertFollowup(lead, tpls.analyzing_2d, addMinutes(base, 60 * 24 * 2), 'analyzing_2d');
  insertFollowup(lead, tpls.analyzing_5d, addMinutes(base, 60 * 24 * 5), 'analyzing_5d');
}

function scheduleClosedWelcome(leadId) {
  const lead = getLead(leadId);
  if (!lead) return;
  const tpls = loadTemplates(lead.user_id);
  if (!tpls.closed_welcome || !tpls.closed_welcome.trim()) return;
  insertFollowup(lead, tpls.closed_welcome, new Date(), 'closed_welcome');
}

function onStageChange(leadId, newStage) {
  const lead = getLead(leadId);
  if (!lead) return;
  if (lead.automations_enabled === 0) return;

  switch (newStage) {
    case 'conversando':
      scheduleNoReplySequence(leadId, new Date());
      break;
    case 'reuniao_realizada':
      schedulePostMeetingFollowup(leadId);
      break;
    case 'analisando_proposta':
      scheduleAnalyzingFollowups(leadId);
      break;
    case 'fechado':
      // Cancela todas as reativações de perdido caso o lead seja recuperado
      cancelPendingByTypes(leadId, ['lost_30d', 'lost_60d', 'lost_90d']);
      scheduleClosedWelcome(leadId);
      break;
    case 'perdido':
      scheduleLostReactivation(leadId);
      break;
  }
}

module.exports = {
  onLeadCreated,
  onInboundMessage,
  onStageChange,
  scheduleNoReplySequence,
  scheduleMeetingConfirmation,
  scheduleMeetingReminders,
  schedulePostMeetingFollowup,
  scheduleProposalFollowups,
  scheduleAnalyzingFollowups,
  scheduleClosedWelcome,
  scheduleLostReactivation,
  cancelPendingByTypes,
  loadTemplates
};
