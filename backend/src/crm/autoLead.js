const db = require('../database');
const automationRules = require('./automationRules');
const pushService = require('../push/pushService');
const metrics = require('./metricsService');
const autoResponder = require('./autoResponder');
const distributeService = require('./distributeService');

function extractBody(msg) {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return '[imagem] ' + (m.imageMessage.caption || '');
  if (m.imageMessage) return '[imagem]';
  if (m.videoMessage?.caption) return '[vídeo] ' + (m.videoMessage.caption || '');
  if (m.videoMessage) return '[vídeo]';
  if (m.audioMessage) return '[áudio]';
  if (m.documentMessage) return '[documento] ' + (m.documentMessage.fileName || '');
  if (m.stickerMessage) return '[sticker]';
  if (m.locationMessage) return '[localização]';
  if (m.contactMessage) return '[contato]';
  return '[mensagem]';
}

// JID suffixes que NÃO são DMs de pessoas reais
const NON_DM_SUFFIXES = ['@g.us', '@newsletter', '@broadcast', '@lid-dm', '@call'];

/**
 * Valida se um telefone extraído de JID é um número real.
 * Telefones válidos: 8–15 dígitos, sem prefixos de sistema.
 */
function isValidPhoneNumber(phone) {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) return false;   // fora do padrão E.164
  if (digits.startsWith('000')) return false;                   // broadcast/sistema
  if (digits === '0' || digits === '') return false;
  return true;
}

async function handleIncomingDM(userId, msg, io, lidToPhone) {
  try {
    const remoteJid = msg.key?.remoteJid;

    // Filtra grupos, newsletters, broadcasts e qualquer JID que não seja DM real
    if (!remoteJid) return;
    if (NON_DM_SUFFIXES.some(s => remoteJid.endsWith(s))) return;
    if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) return;

    if (msg.key?.fromMe) return;

    // Resolve telefone: @lid usa mapa de resolução, @s.whatsapp.net extrai diretamente
    let phone;
    if (remoteJid.endsWith('@lid')) {
      const lid = remoteJid.split('@')[0];
      // 1ª opção: mapa lid→phone (populado pelo contacts.upsert ou senderPn)
      phone = lidToPhone?.get(lid) || null;
      // 2ª opção: senderPn direto na mensagem (Baileys 6.x — presente em muitas msgs @lid)
      if (!phone && msg.key?.senderPn) {
        phone = msg.key.senderPn.replace(/[^0-9]/g, '') || null;
      }
      if (!phone) return; // buffer no client.js cuida da espera — aqui só descarta se ainda sem mapa
    } else {
      phone = remoteJid.split('@')[0].replace(/[^0-9]/g, '');
    }

    // Valida se o telefone extraído é um número real (não ID interno do WA)
    if (!isValidPhoneNumber(phone)) {
      console.log(`[CRM:${userId}] JID ignorado (número inválido): ${remoteJid} → "${phone}"`);
      return;
    }

    const settings = db.prepare('SELECT auto_create_leads FROM crm_settings WHERE user_id = ?').get(userId);
    if (settings && settings.auto_create_leads === 0) {
      console.log(`[CRM:${userId}] auto_create_leads desativado nas configurações — mensagem ignorada`);
      return;
    }

    // ⚠️  Removida a verificação de contatos: salvar o número na agenda NÃO deve impedir
    // que a pessoa seja cadastrada como lead. Numa conta comercial praticamente todos os
    // clientes teriam esse bloqueio.

    const body = extractBody(msg);
    const waMsgId = msg.key?.id || null;
    const pushName = msg.pushName || null;
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id, stage, last_interaction_at FROM crm_leads WHERE user_id = ? AND phone = ?').get(userId, phone);

    if (existing) {
      // ─── F4: Hot Recovery Alert ──────────────────────────────────────────
      // Detecta lead que estava frio (>5d sem resposta) e acabou de responder
      const COLD_THRESHOLD_DAYS = 5;
      let isHotRecovery = false;
      if (existing.last_interaction_at) {
        const daysSilent = (Date.now() - new Date(existing.last_interaction_at).getTime()) / 86400000;
        if (daysSilent >= COLD_THRESHOLD_DAYS) {
          isHotRecovery = true;
          try {
            db.prepare(`UPDATE crm_leads SET hot_recovery_at = ?, last_reengagement_at = ? WHERE id = ?`)
              .run(now, now, existing.id);
            // Boost temperatura para quente no recovery
            db.prepare(`UPDATE crm_leads SET temperature = 'quente' WHERE id = ? AND temperature != 'quente'`)
              .run(existing.id);
          } catch (e) { console.warn('[HotRecovery] Erro ao marcar recovery:', e.message); }
        }
      }

      db.prepare(`INSERT INTO crm_message_log (lead_id, direction, body, wa_msg_id) VALUES (?, 'in', ?, ?)`)
        .run(existing.id, body, waMsgId);
      db.prepare(`UPDATE crm_leads SET last_interaction_at = ? WHERE id = ?`).run(now, existing.id);
      automationRules.onInboundMessage(existing.id);

      if (io) {
        const payload = { lead_id: existing.id, direction: 'in', body, occurred_at: now, phone };
        io.to(`user:${userId}`).emit('crm:lead_updated', { lead_id: existing.id });
        io.to(`user:${userId}`).emit('inbox:new-message', payload);
        if (isHotRecovery) {
          const fullLead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(existing.id);
          io.to(`user:${userId}`).emit('crm:hot_recovery', {
            lead_id: existing.id,
            lead_name: fullLead?.name || phone,
            phone,
            body: body.slice(0, 120),
            days_silent: Math.floor((Date.now() - new Date(existing.last_interaction_at).getTime()) / 86400000),
          });
          console.log(`[HotRecovery] 🔥 Lead ${fullLead?.name || phone} RETORNOU após ${Math.floor((Date.now() - new Date(existing.last_interaction_at).getTime()) / 86400000)}d`);
        }
      }

      // Auto-responder (First Responder / SDR)
      autoResponder.maybeAutoRespond(userId, existing.id, phone, body, io).catch(e =>
        console.warn('[autoLead] autoResponder error:', e.message)
      );

      // Push notification
      try {
        const lead = db.prepare('SELECT name, temperature FROM crm_leads WHERE id = ?').get(existing.id);
        if (isHotRecovery) {
          metrics.increment(userId, 'hot_recovery_total');
          // Push especial de hot recovery — urgente
          pushService.sendToUser(userId, {
            title: `🔥 RETORNOU! ${lead?.name || phone}`,
            body:  `Ficou ${Math.floor((Date.now() - new Date(existing.last_interaction_at).getTime()) / 86400000)}d sem responder e agora respondeu: "${body.slice(0, 80)}"`,
            url:   `/inbox?lead=${existing.id}`,
            tag:   `hot-recovery-${existing.id}`,
            urgency: 'high',
          }).catch(() => {});
        } else if (lead?.temperature === 'quente') {
          pushService.sendToUser(userId, {
            title: `🔥 ${lead.name || phone} respondeu`,
            body:  body.slice(0, 120),
            url:   `/inbox?lead=${existing.id}`,
            tag:   `lead-${existing.id}`,
          }).catch(() => {});
        }
      } catch {}
      return;
    }

    const info = db.prepare(`
      INSERT INTO crm_leads
        (user_id, name, phone, stage, source, first_contact_at, last_interaction_at, stage_changed_at)
      VALUES (?, ?, ?, 'entrou_contato', 'whatsapp_dm', ?, ?, ?)
    `).run(userId, pushName, phone, now, now, now);
    const leadId = info.lastInsertRowid;
    console.log(`[CRM:${userId}] ✅ Novo lead criado: id=${leadId} phone=${phone} name=${pushName || '(sem nome)'}`);

    db.prepare(`INSERT INTO crm_message_log (lead_id, direction, body, wa_msg_id) VALUES (?, 'in', ?, ?)`)
      .run(leadId, body, waMsgId);

    metrics.increment(userId, 'leads_created');
    automationRules.onLeadCreated(leadId);

    if (io) {
      const payload = { lead_id: leadId, direction: 'in', body, occurred_at: now, phone };
      io.to(`user:${userId}`).emit('crm:lead_created', { lead_id: leadId });
      io.to(`user:${userId}`).emit('inbox:new-message', payload);
    }

    // Onda 5: distribui lead entre vendedores
    distributeService.maybeAssign(leadId, userId, io);

    // Auto-responder para leads novos
    autoResponder.maybeAutoRespond(userId, leadId, phone, body, io).catch(e =>
      console.warn('[autoLead] autoResponder error:', e.message)
    );
  } catch (err) {
    console.error('[CRM autoLead] erro:', err);
  }
}

function logOutboundMessage(leadId, body, waMsgId, followupId = null) {
  db.prepare(`INSERT INTO crm_message_log (lead_id, direction, body, wa_msg_id, followup_id) VALUES (?, 'out', ?, ?, ?)`)
    .run(leadId, body, waMsgId, followupId);
  db.prepare(`UPDATE crm_leads SET last_interaction_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
  // Conta métrica: mensagem enviada + follow-up (se vinculado)
  try {
    const lead = db.prepare('SELECT user_id FROM crm_leads WHERE id = ?').get(leadId);
    if (lead) {
      metrics.increment(lead.user_id, 'messages_sent');
      if (followupId) metrics.increment(lead.user_id, 'followups_done');
    }
  } catch {}
}

module.exports = { handleIncomingDM, logOutboundMessage, extractBody };
