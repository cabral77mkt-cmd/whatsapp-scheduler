/**
 * urgencyJob.js
 * Job diário que detecta leads com evento próximo (≤ 30 dias) e:
 *  1. Eleva a temperatura para 'quente'
 *  2. Agenda uma mensagem de urgência (se ainda não enviada hoje)
 */

const db = require('../database');

function loadTemplates(userId) {
  const row = db.prepare('SELECT templates_json FROM crm_settings WHERE user_id = ?').get(userId);
  if (!row || !row.templates_json) return {};
  try { return JSON.parse(row.templates_json); } catch { return {}; }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr + 'T12:00:00').getTime() - Date.now();
  return Math.round(diff / 86400000);
}

function buildMessage(tpl, lead, event, daysLeft) {
  if (!tpl) return null;
  return tpl
    .replace(/\{nome\}/gi,    lead.name || 'Cliente')
    .replace(/\{evento\}/gi,  event?.event_name || 'seu evento')
    .replace(/\{dias\}/gi,    String(daysLeft))
    .replace(/\{data\}/gi,    event?.event_date || '')
    .replace(/\{cidade\}/gi,  event?.city || '');
}

/**
 * Executa a verificação de urgência para todos os usuários.
 * Chamado pelo scheduler uma vez ao dia (ex: às 08:30).
 */
function runUrgencyCheck() {
  const users = db.prepare('SELECT id FROM users').all();
  let processed = 0;

  for (const u of users) {
    const userId = Number(u.id);
    const tpls   = loadTemplates(userId);
    const urgencyTpl = tpls.event_urgency || null;

    // Leads ativos com data de evento entre hoje e +30 dias
    const leads = db.prepare(`
      SELECT l.*, e.event_name, e.event_date, e.city
      FROM crm_leads l
      JOIN crm_lead_event e ON e.lead_id = l.id
      WHERE l.user_id = ?
        AND l.stage NOT IN ('fechado', 'perdido')
        AND e.event_date IS NOT NULL
        AND e.event_date >= date('now')
        AND e.event_date <= date('now', '+30 days')
      ORDER BY e.event_date ASC
    `).all(userId);

    for (const lead of leads) {
      const daysLeft = daysUntil(lead.event_date);
      if (daysLeft === null) continue;

      // 1. Eleva temperatura para 'quente' (se ainda não for)
      if (lead.temperature !== 'quente') {
        db.prepare(`UPDATE crm_leads SET temperature = 'quente' WHERE id = ?`).run(lead.id);
        console.log(`[Urgency] Lead #${lead.id} (${lead.name}) → temperatura elevada para quente (${daysLeft} dias até evento)`);
      }

      // 2. Agenda mensagem de urgência — apenas se não houver uma pendente/enviada hoje
      if (!urgencyTpl) continue;

      const alreadyScheduledToday = db.prepare(`
        SELECT 1 FROM crm_followups
        WHERE lead_id = ? AND automation_type = 'event_urgency'
          AND date(scheduled_at) = date('now')
          AND status IN ('pending', 'sent')
      `).get(lead.id);

      if (alreadyScheduledToday) continue;

      // Busca dados do evento
      const event = { event_name: lead.event_name, event_date: lead.event_date, city: lead.city };
      const message = buildMessage(urgencyTpl, lead, event, daysLeft);
      if (!message || !message.trim()) continue;

      // Agenda para daqui a 10 minutos (horário comercial é garantido pelo CRM Scheduler)
      const scheduledAt = new Date(Date.now() + 10 * 60 * 1000);

      db.prepare(`
        INSERT INTO crm_followups
          (lead_id, user_id, message, scheduled_at, status, stage_at_schedule, automation_type)
        VALUES (?, ?, ?, ?, 'pending', ?, 'event_urgency')
      `).run(lead.id, userId, message, scheduledAt.toISOString(), lead.stage);

      console.log(`[Urgency] Lead #${lead.id} (${lead.name}) → urgência agendada (${daysLeft} dias até "${lead.event_name}")`);
      processed++;
    }
  }

  console.log(`[Urgency] Job concluído — ${processed} mensagem(ns) de urgência agendada(s)`);
}

module.exports = { runUrgencyCheck };
