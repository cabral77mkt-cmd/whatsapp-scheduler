'use strict';

/**
 * tickfyCrmSync.js — Onda 6: Integração Tickfy ↔ CRM
 *
 * Quando uma venda Tickfy é detectada pelo poller, este serviço:
 *   1. Verifica se a integração está ativa e se o status deve ser sincronizado
 *   2. Busca ou cria o lead no CRM pelo telefone do comprador
 *   3. Aplica tags (Tickfy + nome do evento)
 *   4. Registra uma nota no histórico do lead
 *   5. Grava o registro de sync em crm_tickfy_lead_sync
 */

const db = require('../database');

/**
 * Garante que uma tag existe para o usuário e retorna seu id.
 * Usa a cor dourada para tags Tickfy, violeta para tags de evento.
 */
function ensureTag(userId, name, color = '#D4AF37') {
  try {
    const existing = db.prepare('SELECT id FROM crm_tags WHERE user_id = ? AND name = ?').get(userId, name);
    if (existing) return existing.id;
    const info = db.prepare('INSERT INTO crm_tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, name, color);
    return info.lastInsertRowid;
  } catch {
    // UNIQUE race condition — busca novamente
    return db.prepare('SELECT id FROM crm_tags WHERE user_id = ? AND name = ?').get(userId, name)?.id;
  }
}

/**
 * syncSale(sale, userId)
 *
 * sale: linha da tabela tickfy_sales
 * userId: dono do WhatsApp/CRM
 */
function syncSale(sale, userId) {
  try {
    const cfg = db.prepare(`
      SELECT * FROM crm_tickfy_integration WHERE user_id = ? AND enabled = 1
    `).get(userId);
    if (!cfg) return;

    // Verifica se este status deve ser sincronizado
    let syncStatuses = ['PG'];
    try { syncStatuses = JSON.parse(cfg.sync_statuses || '["PG"]'); } catch {}
    if (!syncStatuses.includes(sale.status_code)) return;

    // Evita sincronização dupla
    const alreadySynced = db.prepare(
      'SELECT id FROM crm_tickfy_lead_sync WHERE user_id = ? AND sale_id = ?'
    ).get(userId, sale.id);
    if (alreadySynced) return;

    const phone = sale.comprador_telefone;
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      // Registra como ignorado (sem telefone)
      db.prepare(`
        INSERT OR IGNORE INTO crm_tickfy_lead_sync
          (user_id, sale_id, lead_id, phone, evento, valor, status_code, action)
        VALUES (?, ?, NULL, NULL, ?, ?, ?, 'skipped')
      `).run(userId, sale.id, sale.evento, sale.valor, sale.status_code);
      return;
    }

    // ── Busca ou cria o lead ───────────────────────────────────────────
    let lead = db.prepare('SELECT * FROM crm_leads WHERE user_id = ? AND phone = ?').get(userId, phone);
    let action = 'updated';
    const now = new Date().toISOString();

    if (!lead) {
      const info = db.prepare(`
        INSERT INTO crm_leads
          (user_id, name, phone, stage, source, first_contact_at, last_interaction_at, stage_changed_at)
        VALUES (?, ?, ?, ?, 'tickfy', ?, ?, ?)
      `).run(
        userId,
        sale.comprador_nome || phone,
        phone,
        cfg.default_stage || 'entrou_contato',
        now, now, now
      );
      lead = { id: info.lastInsertRowid, user_id: userId, name: sale.comprador_nome, phone };
      action = 'created';
    }

    // ── Tags ──────────────────────────────────────────────────────────
    if (cfg.default_tag) {
      const tagId = ensureTag(userId, cfg.default_tag, '#D4AF37');
      if (tagId) {
        try { db.prepare('INSERT OR IGNORE INTO crm_lead_tags (lead_id, tag_id) VALUES (?, ?)').run(lead.id, tagId); } catch {}
      }
    }

    if (cfg.tag_with_event && sale.evento) {
      const evTagId = ensureTag(userId, sale.evento, '#6366F1');
      if (evTagId) {
        try { db.prepare('INSERT OR IGNORE INTO crm_lead_tags (lead_id, tag_id) VALUES (?, ?)').run(lead.id, evTagId); } catch {}
      }
    }

    // ── Nota no histórico ─────────────────────────────────────────────
    if (cfg.create_note) {
      const valorFmt = sale.valor
        ? `R$ ${Number(sale.valor).toFixed(2).replace('.', ',')}`
        : '';
      const statusLabels = { PG: 'Pago', NP: 'Não Pago', EA: 'Em Análise', CA: 'Cancelado', DV: 'Devolvido' };
      const statusLabel  = statusLabels[sale.status_code] || sale.status_code;
      const body = `🎟️ Tickfy — ${sale.evento || 'Evento'} | ${statusLabel}${valorFmt ? ' | ' + valorFmt : ''}`;

      db.prepare(`
        INSERT INTO crm_message_log (lead_id, direction, body)
        VALUES (?, 'system', ?)
      `).run(lead.id, body);

      db.prepare('UPDATE crm_leads SET last_interaction_at = ? WHERE id = ?').run(now, lead.id);
    }

    // ── Registro de sync ──────────────────────────────────────────────
    db.prepare(`
      INSERT OR IGNORE INTO crm_tickfy_lead_sync
        (user_id, sale_id, lead_id, phone, evento, valor, status_code, action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, sale.id, lead.id, phone, sale.evento, sale.valor, sale.status_code, action);

    console.log(`[TickfyCRM] Lead #${lead.id} — ${action} (sale #${sale.id}, ${sale.status_code})`);
  } catch (e) {
    console.warn('[TickfyCRM] Erro em syncSale:', e.message);
  }
}

/**
 * syncAll(userId) — Sincroniza todas as vendas ainda não sincronizadas.
 * Usado no endpoint de sync manual.
 */
function syncAll(userId) {
  try {
    const cfg = db.prepare('SELECT * FROM crm_tickfy_integration WHERE user_id = ? AND enabled = 1').get(userId);
    if (!cfg) return { synced: 0, skipped: 0, error: 'Integração desativada' };

    let syncStatuses = ['PG'];
    try { syncStatuses = JSON.parse(cfg.sync_statuses || '["PG"]'); } catch {}

    const placeholders = syncStatuses.map(() => '?').join(',');
    const unsynced = db.prepare(`
      SELECT ts.* FROM tickfy_sales ts
      WHERE ts.user_id = ?
        AND ts.status_code IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1 FROM crm_tickfy_lead_sync s
          WHERE s.user_id = ts.user_id AND s.sale_id = ts.id
        )
      ORDER BY ts.detected_at DESC
      LIMIT 500
    `).all(userId, ...syncStatuses);

    let synced = 0, skipped = 0;
    for (const sale of unsynced) {
      const before = db.prepare('SELECT id FROM crm_tickfy_lead_sync WHERE user_id = ? AND sale_id = ?').get(userId, sale.id);
      syncSale(sale, userId);
      const after = db.prepare('SELECT * FROM crm_tickfy_lead_sync WHERE user_id = ? AND sale_id = ?').get(userId, sale.id);
      if (!before && after) {
        if (after.action === 'skipped') skipped++;
        else synced++;
      }
    }

    return { synced, skipped, total: unsynced.length };
  } catch (e) {
    console.warn('[TickfyCRM] Erro em syncAll:', e.message);
    return { synced: 0, skipped: 0, error: e.message };
  }
}

module.exports = { syncSale, syncAll };
