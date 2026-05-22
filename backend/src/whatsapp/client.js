const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const db = require('../database');
const { parseWithAI, setPending, getPending, clearPending, completePending } = require('./aiParser');
const { isMVT, merge, applyFallbacks }   = require('./decisionEngine');
const { buildRegistrationResponse, clarificationNeeded, correctionApplied, correctionNotUnderstood } = require('./responseGenerator');
const correctionHandler  = require('./correctionHandler');
const assistantService   = require('./assistantService');
const memoryService      = require('./memoryService');
const ocrService         = require('./ocrService');
const crmAutoLead        = require('../crm/autoLead');

const DATA_DIR = path.join(__dirname, '../../data');

// Migração: renomeia data/auth/ → data/auth_1/ na primeira execução com multi-usuário
const oldAuthPath = path.join(DATA_DIR, 'auth');
const newAuthPath = path.join(DATA_DIR, 'auth_1');
if (fs.existsSync(oldAuthPath) && !fs.existsSync(newAuthPath)) {
  try {
    fs.renameSync(oldAuthPath, newAuthPath);
    console.log('[WhatsApp] Migrado data/auth → data/auth_1');
  } catch (e) {
    console.error('[WhatsApp] Erro ao migrar auth:', e.message);
  }
}

// Remove pasta auth_undefined deixada por versões antigas
const orphanPath = path.join(DATA_DIR, 'auth_undefined');
if (fs.existsSync(orphanPath)) {
  try {
    fs.rmSync(orphanPath, { recursive: true });
    console.log('[WhatsApp] Removida pasta auth_undefined órfã');
  } catch (e) {
    console.error('[WhatsApp] Erro ao remover auth_undefined:', e.message);
  }
}

// Map de sessões: userId -> { sock, status, msgCache, retryCount }
const sessions = new Map();
let io = null;

function getAuthPath(userId) {
  return path.join(DATA_DIR, `auth_${userId}`);
}

function setIO(socketIO) {
  io = socketIO;
}

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      sock: null,
      status: 'disconnected',
      msgCache: new Map(),
      retryCount: 0,
      lidToPhone: new Map(),   // lid → telefone real (resolve JIDs @lid do WhatsApp multi-device)
      lidPending: new Map(),   // lid → { msgs[], timer } — buffer de msgs @lid sem mapeamento ainda
      knownDmChats: new Set(), // JIDs de chats DM conhecidos (usado pelo recovery de leads)
    });
  }
  return sessions.get(userId);
}

// Carrega mapeamentos lid→telefone persistidos no banco para a sessão
function loadPersistedLidMap(userId) {
  const session = getSession(userId);
  try {
    const rows = db.prepare('SELECT lid, phone FROM crm_lid_phone WHERE user_id = ?').all(userId);
    for (const r of rows) session.lidToPhone.set(r.lid, r.phone);
    if (rows.length) console.log(`[CRM:${userId}] Carregados ${rows.length} mapeamentos lid→phone do banco`);
  } catch (e) {
    console.error(`[CRM:${userId}] Erro ao carregar lid map:`, e.message);
  }
}

// Persiste novos mapeamentos lid→telefone e processa msgs em buffer
function saveLidMappings(userId, contacts) {
  const session = getSession(userId);
  for (const c of contacts) {
    if (!c.id?.endsWith('@s.whatsapp.net') || !c.lid) continue;
    const phone = c.id.split('@')[0];
    const lid   = typeof c.lid === 'string' ? c.lid.split('@')[0] : String(c.lid);
    if (session.lidToPhone.get(lid) === phone) continue; // já mapeado, sem mudança
    session.lidToPhone.set(lid, phone);
    try {
      db.prepare(`INSERT OR REPLACE INTO crm_lid_phone (lid, user_id, phone, updated_at)
                  VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run(lid, userId, phone);
      // Atualiza o phone no crm_seen_dm_jids se esse JID @lid já foi visto
      db.prepare(`UPDATE crm_seen_dm_jids SET phone = ? WHERE jid = ? AND user_id = ? AND phone IS NULL`)
        .run(phone, `${lid}@lid`, userId);
    } catch (e) {
      console.error(`[CRM:${userId}] Erro ao persistir lid ${lid}:`, e.message);
    }
    // Processa mensagens que estavam aguardando esse lid
    if (session.lidPending.has(lid)) {
      const { msgs, timer } = session.lidPending.get(lid);
      clearTimeout(timer);
      session.lidPending.delete(lid);
      for (const pendingMsg of msgs) {
        crmAutoLead.handleIncomingDM(userId, pendingMsg, io, session.lidToPhone).catch(err =>
          console.error(`[CRM:${userId}] erro ao processar msg pendente @lid:`, err)
        );
      }
    }
  }
}

function getStatus(userId) {
  return sessions.get(userId)?.status || 'disconnected';
}

function getSocket(userId) {
  return sessions.get(userId)?.sock || null;
}

// ─── Parser Financeiro — entende formato rígido E linguagem natural ──────────
//
//  Formatos aceitos:
//    Rígido:   +500 descrição   /  -200 descrição
//    Natural:  "gastei 70 em pizza"  /  "recebi 300 do show"
//              "70 reais de gasto em pizza"  /  "entrada de 200 da venda"
//              "paguei 150 no aluguel"  /  "comprei pizza por 50"
//
function parseFinanceMessage(text) {
  const original = text.trim();

  // 1. Formato rígido: +500 desc / -200 desc / +5k desc / -2mil desc
  const strict = original.match(/^([+\-])(\d+(?:[.,]\d{1,3})?)(\s*(?:k|mil))?\s+(.+)$/i);
  if (strict) {
    let amt = parseFloat(strict[2].replace(',', '.'));
    if (strict[3] && strict[3].trim()) amt *= 1000; // sufixo k ou mil
    return {
      type: strict[1] === '+' ? 'income' : 'expense',
      amount: amt,
      desc: strict[4].trim(),
    };
  }

  const lower = original.toLowerCase();

  // 2. Extrai valor numérico — suporta: 70 / 70,50 / R$70 / 5k / 1.5k / 2mil / 2,5mil
  const amountMatch = lower.match(/r?\$?\s*(\d+(?:[.,]\d{1,3})?)\s*(?:mil|k)?\s*(?:reais?|r\$)?/i);
  if (!amountMatch) return null;
  let amount = parseFloat(amountMatch[1].replace(',', '.'));
  if (!amount || amount <= 0) return null;
  // Multiplica por 1000 se tiver sufixo "k" ou "mil"
  if (/\d\s*k\b/i.test(lower) || /\d\s*mil\b/i.test(lower)) amount *= 1000;

  // 3. Detecta tipo por palavras-chave
  const expenseRx = /\b(gast(ei|ou|o|a)?|paguei|pagou|comprei|comprou|compra|sa[ií]da|despesa|custou|investi|investe|tirei|tirou|transfer[ei])\b/i;
  const incomeRx  = /\b(receb(i|eu)?|entrada?|ganh(ei|ou)?|receita|vendas?|vendi|vendeu|faturei|faturou|lucro|depósito|deposito)\b/i;

  let type = null;
  if (expenseRx.test(lower))       type = 'expense';
  else if (incomeRx.test(lower))   type = 'income';
  else return null; // sem palavra-chave de tipo → ignora

  // 4. Monta descrição: remove valor, keyword e preposições iniciais
  let desc = original
    .replace(/R?\$?\s*\d+(?:[.,]\d{1,2})?\s*(?:reais?|R\$)?/gi, '')  // remove valor
    .replace(/\b(gast(ei|ou|o|a)?|paguei|pagou|comprei|comprou|compra|sa[ií]da|despesa|custou|investi|investe|tirei|tirou|transfer[ei]|receb(i|eu)?|entrada?|ganh(ei|ou)?|receita|vendas?|vendi|vendeu|faturei|faturou|lucro|depósito|deposito)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove preposições que sobram no início (pode ter várias: "de em pizza")
  for (let i = 0; i < 4; i++) {
    desc = desc.replace(/^(de|em|no|na|do|da|dos|das|com|por|para|pra|um|uma)\s+/gi, '').trim();
  }
  // Remove preposições que sobram no fim
  desc = desc.replace(/\s+(de|em|no|na|do|da|dos|das|com|por|para|pra)$/gi, '').trim();

  // Se ficou vazio ou só 1 caractere, usa o texto original como desc
  if (desc.length < 2) desc = original;

  return { type, amount, desc };
}

async function connectWhatsApp(userId) {
  const session = getSession(userId);
  const authPath = getAuthPath(userId);

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ['Chrome (Linux)', 'Chrome', '124.0.0'],
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => {
      const id = key.id;
      // 1º: tenta cache em memória (mais rápido)
      if (session.msgCache.has(id)) return session.msgCache.get(id);
      // 2º: busca no banco persistente (sobrevive a restarts)
      try {
        const row = db.prepare(
          'SELECT msg_json FROM message_store WHERE id = ? AND user_id = ?'
        ).get(id, userId);
        if (row) {
          const msg = JSON.parse(row.msg_json);
          session.msgCache.set(id, msg); // restaura no cache
          return msg;
        }
      } catch (e) {
        console.error(`[WhatsApp:${userId}] Erro ao buscar mensagem do banco:`, e.message);
      }
      // 3º: não encontrou — retorna undefined (mais seguro que string vazia)
      return undefined;
    },
  });

  session.sock = sock;
  session.status = 'connecting';
  if (io) io.to(`user:${userId}`).emit('status', { status: 'connecting' });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataURL = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        if (io) io.to(`user:${userId}`).emit('qr', { qr: qrDataURL });
        console.log(`[WhatsApp:${userId}] QR Code gerado, aguardando leitura...`);
      } catch (err) {
        console.error(`[WhatsApp:${userId}] Erro ao gerar QR Code:`, err);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut   = statusCode === DisconnectReason.loggedOut;
      const isBanned      = statusCode === 403;

      session.status = 'disconnected';
      session.sock = null;
      if (io) io.to(`user:${userId}`).emit('status', { status: 'disconnected' });
      console.log(`[WhatsApp:${userId}] Conexão encerrada. Código:`, statusCode);

      if (isLoggedOut) {
        // Logout intencional — apaga auth e aguarda novo QR
        session.retryCount = 0;
        console.log(`[WhatsApp:${userId}] Desconectado (logout). Reconecte via QR Code.`);
        if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true });
        setTimeout(() => connectWhatsApp(userId), 3000);

      } else if (isBanned) {
        // Ban / rate limit — espera 5 minutos antes de tentar
        session.retryCount = 0;
        console.warn(`[WhatsApp:${userId}] ⚠️  Ban/rate-limit detectado (403). Aguardando 5 minutos...`);
        if (io) io.to(`user:${userId}`).emit('status', { status: 'banned' });
        setTimeout(() => connectWhatsApp(userId), 5 * 60 * 1000);

      } else {
        // Queda normal — backoff exponencial: 5s → 10s → 20s → 40s → 60s (máx)
        session.retryCount = (session.retryCount || 0) + 1;
        const MAX_RETRIES = 5;
        if (session.retryCount > MAX_RETRIES) {
          console.warn(`[WhatsApp:${userId}] ⚠️  ${MAX_RETRIES} tentativas sem sucesso (código ${statusCode}). Parando. Reconecte via QR Code no painel.`);
          session.retryCount = 0;
          if (io) io.to(`user:${userId}`).emit('status', { status: 'disconnected' });
          return;
        }
        const delay = Math.min(5000 * Math.pow(2, session.retryCount - 1), 60000);
        console.log(`[WhatsApp:${userId}] Reconectando em ${delay / 1000}s (tentativa ${session.retryCount}/${MAX_RETRIES})...`);
        setTimeout(() => connectWhatsApp(userId), delay);
      }
    }

    if (connection === 'open') {
      session.retryCount = 0; // zera backoff após conexão bem-sucedida
      session.status = 'connected';
      const user = sock.user;
      if (io) io.to(`user:${userId}`).emit('status', { status: 'connected', user: user?.name || user?.id });
      console.log(`[WhatsApp:${userId}] Conectado como:`, user?.name || user?.id);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Carrega mapa persistido + escuta novos contatos para atualizar/desbloquear buffer
  loadPersistedLidMap(userId);
  sock.ev.on('contacts.upsert', (contacts) => saveLidMappings(userId, contacts));
  sock.ev.on('contacts.update', (contacts) => saveLidMappings(userId, contacts));

  // Coleta todos os chats DM para o recovery de leads
  sock.ev.on('chats.set', ({ chats }) => {
    for (const chat of chats) {
      if (chat.id && !chat.id.endsWith('@g.us') && !chat.id.endsWith('@broadcast')) {
        session.knownDmChats.add(chat.id);
      }
    }
    // Aguarda 8s para dar tempo ao contacts.upsert popular o mapa lid→phone
    setTimeout(() => recoverMissingLeads(userId), 8000);
  });
  sock.ev.on('chats.upsert', (chats) => {
    for (const chat of chats) {
      if (chat.id && !chat.id.endsWith('@g.us') && !chat.id.endsWith('@broadcast')) {
        session.knownDmChats.add(chat.id);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.key?.id || !msg.message) continue;
      const id = msg.key.id;

      // 'append' = histórico carregado no boot — não re-processa financeiro
      // 'notify' = mensagem nova (inclusive as perdidas durante queda — Baileys re-emite)
      const isHistorical = type === 'append';
      // Atualiza cache em memória
      session.msgCache.set(id, msg.message);
      if (session.msgCache.size > 500) {
        const oldest = session.msgCache.keys().next().value;
        session.msgCache.delete(oldest);
      }
      // Persiste no banco para sobreviver a restarts
      try {
        db.prepare(
          'INSERT OR REPLACE INTO message_store (id, user_id, msg_json) VALUES (?, ?, ?)'
        ).run(id, userId, JSON.stringify(msg.message));
      } catch (e) {
        console.error(`[WhatsApp:${userId}] Erro ao persistir mensagem recebida:`, e.message);
      }

      // ── Parser Financeiro ────────────────────────────────────────────────
      // Só processa mensagens de grupos e que não sejam do próprio bot
      const isGroup  = msg.key.remoteJid?.endsWith('@g.us');
      const fromMe   = msg.key.fromMe;

      // ── CRM: cadastro automático de leads em DMs ─────────────────────────
      if (!isGroup && !fromMe && !isHistorical) {
        const remoteJid = msg.key?.remoteJid || '';
        const isLidJid  = remoteJid.endsWith('@lid');
        const lid       = isLidJid ? remoteJid.split('@')[0] : null;

        // Registra o JID imediatamente — garante que recovery consegue encontrar depois
        try {
          const rawPhone = isLidJid ? (session.lidToPhone.get(lid) || null) : remoteJid.split('@')[0];
          // Normaliza: mantém apenas dígitos (evita JIDs com traço ou outros caracteres)
          const phoneForLog = rawPhone ? rawPhone.replace(/[^0-9]/g, '') || null : null;
          db.prepare(`INSERT OR IGNORE INTO crm_seen_dm_jids (jid, user_id, phone) VALUES (?, ?, ?)`)
            .run(remoteJid, userId, phoneForLog);
        } catch (_) {}


        if (isLidJid && lid && !session.lidToPhone.has(lid)) {
          // JID @lid ainda sem mapeamento: enfileira e aguarda até 60s
          if (!session.lidPending.has(lid)) {
            const timer = setTimeout(() => {
              const pending = session.lidPending.get(lid);
              if (pending) {
                console.warn(`[CRM:${userId}] Timeout: lid ${lid} nunca resolvido após 60s — descartando ${pending.msgs.length} msg(s)`);
                session.lidPending.delete(lid);
              }
            }, 60_000);
            session.lidPending.set(lid, { msgs: [], timer });
          }
          session.lidPending.get(lid).msgs.push(msg);
          console.log(`[CRM:${userId}] Msg de @lid ${lid} enfileirada aguardando mapeamento (buffer: ${session.lidPending.get(lid).msgs.length})`);
        } else {
          await crmAutoLead.handleIncomingDM(userId, msg, io, session.lidToPhone).catch(err =>
            console.error(`[CRM:${userId}] erro auto-lead:`, err)
          );
        }
      }

      if (!isGroup) continue;      // ignora mensagens privadas (financeiro)
      if (fromMe) continue;        // ignora mensagens enviadas pelo próprio bot
      if (isHistorical) continue;  // ignora histórico carregado no boot

      // Proteção contra duplicatas: se este wa_msg_id já gerou uma tx, ignora
      const alreadyProcessed = db.prepare(
        'SELECT id FROM finance_transactions WHERE wa_msg_id = ? AND user_id = ?'
      ).get(id, userId);
      if (alreadyProcessed) {
        console.log(`[Finance:${userId}] ⏭  Mensagem ${id} já processada (tx #${alreadyProcessed.id}), ignorando.`);
        continue;
      }

      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || '';

      const groupJid = msg.key.remoteJid;
      const sender   = msg.key.participant || msg.key.remoteJid;

      console.log(`[Finance:${userId}] 📨 Msg de grupo recebida | grupo=${groupJid} | texto="${text}"`);

      // Verifica se o grupo está vinculado a alguma entidade financeira
      const entity = db.prepare(
        'SELECT * FROM finance_entities WHERE wa_group_id = ? AND user_id = ?'
      ).get(groupJid, userId);

      if (!entity) {
        // Mostra todos os grupos vinculados para diagnóstico
        const allEntities = db.prepare('SELECT name, wa_group_id FROM finance_entities WHERE user_id = ?').all(userId);
        console.log(`[Finance:${userId}] ⚠️  Grupo ${groupJid} NÃO vinculado a nenhuma entidade.`);
        console.log(`[Finance:${userId}] 📋 Entidades cadastradas:`, JSON.stringify(allEntities));
        continue;
      }

      console.log(`[Finance:${userId}] ✅ Grupo vinculado à entidade: "${entity.name}" (id=${entity.id})`);

      // ── @Menção: assistente financeiro ───────────────────────────────────
      const botPhone     = sock.user?.id?.split(':')[0]?.split('@')[0] || '';
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const isBotMentioned = botPhone && (
        mentionedJids.some(jid => jid.includes(botPhone)) ||
        text.includes(`@${botPhone}`)
      );

      if (isBotMentioned) {
        // Remove o @mention do texto para extrair só a pergunta
        const question = text.replace(new RegExp(`@${botPhone}`, 'g'), '').trim();
        if (question) {
          console.log(`[Finance:${userId}] 🤖 @Menção detectada. Pergunta: "${question}"`);
          try {
            const answer = await assistantService.reply(question, entity, userId);
            if (answer) {
              await sock.sendMessage(groupJid, { text: answer }, { quoted: msg });
            }
          } catch (e) {
            console.error(`[Finance:${userId}] Erro no assistente:`, e.message);
          }
        }
        continue; // não processa como transação financeira
      }

      // ── A. Detectar mídia (possível comprovante) ─────────────────────────
      const hasMedia = !!(msg.message?.imageMessage || msg.message?.documentMessage || msg.message?.documentWithCaptionMessage);

      // ── B. Verificar correção de tx recente ──────────────────────────────
      if (text.trim()) {
        const corr = correctionHandler.detect(userId, groupJid, sender, text.trim());
        if (corr && !corr.isConfirm) {
          const applied = correctionHandler.apply(corr);
          if (applied) {
            await sock.sendMessage(groupJid, { text: correctionApplied(applied.field, applied.displayValue) });
          } else {
            await sock.sendMessage(groupJid, { text: correctionNotUnderstood() });
          }
          continue;
        }
      }

      // ── C. Processar mídia ────────────────────────────────────────────────
      let receiptPath = null;
      let ocrData     = null;
      if (hasMedia) {
        try {
          const receiptsDir = path.join(DATA_DIR, 'receipts');
          if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

          const buffer = await downloadMediaMessage({ message: msg.message, key: msg.key }, 'buffer', {});
          const ext = detectReceiptExt(msg);
          const tmpFilename = `receipt_tmp_${Date.now()}${ext}`;
          const tmpPath = path.join(receiptsDir, tmpFilename);
          fs.writeFileSync(tmpPath, buffer);
          receiptPath = `/receipts/${tmpFilename}`;

          // Busca tx pendente do mesmo sender (vincula comprovante existente)
          const senderNorm = sender.split('@')[0].replace(/[^0-9]/g, '');
          const tenMinAgo  = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const pendingTx  = db.prepare(`
            SELECT * FROM finance_transactions
            WHERE entity_id = ? AND wa_sender = ? AND receipt_path IS NULL
              AND created_at >= ?
            ORDER BY created_at DESC LIMIT 1
          `).get(entity.id, senderNorm, tenMinAgo);

          if (pendingTx) {
            const finalFilename = `receipt_${pendingTx.id}_${Date.now()}${ext}`;
            const finalPath = path.join(receiptsDir, finalFilename);
            fs.renameSync(tmpPath, finalPath);
            receiptPath = `/receipts/${finalFilename}`;
            db.prepare('UPDATE finance_transactions SET receipt_path = ? WHERE id = ?')
              .run(receiptPath, pendingTx.id);
            console.log(`[Finance:${userId}] 📎 Comprovante vinculado à tx #${pendingTx.id}`);
            await sock.sendMessage(groupJid, { text: '📎 Comprovante salvo!' });
            continue;
          }

          // Sem tx pendente → roda OCR para tentar criar nova transação
          console.log(`[Finance:${userId}] 🔍 Nenhuma tx pendente — rodando OCR...`);
          ocrData = await ocrService.extract(buffer, msg);

          // OCR falhou ou confiança baixa → pergunta ao usuário manualmente
          if (!ocrData) {
            const pendingKey2 = `${userId}:${groupJid}:${sender}`;
            setPending(pendingKey2, {
              partialData: { type: null, amount: null, desc: null },
              waitingFor: 'both',
              txId: null,
              receiptPath,  // guarda o caminho para vincular depois
            });
            await sock.sendMessage(groupJid, {
              text: '📎 Recebi o comprovante! Não consegui ler automaticamente.\n💬 Me diga o valor e do que se trata. Ex: *150 almoço*',
            }, { quoted: msg });
            continue;
          }
        } catch (e) {
          console.error(`[Finance:${userId}] Erro ao processar mídia:`, e.message);
          receiptPath = null;
        }
      }

      // ── D. Caption de mídia ou texto puro ────────────────────────────────
      const caption = msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption
        || msg.message?.imageMessage?.caption
        || '';
      const fullText = (text || caption).trim();

      if (!fullText && !hasMedia) continue;

      // ── E. Pending de clarificação anterior ──────────────────────────────
      const pendingKey = `${userId}:${groupJid}:${sender}`;
      const pendingEntry = getPending(pendingKey);
      if (pendingEntry && fullText) {
        if (pendingEntry.waitingFor === 'both') {
          clearPending(pendingKey); // sem info suficiente → trata como nova mensagem
        } else {
          const resolved = completePending(pendingEntry, fullText);
          clearPending(pendingKey);

          if (resolved) {
            if (pendingEntry.txId) {
              // ── Caso A: transação já registrada — só atualiza o campo faltante ──
              const field = pendingEntry.waitingFor === 'type' ? 'type' : 'amount';
              db.prepare(`UPDATE finance_transactions SET ${field} = ?, enrichment_status = 'complete' WHERE id = ?`)
                .run(resolved[field], pendingEntry.txId);
              const tx = db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(pendingEntry.txId);
              await sock.sendMessage(groupJid, {
                text: buildRegistrationResponse({ ...tx, enrichment_status: 'complete', _vendor: null }, null, entity.name),
              });
            } else {
              // ── Caso B: ainda não registrada — registra agora com dados completos ──
              // Inclui receiptPath do comprovante se estava aguardando info sobre ele
              const pendingReceiptPath = pendingEntry.receiptPath || null;
              const merged = merge(resolved, null);
              if (isMVT(merged)) {
                const txData = applyFallbacks(merged, entity, userId, id, sender, resolved.desc || fullText);
                try {
                  const result = db.prepare(`
                    INSERT INTO finance_transactions
                      (entity_id, user_id, type, amount, description, category_id, date, source,
                       wa_msg_id, wa_sender, receipt_path, receipt_requested,
                       confidence, enrichment_status, ai_notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'whatsapp', ?, ?, ?, 0, ?, 'complete', ?)
                  `).run(
                    txData.entity_id, txData.user_id, txData.type, txData.amount,
                    txData.description, txData.category_id, txData.date,
                    txData.wa_msg_id, txData.wa_sender,
                    pendingReceiptPath,
                    txData.confidence, txData.ai_notes
                  );
                  const newTxId = result.lastInsertRowid;
                  // Renomeia arquivo tmp com id real da tx
                  if (pendingReceiptPath?.includes('_tmp_')) {
                    try {
                      const receiptsDir = path.join(DATA_DIR, 'receipts');
                      const ext2 = path.extname(pendingReceiptPath);
                      const finalFn = `receipt_${newTxId}_${Date.now()}${ext2}`;
                      fs.renameSync(
                        path.join(receiptsDir, path.basename(pendingReceiptPath)),
                        path.join(receiptsDir, finalFn)
                      );
                      db.prepare('UPDATE finance_transactions SET receipt_path = ? WHERE id = ?')
                        .run(`/receipts/${finalFn}`, newTxId);
                    } catch {}
                  }
                  console.log(`[Finance:${userId}] ✅ Tx #${newTxId} (comprovante+info) — ${txData.type} R$${txData.amount}`);
                  await sock.sendMessage(groupJid, {
                    text: buildRegistrationResponse(txData, null, entity.name),
                  });
                } catch (e) {
                  console.error(`[Finance:${userId}] Erro ao registrar tx pendente:`, e.message);
                }
              }
            }
          } else {
            // Resposta não entendida — pede de novo
            const questions = { type: '📊 Entrada ou saída?', amount: '💰 Qual o valor?' };
            const q = questions[pendingEntry.waitingFor];
            if (q) {
              setPending(pendingKey, pendingEntry); // recoloca o pending
              await sock.sendMessage(groupJid, { text: `Não entendi. ${q}` });
            }
          }
          continue;
        }
      }

      // ── F. Sem texto útil (só mídia sem legenda) ──────────────────────────
      if (!fullText) continue;

      // ── F2. Confirmação de pagamento: "pago [descrição]" ─────────────────
      const pagoMatch = fullText.match(/^pago\s+(.+)$/i);
      if (pagoMatch) {
        const desc = pagoMatch[1].trim();
        try {
          const payable = db.prepare(`
            SELECT * FROM finance_payables
            WHERE user_id = ? AND entity_id = ? AND paid_date IS NULL
              AND lower(description) LIKE lower(?)
            ORDER BY due_date ASC LIMIT 1
          `).get(userId, entity.id, `%${desc}%`);

          if (payable) {
            const today = new Date().toISOString().split('T')[0];
            const txType = payable.type === 'payable' ? 'expense' : 'income';
            const txResult = db.prepare(`
              INSERT INTO finance_transactions
                (entity_id, user_id, type, amount, description, category_id, date, source, wa_msg_id, wa_sender)
              VALUES (?,?,?,?,?,?,?,'whatsapp',?,?)
            `).run(
              entity.id, userId, txType, payable.amount, payable.description,
              payable.category_id || null, today, id,
              sender.split('@')[0].replace(/[^0-9]/g, '')
            );
            db.prepare(
              'UPDATE finance_payables SET paid_date = ?, transaction_id = ?, wa_confirmed = 1 WHERE id = ?'
            ).run(today, txResult.lastInsertRowid, payable.id);
            const valor = `R$ ${payable.amount.toFixed(2).replace('.', ',')}`;
            await sock.sendMessage(groupJid, {
              text: `✅ *${payable.description}* marcado como pago!\n💰 ${valor} registrado.`,
            });
            continue;
          }
          // Não encontrou conta pendente → deixa cair no parser normal
        } catch (e) {
          console.error(`[Finance:${userId}] Erro ao processar "pago":`, e.message);
        }
      }

      // ── G. IA interpreta texto (pula se OCR já trouxe dados completos) ──────
      let textParsed = null;
      if (fullText) {
        try {
          const aiResult = await parseWithAI(fullText, userId);
          if (aiResult && !aiResult.needsClarification) {
            textParsed = aiResult;
          } else if (aiResult?.needsClarification && !ocrData) {
            // IA precisa de info e não tem OCR — pergunta sem registrar
            setPending(pendingKey, { partialData: aiResult.partialData, waitingFor: aiResult.unclear, txId: null });
            await sock.sendMessage(groupJid, { text: clarificationNeeded(aiResult.question) });
            continue;
          }
          // Se tem ocrData, não pergunta — OCR resolve o que faltava no texto
        } catch (e) {
          console.warn(`[Finance:${userId}] IA indisponível, tentando regex: ${e.message}`);
          textParsed = parseFinanceMessage(fullText);
        }
      }

      // Sem texto E sem OCR — ignora
      if (!textParsed && !ocrData) continue;

      // ── I. Mesclar texto + OCR e verificar MVT ───────────────────────────
      const merged = merge(textParsed, ocrData);
      if (!isMVT(merged)) {
        console.log(`[Finance:${userId}] MVT não atingido — sem dados suficientes para registrar.`);
        continue;
      }

      // ── J. Enriquecer com memória de fornecedores ────────────────────────
      const memoryHint = memoryService.enrich(
        { vendor: merged.vendor, category_hint: merged.category_hint },
        userId
      );
      if (memoryHint.category_id && !merged.category_hint) {
        merged.category_hint = null; // deixa applyFallbacks usar o memoryHint
        merged._memory_category_id = memoryHint.category_id;
        console.log(`[Finance:${userId}] 🧠 Memória: categoria inferida da memória para "${merged.vendor}"`);
      }

      // ── K. Aplicar fallbacks ──────────────────────────────────────────────
      const txData = applyFallbacks(merged, entity, userId, id, sender, fullText);
      // Sobrescreve categoria com a da memória se disponível
      if (memoryHint.category_id) txData.category_id = memoryHint.category_id;
      console.log(`[Finance:${userId}] 💰 ${txData.type} R$${txData.amount} "${txData.description}" cat=${txData.category_id} conf=${txData.confidence}`);

      // ── K. REGISTRAR IMEDIATAMENTE ────────────────────────────────────────
      let txId;
      try {
        const result = db.prepare(`
          INSERT INTO finance_transactions
            (entity_id, user_id, type, amount, description, category_id, date, source,
             wa_msg_id, wa_sender, receipt_path, receipt_requested,
             confidence, enrichment_status, ai_notes, pending_fields, ocr_raw)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'whatsapp', ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `).run(
          txData.entity_id, txData.user_id, txData.type, txData.amount, txData.description,
          txData.category_id, txData.date,
          txData.wa_msg_id, txData.wa_sender,
          receiptPath,
          txData.confidence, txData.enrichment_status,
          txData.ai_notes, txData.pending_fields, txData.ocr_raw
        );
        txId = result.lastInsertRowid;
        console.log(`[Finance:${userId}] ✅ Tx #${txId} registrada — ${txData.type} R$${txData.amount}`);

        // Aprende com o fornecedor para próximas transações
        if (txData._vendor) {
          memoryService.learn({ vendor: txData._vendor, category_id: txData.category_id, type: txData.type }, userId);
        }
      } catch (e) {
        console.error(`[Finance:${userId}] Erro ao registrar transação:`, e.message);
        continue;
      }

      // ── L. Renomeia arquivo de mídia com txId real ────────────────────────
      if (receiptPath && receiptPath.includes('_tmp_')) {
        try {
          const receiptsDir = path.join(DATA_DIR, 'receipts');
          const ext = path.extname(receiptPath);
          const finalFilename = `receipt_${txId}_${Date.now()}${ext}`;
          fs.renameSync(path.join(receiptsDir, path.basename(receiptPath)), path.join(receiptsDir, finalFilename));
          const finalPath = `/receipts/${finalFilename}`;
          db.prepare('UPDATE finance_transactions SET receipt_path = ? WHERE id = ?').run(finalPath, txId);
        } catch (e) {
          console.error(`[Finance:${userId}] Erro ao renomear comprovante:`, e.message);
        }
      }

      // ── M. Gerar resposta ─────────────────────────────────────────────────
      const response = buildRegistrationResponse(txData, ocrData, entity.name);
      await sock.sendMessage(groupJid, { text: response });

      // ── N. Se enriquecimento pendente, registra no contexto ───────────────
      if (txData.enrichment_status !== 'complete' && txData.pending_fields) {
        const fields = JSON.parse(txData.pending_fields);
        if (fields.length > 0) {
          const waitingFor = fields[0];
          const questions  = {
            type:     '📊 Entrada ou saída?',
            category: '🏷️ Em qual categoria entra isso?',
          };
          setPending(pendingKey, {
            partialData: { type: txData.type, amount: txData.amount, desc: txData.description },
            waitingFor,
            txId,
          });
          await sock.sendMessage(groupJid, { text: questions[waitingFor] || '❓ Pode me dar mais detalhes?' });
        }
      }
      // ── Fim Parser Financeiro ────────────────────────────────────────────
    }
  });

  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      if (key.fromMe && key.id && update.status !== undefined) {
        // Fix #2 — loga erros em vez de engolir silenciosamente
        try {
          db.prepare(
            'UPDATE delivery_tracking SET wa_status = ?, updated_at = CURRENT_TIMESTAMP WHERE msg_id = ?'
          ).run(update.status, key.id);
        } catch (e) {
          console.error(`[WhatsApp:${userId}] Erro ao atualizar delivery_tracking:`, e.message);
        }
        // Fix #1 — atualiza status de entrega em mensagens agendadas também
        try {
          db.prepare(
            'UPDATE scheduled_messages SET wa_status = ? WHERE msg_id = ?'
          ).run(update.status, key.id);
        } catch (e) {
          console.error(`[WhatsApp:${userId}] Erro ao atualizar scheduled_messages:`, e.message);
        }
      }
    }
  });
}

// Detecta extensão real do comprovante a partir do MIME type
function detectReceiptExt(msg) {
  if (msg.message?.imageMessage) {
    const mime = msg.message.imageMessage.mimetype || 'image/jpeg';
    if (mime.includes('png'))  return '.png';
    if (mime.includes('webp')) return '.webp';
    return '.jpg';
  }
  if (msg.message?.documentMessage) {
    const mime = msg.message.documentMessage.mimetype || 'application/pdf';
    if (mime.includes('pdf')) return '.pdf';
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('png')) return '.png';
    return '.bin';
  }
  if (msg.message?.documentWithCaptionMessage) {
    const inner = msg.message.documentWithCaptionMessage.message?.documentMessage;
    const mime  = inner?.mimetype || 'application/pdf';
    return mime.includes('pdf') ? '.pdf' : '.jpg';
  }
  return '.jpg';
}

// Fix #7 — garante DDI e formato correto
// Regra: 10-11 dígitos → número BR sem DDI → adiciona 55
function normalizePhone(phone) {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }
  return digits;
}

// Fix #5 — verifica se número existe no WhatsApp antes de enviar
// Retorna true se existir ou se a verificação falhar por problema de rede (não bloqueia envio)
async function checkPhoneExists(sock, digits) {
  try {
    const results = await sock.onWhatsApp(digits);
    if (Array.isArray(results) && results.length > 0) {
      return results[0]?.exists === true;
    }
    return true; // resposta inesperada → não bloqueia
  } catch {
    return true; // falha na verificação → não bloqueia
  }
}

async function disconnectWhatsApp(userId) {
  const session = sessions.get(userId);
  if (session?.sock) {
    await session.sock.logout();
  }
}

async function sendMessage(userId, phone, message) {
  const session = sessions.get(userId);
  if (!session?.sock || session.status !== 'connected') {
    throw new Error('WhatsApp não está conectado');
  }

  // Fix #7 — normaliza número (adiciona DDI 55 se necessário)
  const digits = normalizePhone(phone);
  const jid = digits + '@s.whatsapp.net';

  // Fix #5 — verifica se número existe no WhatsApp
  const exists = await checkPhoneExists(session.sock, digits);
  if (!exists) {
    throw new Error(`Número ${digits} não está cadastrado no WhatsApp`);
  }

  // Fix #3 — try/catch no envio real para capturar race condition de desconexão
  let sent;
  try {
    sent = await session.sock.sendMessage(jid, { text: message });
  } catch (err) {
    if (session.status !== 'connected') {
      throw new Error('WhatsApp desconectou durante o envio');
    }
    throw err;
  }

  if (sent?.key?.id && sent.message) {
    session.msgCache.set(sent.key.id, sent.message);
    // Persiste no banco para que getMessage sempre encontre mesmo após restart
    try {
      db.prepare(
        'INSERT OR REPLACE INTO message_store (id, user_id, msg_json) VALUES (?, ?, ?)'
      ).run(sent.key.id, userId, JSON.stringify(sent.message));
    } catch (e) {
      console.error(`[WhatsApp:${userId}] Erro ao persistir mensagem enviada:`, e.message);
    }
  }
  return { msgId: sent?.key?.id || null };
}

async function sendMessageToGroup(userId, groupJid, message) {
  const session = sessions.get(userId);
  if (!session?.sock || session.status !== 'connected') {
    throw new Error('WhatsApp não está conectado');
  }

  let sent;
  try {
    sent = await session.sock.sendMessage(groupJid, { text: message });
  } catch (err) {
    if (session.status !== 'connected') {
      throw new Error('WhatsApp desconectou durante o envio');
    }
    throw err;
  }

  if (sent?.key?.id && sent.message) {
    session.msgCache.set(sent.key.id, sent.message);
    // Persiste para getMessage encontrar em re-entregas
    try {
      db.prepare(
        'INSERT OR REPLACE INTO message_store (id, user_id, msg_json) VALUES (?, ?, ?)'
      ).run(sent.key.id, userId, JSON.stringify(sent.message));
    } catch (e) {
      console.error(`[WhatsApp:${userId}] Erro ao persistir msg de grupo:`, e.message);
    }
  }
  return { msgId: sent?.key?.id || null };
}

async function getGroups(userId) {
  const session = sessions.get(userId);
  if (!session?.sock || session.status !== 'connected') {
    throw new Error('WhatsApp não está conectado');
  }
  const groups = await session.sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({
    id: g.id,
    name: g.subject || g.id,
    size: g.size || (g.participants ? g.participants.length : 0),
  }));
}

// Varre crm_seen_dm_jids + knownDmChats e cria leads para números ainda sem cadastro
async function recoverMissingLeads(userId) {
  const session = getSession(userId);
  const { ensureCrmSeeds } = require('../database');
  ensureCrmSeeds(userId);

  const settings = db.prepare('SELECT auto_create_leads FROM crm_settings WHERE user_id = ?').get(userId);
  if (settings && settings.auto_create_leads === 0) return 0;

  // 1) Tenta resolver @lid pendentes com o mapa atual antes de buscar
  const unresolved = db.prepare(`SELECT jid FROM crm_seen_dm_jids WHERE user_id = ? AND phone IS NULL`).all(userId);
  for (const row of unresolved) {
    if (row.jid.endsWith('@lid')) {
      const lid = row.jid.split('@')[0];
      const phone = session.lidToPhone.get(lid);
      if (phone) {
        db.prepare(`UPDATE crm_seen_dm_jids SET phone = ? WHERE jid = ? AND user_id = ?`).run(phone, row.jid, userId);
      }
    }
  }

  // 2) Injeta knownDmChats (histórico de chats do WhatsApp) na tabela crm_seen_dm_jids
  //    para garantir que contatos que mandaram msg com backend desligado também sejam capturados
  for (const jid of session.knownDmChats) {
    try {
      let rawPhone = null;
      if (jid.endsWith('@s.whatsapp.net')) {
        rawPhone = jid.split('@')[0];
      } else if (jid.endsWith('@lid')) {
        const lid = jid.split('@')[0];
        rawPhone = session.lidToPhone.get(lid) || null;
      }
      // Normaliza: apenas dígitos
      const phone = rawPhone ? rawPhone.replace(/[^0-9]/g, '') || null : null;
      db.prepare(`INSERT OR IGNORE INTO crm_seen_dm_jids (jid, user_id, phone) VALUES (?, ?, ?)`)
        .run(jid, userId, phone);
      // Atualiza phone se ainda estava null
      if (phone) {
        db.prepare(`UPDATE crm_seen_dm_jids SET phone = ? WHERE jid = ? AND user_id = ? AND phone IS NULL`)
          .run(phone, jid, userId);
      }
    } catch (_) {}
  }

  // 3) Busca todos os números conhecidos com phone resolvido
  const seenJids = db.prepare(`SELECT phone FROM crm_seen_dm_jids WHERE user_id = ? AND phone IS NOT NULL`).all(userId);

  // Números a ignorar: system broadcasts, muito curtos, ou conhecidos como meta/WA internos
  const IGNORE = new Set(['0', '', 'status']);
  function isValidPhone(p) {
    if (!p || IGNORE.has(p)) return false;
    const digits = p.replace(/[^0-9]/g, '');
    // Mínimo 8 dígitos (número local sem DDI) e máximo 15 (E.164)
    if (digits.length < 8 || digits.length > 15) return false;
    // Ignora números que começam com 000 (broadcast/sistema)
    if (digits.startsWith('000')) return false;
    return true;
  }

  let recovered = 0;

  for (const { phone } of seenJids) {
    try {
      if (!isValidPhone(phone)) continue;

      const contact = db.prepare('SELECT id FROM contacts WHERE user_id = ? AND phone = ?').get(userId, phone);
      if (contact) continue;

      const lead = db.prepare('SELECT id FROM crm_leads WHERE user_id = ? AND phone = ?').get(userId, phone);
      if (lead) continue;

      const now = new Date().toISOString();
      // Garante apenas dígitos no phone armazenado
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const info = db.prepare(`
        INSERT INTO crm_leads (user_id, phone, stage, source, first_contact_at, last_interaction_at, stage_changed_at)
        VALUES (?, ?, 'entrou_contato', 'whatsapp_dm', ?, ?, ?)
      `).run(userId, cleanPhone, now, now, now);

      if (io) io.to(`user:${userId}`).emit('crm:lead_created', { lead_id: info.lastInsertRowid });
      recovered++;
      console.log(`[CRM:${userId}] Recovery: lead criado para ${cleanPhone}`);
    } catch (e) {
      console.error(`[CRM:${userId}] Recovery erro para ${phone}:`, e.message);
    }
  }

  if (recovered > 0) console.log(`[CRM:${userId}] Recovery concluído: ${recovered} lead(s) recuperado(s)`);
  return recovered;
}

// Roda o recovery para todas as sessões conectadas (chamado pelo cron)
async function recoverMissingLeadsAllSessions() {
  let total = 0;
  for (const [userId, session] of sessions) {
    if (session.status === 'connected') {
      total += await recoverMissingLeads(userId);
    }
  }
  return total;
}

module.exports = {
  connectWhatsApp,
  disconnectWhatsApp,
  sendMessage,
  sendMessageToGroup,
  getGroups,
  getStatus,
  getSocket,
  setIO,
  getAuthPath,
  recoverMissingLeads,
  recoverMissingLeadsAllSessions,
};
