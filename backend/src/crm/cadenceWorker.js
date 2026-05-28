'use strict';

/**
 * cadenceWorker.js
 *
 * Avança as cadências ativas. Chamado a cada minuto pelo scheduler.
 * - Busca enrollments com next_step_at <= agora e status = 'active'
 * - Expande variáveis no template ({nome}, {evento}, {cidade}, {data})
 * - Envia mensagem via WhatsApp
 * - Loga em crm_message_log
 * - Avança current_step / marca completed
 */

const db = require('../database');
const { sendMessage, getStatus } = require('../whatsapp/client');
const { nextAllowedSlot } = require('./businessHours');
const autoLead = require('./autoLead');

const UNIT_MS = {
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
};

function expandVariables(template, lead, event) {
  return template
    .replace(/\{nome\}/gi,   lead.name  || lead.phone || '')
    .replace(/\{evento\}/gi, event?.event_name || '')
    .replace(/\{cidade\}/gi, event?.city  || '')
    .replace(/\{data\}/gi,   event?.event_date || '')
    .replace(/\{telefone\}/gi, lead.phone || '');
}

async function runCadenceWorker() {
  const now = new Date().toISOString();

  const enrollments = db.prepare(`
    SELECT e.*, l.phone, l.name, l.user_id, c.name AS cadence_name
    FROM crm_cadence_enrollments e
    JOIN crm_leads l ON l.id = e.lead_id
    JOIN crm_cadences c ON c.id = e.cadence_id
    WHERE e.status = 'active'
      AND e.next_step_at <= ?
      AND c.active = 1
    LIMIT 20
  `).all(now);

  if (!enrollments.length) return;

  for (const enrollment of enrollments) {
    try {
      await processEnrollment(enrollment);
    } catch (err) {
      console.error(`[cadenceWorker] Erro no enrollment ${enrollment.id}:`, err.message);
    }
  }
}

async function processEnrollment(enrollment) {
  const { lead_id, cadence_id, current_step, user_id, phone, name } = enrollment;

  // Carrega o passo atual
  const step = db.prepare(`
    SELECT * FROM crm_cadence_steps
    WHERE cadence_id = ? AND step_order = ?
  `).get(cadence_id, current_step);

  if (!step) {
    // Sem mais passos — concluir enrollment
    db.prepare(`UPDATE crm_cadence_enrollments SET status = 'completed' WHERE id = ?`).run(enrollment.id);
    console.log(`[cadenceWorker] Enrollment ${enrollment.id} concluído (sem mais passos)`);
    return;
  }

  // Verificar WhatsApp conectado
  if (getStatus(user_id) !== 'connected') {
    console.log(`[cadenceWorker] WA do user ${user_id} desconectado — adiando enrollment ${enrollment.id}`);
    // Adia 30 min
    const retry = nextAllowedSlot(user_id, new Date(Date.now() + 30 * 60 * 1000));
    db.prepare(`UPDATE crm_cadence_enrollments SET next_step_at = ? WHERE id = ?`).run(retry.toISOString(), enrollment.id);
    return;
  }

  // Verifica se deve pular por ter recebido resposta
  if (step.skip_if_replied) {
    const lastMsg = db.prepare(`
      SELECT direction, occurred_at FROM crm_message_log
      WHERE lead_id = ?
      ORDER BY occurred_at DESC LIMIT 1
    `).get(lead_id);

    const enrolledAt = new Date(enrollment.enrolled_at).getTime();
    if (lastMsg?.direction === 'in' && new Date(lastMsg.occurred_at).getTime() > enrolledAt) {
      // Lead respondeu após enroll — pausar
      db.prepare(`UPDATE crm_cadence_enrollments SET status = 'paused' WHERE id = ?`).run(enrollment.id);
      console.log(`[cadenceWorker] Enrollment ${enrollment.id} pausado — lead respondeu`);
      return;
    }
  }

  // Expande variáveis
  const event = db.prepare('SELECT * FROM crm_lead_event WHERE lead_id = ?').get(lead_id);
  const lead = { phone, name, user_id };
  const message = expandVariables(step.message_template, lead, event);

  if (!message.trim()) {
    console.warn(`[cadenceWorker] Passo ${step.id} tem template vazio — avançando`);
  } else {
    // Envia mensagem
    const result = await sendMessage(user_id, phone, message);
    autoLead.logOutboundMessage(lead_id, message, result?.msgId || null);
    console.log(`[cadenceWorker] Enviado passo ${current_step} da cadência ${cadence_id} para lead ${lead_id}`);
  }

  // Avança para o próximo passo
  const nextStepOrder = current_step + 1;
  const nextStep = db.prepare(`
    SELECT * FROM crm_cadence_steps
    WHERE cadence_id = ? AND step_order = ?
  `).get(cadence_id, nextStepOrder);

  if (!nextStep) {
    // Era o último passo
    db.prepare(`
      UPDATE crm_cadence_enrollments SET status = 'completed', current_step = ? WHERE id = ?
    `).run(nextStepOrder, enrollment.id);
    console.log(`[cadenceWorker] Enrollment ${enrollment.id} concluído após último passo`);
    return;
  }

  // Calcula próximo horário respeitando business hours
  const waitMs = (nextStep.wait_amount || 1) * (UNIT_MS[nextStep.wait_unit] || UNIT_MS.days);
  const rawNext = new Date(Date.now() + waitMs);
  const nextAt = nextAllowedSlot(user_id, rawNext);

  db.prepare(`
    UPDATE crm_cadence_enrollments
    SET current_step = ?, next_step_at = ?
    WHERE id = ?
  `).run(nextStepOrder, nextAt.toISOString(), enrollment.id);
}

module.exports = { runCadenceWorker };
