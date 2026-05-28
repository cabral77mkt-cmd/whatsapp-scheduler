const cron = require('node-cron');
const db = require('../database');
const { sendMessage, sendMessageToGroup, getStatus, recoverMissingLeadsAllSessions } = require('../whatsapp/client');
const { runTickfyPoll } = require('../tickfy/poller');
const { sendDailySummary } = require('../whatsapp/dailySummary');
const { sendMonthlyReport } = require('../whatsapp/monthlyReport');
const crmBusinessHours = require('../crm/businessHours');
const crmAutoLead = require('../crm/autoLead');
const { runUrgencyCheck } = require('../crm/urgencyJob');
const { runAiScoring } = require('../crm/aiScorer');
const { runCadenceWorker } = require('../crm/cadenceWorker');
const pushService = require('../push/pushService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Verifica se deve gerar recorrência hoje ───────────────────────────────────
function checkShouldGenerate(r, today) {
  const d = new Date(today + 'T12:00:00');
  if (r.frequency === 'monthly') return d.getDate() === r.day_of_month;
  if (r.frequency === 'weekly')  return d.getDay() === r.day_of_week;
  if (r.frequency === 'yearly') {
    const start = new Date(r.start_date + 'T12:00:00');
    return d.getDate() === start.getDate() && d.getMonth() === start.getMonth();
  }
  return false;
}

function startScheduler() {
  // Verifica mensagens pendentes a cada minuto
  cron.schedule('* * * * *', async () => {
    const now = new Date().toISOString();

    const pendingMessages = db
      .prepare(
        `SELECT * FROM scheduled_messages
         WHERE status = 'pending' AND scheduled_at <= ?
         ORDER BY scheduled_at ASC`
      )
      .all(now);

    if (pendingMessages.length === 0) return;

    console.log(`[Scheduler] ${pendingMessages.length} mensagem(s) para enviar...`);

    for (const msg of pendingMessages) {
      const userId = Number(msg.user_id || 1);

      if (getStatus(userId) !== 'connected') {
        console.log(`[Scheduler] WhatsApp do usuário ${userId} não conectado, pulando mensagem ${msg.id}`);
        continue;
      }

      try {
        const recipientType = msg.recipient_type || 'number';
        const recipientId = msg.recipient_id || msg.phone;

        if (recipientType === 'group') {
          await sendMessageToGroup(userId, recipientId, msg.message);
          db.prepare(
            `UPDATE scheduled_messages SET status = 'sent', sent_at = ? WHERE id = ?`
          ).run(new Date().toISOString(), msg.id);
          console.log(`[Scheduler] ✓ Mensagem ${msg.id} enviada para grupo ${recipientId} (user:${userId})`);
        } else {
          // Fix #1 — salva msg_id para rastrear entrega via ACK do WhatsApp
          const result = await sendMessage(userId, recipientId, msg.message);
          db.prepare(
            `UPDATE scheduled_messages SET status = 'sent', sent_at = ?, msg_id = ? WHERE id = ?`
          ).run(new Date().toISOString(), result?.msgId || null, msg.id);
          console.log(`[Scheduler] ✓ Mensagem ${msg.id} enviada para ${recipientId} (user:${userId}) msgId:${result?.msgId}`);
        }
      } catch (err) {
        db.prepare(
          `UPDATE scheduled_messages SET status = 'failed', error_msg = ? WHERE id = ?`
        ).run(err.message, msg.id);

        console.error(`[Scheduler] ✗ Falha ao enviar mensagem ${msg.id}:`, err.message);
      }

      await sleep(1500);
    }
  });

  // Polling TICKFY a cada 3 minutos
  cron.schedule('*/3 * * * *', async () => {
    const configs = db.prepare('SELECT user_id FROM tickfy_config WHERE active = 1').all();
    for (const c of configs) {
      runTickfyPoll(Number(c.user_id)).catch((err) =>
        console.error(`[TICKFY] Erro no poll automático (user ${c.user_id}):`, err.message)
      );
    }
  });

  // Alertas de orçamento a cada hora
  cron.schedule('0 * * * *', async () => {
    try {
      const now    = new Date();
      const month  = now.getMonth() + 1;
      const year   = now.getFullYear();
      const monthStr = String(month).padStart(2, '0');

      // Busca todos os orçamentos do mês atual com gasto calculado
      const budgets = db.prepare(`
        SELECT b.*, e.wa_group_id,
               COALESCE(SUM(t.amount), 0) AS spent
        FROM finance_budgets b
        LEFT JOIN finance_entities e ON e.id = b.entity_id AND e.user_id = b.user_id
        LEFT JOIN finance_transactions t
          ON t.category_id = b.category_id AND t.user_id = b.user_id AND t.type = 'expense'
          AND strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ?
          AND (b.entity_id IS NULL OR t.entity_id = b.entity_id)
        WHERE b.month = ? AND b.year = ?
        GROUP BY b.id
      `).all(monthStr, String(year), month, year);

      for (const budget of budgets) {
        if (!budget.wa_group_id || budget.amount <= 0) continue;
        const percent = Math.round((budget.spent / budget.amount) * 100);

        for (const threshold of [80, 100]) {
          if (percent < threshold) continue;

          // Verifica se já enviou este alerta
          const alreadySent = db.prepare(
            'SELECT id FROM finance_budget_alerts WHERE budget_id=? AND threshold=? AND month=? AND year=?'
          ).get(budget.id, threshold, month, year);
          if (alreadySent) continue;

          const cat = db.prepare('SELECT name FROM finance_categories WHERE id = ?').get(budget.category_id);
          const catName = cat?.name || 'Categoria';
          const valorGasto = `R$ ${budget.spent.toFixed(2).replace('.', ',')}`;
          const valorLimite = `R$ ${budget.amount.toFixed(2).replace('.', ',')}`;
          const emoji = threshold === 100 ? '🔴' : '⚠️';
          const msg = threshold === 100
            ? `${emoji} *Limite Atingido — ${catName}*\nOrçamento de ${valorLimite} esgotado.\nGasto atual: ${valorGasto}.`
            : `${emoji} *Alerta de Orçamento — ${catName}*\nVocê já usou ${percent}% do limite (${valorGasto} / ${valorLimite}) este mês.`;

          try {
            await sendMessageToGroup(budget.user_id, budget.wa_group_id, msg);
            db.prepare(
              'INSERT OR IGNORE INTO finance_budget_alerts (budget_id, threshold, month, year) VALUES (?,?,?,?)'
            ).run(budget.id, threshold, month, year);
            console.log(`[Finance] Alerta ${threshold}% enviado — ${catName} (budget #${budget.id})`);
          } catch (e) {
            console.error(`[Finance] Erro ao enviar alerta:`, e.message);
          }
        }
      }
    } catch (e) {
      console.error('[Finance] Erro no cron de alertas:', e.message);
    }
  });

  // ── Resumo diário às 07:00 (horário de Brasília) ─────────────────────────
  cron.schedule('0 7 * * *', async () => {
    console.log('[Scheduler] Enviando resumos diários...');
    const users = db.prepare('SELECT id FROM users').all();
    for (const u of users) {
      await sendDailySummary(Number(u.id)).catch(e =>
        console.error(`[DailySummary] Erro user ${u.id}:`, e.message)
      );
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ── Relatório mensal no dia 1 às 08:00 ───────────────────────────────────
  cron.schedule('0 8 1 * *', async () => {
    console.log('[Scheduler] Enviando relatórios mensais...');
    const users = db.prepare('SELECT id FROM users').all();
    for (const u of users) {
      await sendMonthlyReport(Number(u.id)).catch(e =>
        console.error(`[MonthlyReport] Erro user ${u.id}:`, e.message)
      );
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ── Alertas de contas a pagar/receber às 09:00 ───────────────────────────
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Verificando contas a vencer...');
    try {
      const today    = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const due = db.prepare(`
        SELECT p.*, e.wa_group_id, e.name as entity_name, e.icon as entity_icon, e.user_id
        FROM finance_payables p
        JOIN finance_entities e ON e.id = p.entity_id
        WHERE p.paid_date IS NULL AND p.wa_alerted = 0
          AND (p.due_date = ? OR p.due_date = ?)
        ORDER BY p.user_id, p.entity_id, p.due_date
      `).all(today, tomorrow);

      if (due.length === 0) return;

      // Agrupar por user+entity
      const grouped = {};
      for (const item of due) {
        const key = `${item.user_id}:${item.entity_id}`;
        if (!grouped[key]) grouped[key] = { ...item, items: [] };
        grouped[key].items.push(item);
      }

      for (const group of Object.values(grouped)) {
        if (!group.wa_group_id) continue;
        if (getStatus(Number(group.user_id)) !== 'connected') continue;

        const lines = [`⏰ *Contas ${group.entity_icon || '💰'} ${group.entity_name}*`, ''];
        for (const item of group.items) {
          const isToday = item.due_date === today;
          const emoji   = item.type === 'payable' ? '🔴' : '💚';
          const label   = item.type === 'payable' ? 'A PAGAR' : 'A RECEBER';
          const valor   = `R$ ${item.amount.toFixed(2).replace('.', ',')}`;
          lines.push(
            `${emoji} ${label}: *${item.description}* — ${valor}` +
            (item.counterpart ? ` (${item.counterpart})` : '') +
            ` — ${isToday ? '*VENCE HOJE* ⚠️' : 'vence amanhã'}`
          );
        }
        lines.push('');
        lines.push('_Responda "pago [nome]" para confirmar o pagamento._');

        try {
          await sendMessageToGroup(Number(group.user_id), group.wa_group_id, lines.join('\n'));
          const ids = group.items.map(i => i.id);
          db.prepare(`UPDATE finance_payables SET wa_alerted = 1 WHERE id IN (${ids.join(',')})`).run();
          console.log(`[Scheduler] Alerta contas enviado: ${group.entity_name} (${group.items.length} conta(s))`);
        } catch (e) {
          console.error(`[Scheduler] Erro alerta contas ${group.entity_name}:`, e.message);
        }
      }
    } catch (e) {
      console.error('[Scheduler] Erro no cron de contas:', e.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ── Gerar transações recorrentes às 06:00 ────────────────────────────────
  cron.schedule('0 6 * * *', async () => {
    console.log('[Scheduler] Processando recorrências...');
    try {
      const today = new Date().toISOString().split('T')[0];

      const recurrings = db.prepare(`
        SELECT * FROM finance_recurring
        WHERE active = 1
          AND (end_date IS NULL OR end_date >= ?)
          AND (last_generated IS NULL OR last_generated < ?)
      `).all(today, today);

      for (const r of recurrings) {
        if (!checkShouldGenerate(r, today)) continue;

        db.prepare(`
          INSERT INTO finance_transactions
            (entity_id, user_id, type, amount, description, category_id, date, source)
          VALUES (?,?,?,?,?,?,?,'recurring')
        `).run(r.entity_id, r.user_id, r.type, r.amount, r.description, r.category_id || null, today);

        db.prepare('UPDATE finance_recurring SET last_generated = ? WHERE id = ?').run(today, r.id);
        console.log(`[Recurring] ✓ ${r.description} R$${r.amount} (user:${r.user_id})`);
      }
    } catch (e) {
      console.error('[Scheduler] Erro no cron de recorrências:', e.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ── CRM: follow-ups automáticos a cada minuto ──────────────────────────────
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const due = db.prepare(`
      SELECT * FROM crm_followups
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC LIMIT 50
    `).all(now.toISOString());

    if (due.length === 0) return;
    console.log(`[CRM Scheduler] ${due.length} follow-up(s) para processar`);

    const cancelableTypes = new Set([
      'no_reply_24h', 'no_reply_48h', 'no_reply_7d',
      'proposal_24h', 'proposal_3d', 'proposal_5d',
      'analyzing_2d', 'analyzing_5d'
    ]);

    for (const f of due) {
      try {
        // 1. Verifica janela comercial — se fora, reagenda
        const next = crmBusinessHours.nextAllowedSlot(f.user_id, now);
        if (next.getTime() > now.getTime()) {
          db.prepare('UPDATE crm_followups SET scheduled_at = ? WHERE id = ?')
            .run(next.toISOString(), f.id);
          console.log(`[CRM Scheduler] ⏸  Follow-up ${f.id} fora do horário, reagendado para ${next.toISOString()}`);
          continue;
        }

        // 2. Lead respondeu depois do agendamento? cancela (tipos automáticos)
        if (cancelableTypes.has(f.automation_type)) {
          const replied = db.prepare(`
            SELECT 1 FROM crm_message_log
            WHERE lead_id = ? AND direction = 'in' AND occurred_at > ?
          `).get(f.lead_id, f.created_at);
          if (replied) {
            db.prepare("UPDATE crm_followups SET status='canceled', error_msg='Lead respondeu' WHERE id = ?").run(f.id);
            console.log(`[CRM Scheduler] ↩  Follow-up ${f.id} cancelado (lead respondeu)`);
            continue;
          }
        }

        // 3. Lead com automações desativadas?
        const lead = db.prepare('SELECT phone, automations_enabled FROM crm_leads WHERE id = ?').get(f.lead_id);
        if (!lead) {
          db.prepare("UPDATE crm_followups SET status='canceled', error_msg='Lead removido' WHERE id = ?").run(f.id);
          continue;
        }
        if (lead.automations_enabled === 0 && f.automation_type !== 'manual') {
          db.prepare("UPDATE crm_followups SET status='canceled', error_msg='Automações desativadas' WHERE id = ?").run(f.id);
          continue;
        }

        // 4. WhatsApp conectado?
        if (getStatus(f.user_id) !== 'connected') {
          console.log(`[CRM Scheduler] ⏳ WhatsApp do user ${f.user_id} desconectado, pulando ${f.id}`);
          continue;
        }

        // 5. Envia
        const result = await sendMessage(f.user_id, lead.phone, f.message);
        db.prepare(`UPDATE crm_followups SET status='sent', sent_at=?, msg_id=? WHERE id=?`)
          .run(new Date().toISOString(), result?.msgId || null, f.id);
        crmAutoLead.logOutboundMessage(f.lead_id, f.message, result?.msgId || null, f.id);
        console.log(`[CRM Scheduler] ✓ Follow-up ${f.id} enviado para ${lead.phone}`);
        await sleep(1500);
      } catch (err) {
        db.prepare(`UPDATE crm_followups SET status='failed', error_msg=? WHERE id=?`)
          .run(err.message, f.id);
        console.error(`[CRM Scheduler] ✗ Falha follow-up ${f.id}:`, err.message);
      }
    }
  });

  // ── CRM: urgência por data de evento às 08:30 ────────────────────────────
  cron.schedule('30 8 * * *', () => {
    console.log('[Urgency] Verificando leads com evento próximo...');
    try { runUrgencyCheck(); }
    catch (e) { console.error('[Urgency] Erro no job de urgência:', e.message); }
  }, { timezone: 'America/Sao_Paulo' });

  // Recovery de leads a cada 10 minutos
  // Varre os chats DM conhecidos e cria leads para números sem cadastro
  cron.schedule('*/10 * * * *', async () => {
    const total = await recoverMissingLeadsAllSessions();
    if (total > 0) console.log(`[CRM Recovery] ${total} lead(s) recuperado(s)`);
  });

  // ── Cadências de venda — a cada minuto ────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      await runCadenceWorker();
    } catch (err) {
      console.error('[Scheduler] Erro no cadenceWorker:', err.message);
    }
  });

  // ── AI Lead Scoring — a cada 15 minutos ───────────────────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runAiScoring();
    } catch (err) {
      console.error('[Scheduler] Erro no AI scoring:', err.message);
    }
  });

  // ── Push: follow-ups vencendo em 30min — a cada 15 minutos ──────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const now  = new Date().toISOString();
      const due  = db.prepare(`
        SELECT f.*, l.name AS lead_name, l.phone
        FROM crm_followups f
        JOIN crm_leads l ON l.id = f.lead_id
        WHERE f.status = 'pending' AND f.scheduled_at <= ? AND f.scheduled_at > ?
          AND f.push_notified IS NULL
      `).all(soon, now);
      for (const f of due) {
        await pushService.sendToUser(f.user_id, {
          title: '📨 Follow-up em 30min',
          body:  `${f.lead_name || f.phone} — ${f.message?.slice(0, 80) || 'mensagem agendada'}`,
          url:   `/crm/kanban`,
          tag:   `followup-${f.id}`,
        });
        try {
          db.prepare("UPDATE crm_followups SET push_notified = 1 WHERE id = ?").run(f.id);
        } catch {}
      }
    } catch (e) {
      console.error('[Push] Erro no cron de follow-ups:', e.message);
    }
  });

  // ── Push: propostas abertas sem resposta há 3 dias — diariamente às 09:30 ─
  cron.schedule('30 9 * * *', async () => {
    try {
      const threshold = new Date(Date.now() - 3 * 86400000).toISOString();
      const proposals = db.prepare(`
        SELECT p.id, p.amount, l.user_id, l.name AS lead_name
        FROM crm_proposals p
        JOIN crm_leads l ON l.id = p.lead_id
        WHERE p.status IN ('pending','sent')
          AND p.created_at <= ?
          AND l.stage NOT IN ('fechado','perdido')
        GROUP BY l.user_id
        HAVING COUNT(*) >= 1
        LIMIT 20
      `).all(threshold);

      // Agrupar por usuário
      const byUser = {};
      for (const p of proposals) {
        if (!byUser[p.user_id]) byUser[p.user_id] = 0;
        byUser[p.user_id]++;
      }
      for (const [userId, count] of Object.entries(byUser)) {
        await pushService.sendToUser(Number(userId), {
          title: '⏰ Propostas sem resposta',
          body:  `${count} proposta${count !== 1 ? 's' : ''} aguardando resposta há mais de 3 dias`,
          url:   '/crm/kanban',
          tag:   'stale-proposals',
        });
      }
    } catch (e) {
      console.error('[Push] Erro no cron de propostas:', e.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ─── ONDA 1 - F5: Despertar leads adormecidos ────────────────────────────
  // Roda a cada hora — verifica leads cujo dormant_until já passou
  cron.schedule('0 * * * *', async () => {
    try {
      const awakened = db.prepare(`
        SELECT id, user_id, name, phone FROM crm_leads
        WHERE dormant_until IS NOT NULL
          AND datetime(dormant_until) <= datetime('now')
          AND stage NOT IN ('fechado', 'perdido')
      `).all();

      if (!awakened.length) return;
      console.log(`[Dormant] Despertando ${awakened.length} lead(s) adormecidos`);

      for (const lead of awakened) {
        try {
          db.prepare(`UPDATE crm_leads SET dormant_until = NULL, cooling_reason = NULL WHERE id = ?`).run(lead.id);

          // Registra o despertar como note no message log
          db.prepare(`INSERT INTO crm_message_log (lead_id, direction, body) VALUES (?, 'system', ?)`)
            .run(lead.id, `⏰ Lead despertou do modo dormência automaticamente`);

          // Notifica o vendedor via push
          pushService.sendToUser(lead.user_id, {
            title: `⏰ ${lead.name || lead.phone} despertou!`,
            body:  'Lead voltou do modo dormência. Hora de retomar o contato!',
            url:   `/crm/kanban`,
            tag:   `wake-${lead.id}`,
          }).catch(() => {});

          console.log(`[Dormant] ✓ Lead ${lead.id} (${lead.name || lead.phone}) despertado`);
        } catch (e) {
          console.error(`[Dormant] Erro ao despertar lead ${lead.id}:`, e.message);
        }
      }
    } catch (e) {
      console.error('[Dormant] Erro no cron:', e.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // ─── ONDA 7 — Alertas Inteligentes: gera diariamente às 08:30 ──────────────
  cron.schedule('30 8 * * *', () => {
    try { require('../crm/alertsService').generateAlertsForAll(); }
    catch (e) { console.error('[Alerts] Erro no cron:', e.message); }
  }, { timezone: 'America/Sao_Paulo' });

  // ─── ONDA 1 - Resgatador Diário ─────────────────────────────
  // Roda a cada minuto e dispara pra usuários cujo rescue_time atual.
  // Por padrão 08:00, mas cada usuário pode configurar.
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5); // "08:00"
      // Pega usuários com rescue_time igual a agora
      const due = db.prepare(`
        SELECT u.id, u.org_id FROM users u
        INNER JOIN user_settings s ON s.user_id = u.id
        WHERE s.rescue_enabled = 1 AND s.rescue_time = ?
      `).all(hhmm);

      if (due.length === 0) return;
      console.log(`[Rescue] Hora ${hhmm} — disparando para ${due.length} usuários`);
      const rescueGen = require('../crm/rescueGenerator');
      for (const u of due) {
        try { await rescueGen.generateRescuesForUser(u.id, u.org_id || 1); }
        catch (e) { console.error(`[Rescue] erro user ${u.id}:`, e.message); }
      }
    } catch (e) {
      console.error('[Rescue] erro no cron:', e.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[Scheduler] Iniciado - verificando a cada minuto');
}

module.exports = { startScheduler };
