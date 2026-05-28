'use strict';

/**
 * distributeService.js — Onda 5: Auto-distribuição de leads entre vendedores
 *
 * Estratégias suportadas:
 *   round_robin — distribui em rodízio (quem foi atribuído há mais tempo recebe o próximo)
 *   capacity    — distribui para quem tem menos leads ativos (abaixo de max_leads_per_seller)
 *
 * Chamado por autoLead.js após criação de novo lead.
 */

const db          = require('../database');
const pushService = require('../push/pushService');

/**
 * maybeAssign(leadId, ownerUserId, io)
 * Verifica se há distribuição configurada e ativa para ownerUserId.
 * Se sim, atribui o lead ao vendedor mais adequado.
 */
function maybeAssign(leadId, ownerUserId, io) {
  try {
    const config = db.prepare(`
      SELECT * FROM crm_distribution_config WHERE owner_user_id = ? AND enabled = 1
    `).get(ownerUserId);
    if (!config) return;

    const members = db.prepare(`
      SELECT * FROM crm_distribution_members
      WHERE owner_user_id = ? AND active = 1
      ORDER BY last_assigned_at ASC NULLS FIRST, id ASC
    `).all(ownerUserId);
    if (!members.length) return;

    let seller = null;

    if (config.strategy === 'round_robin') {
      // Pega quem foi atribuído há mais tempo (ou nunca)
      seller = members[0]; // já ordenado por last_assigned_at ASC
    } else if (config.strategy === 'capacity') {
      const max = config.max_leads_per_seller || 50;
      for (const m of members) {
        const count = db.prepare(`
          SELECT COUNT(*) AS c FROM crm_leads
          WHERE responsible_user_id = ? AND stage NOT IN ('fechado','perdido')
        `).get(m.member_user_id)?.c || 0;
        if (count < max) { seller = m; break; }
      }
    }

    if (!seller) {
      console.log(`[Distribute] Nenhum vendedor disponível para lead #${leadId}`);
      return;
    }

    // Atribui o lead
    db.prepare('UPDATE crm_leads SET responsible_user_id = ? WHERE id = ?')
      .run(seller.member_user_id, leadId);

    // Atualiza estatísticas do membro
    db.prepare(`
      UPDATE crm_distribution_members
      SET last_assigned_at = CURRENT_TIMESTAMP,
          total_assigned   = total_assigned + 1
      WHERE id = ?
    `).run(seller.id);

    // Notifica o vendedor designado
    const lead = db.prepare('SELECT name, phone FROM crm_leads WHERE id = ?').get(leadId);
    const sellerUser = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(seller.member_user_id);
    const sellerName = sellerUser?.display_name || sellerUser?.username || `user #${seller.member_user_id}`;
    const leadName   = lead?.name || lead?.phone || `lead #${leadId}`;

    if (io) {
      io.to(`user:${seller.member_user_id}`).emit('crm:lead_assigned', {
        lead_id:   leadId,
        lead_name: leadName,
        phone:     lead?.phone,
      });
    }

    pushService.sendToUser(seller.member_user_id, {
      title: `👤 Novo lead: ${leadName}`,
      body:  `Foi atribuído para você via distribuição automática`,
      url:   `/crm/leads`,
      tag:   `lead-assigned-${leadId}`,
    }).catch(() => {});

    console.log(`[Distribute] Lead #${leadId} → ${sellerName} (${config.strategy})`);
  } catch (e) {
    console.warn('[Distribute] Erro:', e.message);
  }
}

module.exports = { maybeAssign };
