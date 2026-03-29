const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const QRCode = require('qrcode');
const db = require('../database');

const AUTH_PATH = path.join(__dirname, '../../data/auth');

let sock = null;
let io = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected

// Cache de mensagens enviadas/recebidas para o callback getMessage
// O WhatsApp mobile usa isso para pedir reenvio de mensagens não descriptografadas
const msgCache = new Map();

function setIO(socketIO) {
  io = socketIO;
}

function getStatus() {
  return connectionStatus;
}

function getSocket() {
  return sock;
}

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ['WhatsApp Scheduler', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false,
    // ESSENCIAL: sem isso, o celular mostra "Aguardando mensagem"
    // O WhatsApp mobile pede reenvio quando não consegue descriptografar
    getMessage: async (key) => {
      const id = key.id;
      if (msgCache.has(id)) return msgCache.get(id);
      return { conversation: '' };
    },
  });

  connectionStatus = 'connecting';
  if (io) io.emit('status', { status: 'connecting' });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataURL = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        if (io) io.emit('qr', { qr: qrDataURL });
        console.log('[WhatsApp] QR Code gerado, aguardando leitura...');
      } catch (err) {
        console.error('[WhatsApp] Erro ao gerar QR Code:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connectionStatus = 'disconnected';
      if (io) io.emit('status', { status: 'disconnected' });
      console.log('[WhatsApp] Conexão encerrada. Código:', statusCode);

      if (shouldReconnect) {
        console.log('[WhatsApp] Reconectando em 5 segundos...');
        setTimeout(connectWhatsApp, 5000);
      } else {
        console.log('[WhatsApp] Desconectado (logout). Reconecte via QR Code.');
        // Limpa auth para novo login
        const fs = require('fs');
        if (fs.existsSync(AUTH_PATH)) {
          fs.rmSync(AUTH_PATH, { recursive: true });
        }
        setTimeout(connectWhatsApp, 3000);
      }
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      const user = sock.user;
      if (io) io.emit('status', { status: 'connected', user: user?.name || user?.id });
      console.log('[WhatsApp] Conectado como:', user?.name || user?.id);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Armazena mensagens no cache para suportar reenvio (getMessage callback)
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (msg.key?.id) {
        msgCache.set(msg.key.id, msg.message);
        // Limita o cache a 500 mensagens para não ocupar muita memória
        if (msgCache.size > 500) {
          const oldest = msgCache.keys().next().value;
          msgCache.delete(oldest);
        }
      }
    }
  });

  // Rastreia confirmações de entrega e leitura no banco de dados
  // wa_status: 1=enviado ao servidor (✓), 2=entregue ao celular (✓✓), 3=lido (azul)
  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      if (key.fromMe && key.id && update.status !== undefined) {
        try {
          db.prepare(
            'UPDATE delivery_tracking SET wa_status = ?, updated_at = CURRENT_TIMESTAMP WHERE msg_id = ?'
          ).run(update.status, key.id);
        } catch (_) { /* ignora se tabela ainda não existe */ }
      }
    }
  });
}

async function disconnectWhatsApp() {
  if (sock) {
    await sock.logout();
  }
}

async function sendMessage(phone, message) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp não está conectado');
  }

  // Formata o número: remove +, espaços, traços e adiciona @s.whatsapp.net
  const formattedPhone = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

  const sent = await sock.sendMessage(formattedPhone, { text: message });
  if (sent?.key?.id) msgCache.set(sent.key.id, sent.message);
  return { msgId: sent?.key?.id || null };
}

async function sendMessageToGroup(groupJid, message) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp não está conectado');
  }

  // JID do grupo já vem no formato correto: XXXXXXXX@g.us
  const sent = await sock.sendMessage(groupJid, { text: message });
  if (sent?.key?.id) msgCache.set(sent.key.id, sent.message);
  return true;
}

async function getGroups() {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp não está conectado');
  }

  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({
    id: g.id,
    name: g.subject || g.id,
    size: g.size || (g.participants ? g.participants.length : 0),
  }));
}

module.exports = { connectWhatsApp, disconnectWhatsApp, sendMessage, sendMessageToGroup, getGroups, getStatus, getSocket, setIO };
