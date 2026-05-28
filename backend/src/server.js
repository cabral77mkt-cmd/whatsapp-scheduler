const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Impede que erros não tratados derrubem o servidor
process.on('uncaughtException', (err) => {
  console.error('[Server] uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] unhandledRejection:', reason);
});

const { connectWhatsApp, disconnectWhatsApp, getStatus, setIO, getAuthPath } = require('./whatsapp/client');
const { startScheduler } = require('./scheduler');
const messagesRouter = require('./routes/messages');
const contactsRouter = require('./routes/contacts');
const groupsRouter = require('./routes/groups');
const authRouter = require('./routes/auth');
const { authMiddleware, verifyToken } = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');
const { tenantMiddleware } = require('./middleware/tenant');
const adminRouter = require('./routes/admin');
const lancamentosRouter = require('./routes/lancamentos');
const vipGroupsRouter = require('./routes/vip_groups');
const tickfyRouter = require('./routes/tickfy');
const financeEntitiesRouter     = require('./routes/finance_entities');
const financeCategoriesRouter   = require('./routes/finance_categories');
const financeTransactionsRouter = require('./routes/finance_transactions');
const financeBudgetsRouter      = require('./routes/finance_budgets');
const financeDashboardRouter    = require('./routes/finance_dashboard');
const financePayablesRouter     = require('./routes/finance_payables');
const financeRecurringRouter    = require('./routes/finance_recurring');
const financeCashflowRouter     = require('./routes/finance_cashflow');
const financeProjectsRouter     = require('./routes/finance_projects');
const crmLeadsRouter      = require('./routes/crm_leads');
const crmWebhookRouter    = require('./routes/crm_webhook');
const crmMeetingsRouter   = require('./routes/crm_meetings');
const crmProposalsRouter  = require('./routes/crm_proposals');
const crmFollowupsRouter  = require('./routes/crm_followups');
const crmTasksRouter      = require('./routes/crm_tasks');
const crmTagsRouter       = require('./routes/crm_tags');
const crmSettingsRouter   = require('./routes/crm_settings');
const crmReportsRouter    = require('./routes/crm_reports');
const crmCadencesRouter   = require('./routes/crm_cadences');
const searchRouter        = require('./routes/search');
const inboxRouter         = require('./routes/inbox');
const db = require('./database');

const app = express();
const server = http.createServer(app);

const IS_PROD = process.env.NODE_ENV === 'production';
const allowedOrigins = IS_PROD ? '*' : /^http:\/\/localhost:\d+$/;

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

// Middlewares
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Serve comprovantes financeiros
const receiptsDir = path.join(__dirname, '../../data/receipts');
if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });
app.use('/receipts', authMiddleware, express.static(receiptsDir));

// Rotas públicas (sem autenticação)
app.use('/api/auth', authRouter);
app.use('/api/webhooks', crmWebhookRouter);

// Rotas protegidas
// (orgId vem do JWT — usar getOrgId(req) com fallback automático pra 1)
app.use('/api/messages', authMiddleware, messagesRouter);
app.use('/api/contacts', authMiddleware, contactsRouter);
app.use('/api/groups', authMiddleware, groupsRouter);
app.use('/api/lancamentos', authMiddleware, lancamentosRouter);
app.use('/api/vip-groups', authMiddleware, vipGroupsRouter);
app.use('/api/admin', authMiddleware, adminMiddleware, adminRouter);
app.use('/api/tickfy', authMiddleware, tickfyRouter);
app.use('/api/finance/entities',     authMiddleware, financeEntitiesRouter);
app.use('/api/finance/categories',   authMiddleware, financeCategoriesRouter);
app.use('/api/finance/transactions', authMiddleware, financeTransactionsRouter);
app.use('/api/finance/budgets',      authMiddleware, financeBudgetsRouter);
app.use('/api/finance/dashboard',    authMiddleware, financeDashboardRouter);
app.use('/api/finance/payables',     authMiddleware, financePayablesRouter);
app.use('/api/finance/recurring',    authMiddleware, financeRecurringRouter);
app.use('/api/finance/cashflow',     authMiddleware, financeCashflowRouter);
app.use('/api/finance/projects',     authMiddleware, financeProjectsRouter);
app.use('/api/crm/leads',     authMiddleware, crmLeadsRouter);
app.use('/api/crm/meetings',  authMiddleware, crmMeetingsRouter);
app.use('/api/crm/proposals', authMiddleware, crmProposalsRouter);
app.use('/api/crm/followups', authMiddleware, crmFollowupsRouter);
app.use('/api/crm/tasks',     authMiddleware, crmTasksRouter);
app.use('/api/crm/tags',      authMiddleware, crmTagsRouter);
app.use('/api/crm/settings',  authMiddleware, crmSettingsRouter);
app.use('/api/crm/reports',   authMiddleware, crmReportsRouter);
app.use('/api/crm/cadences',  authMiddleware, crmCadencesRouter);
const { requireRole } = require('./middleware/roles');
app.use('/api/crm/manager',   authMiddleware, requireRole('manager'), require('./routes/crm_manager'));
app.use('/api/push',          authMiddleware, require('./routes/push'));
app.use('/api/dashboard',     authMiddleware, require('./routes/dashboard'));
app.use('/api/snippets',      authMiddleware, require('./routes/snippets'));
app.use('/api/search',        authMiddleware, searchRouter);
app.use('/api/inbox',         authMiddleware, inboxRouter);
// Etapa 12 — Audit, API keys, outbound webhooks, public API v1
app.use('/api/audit',         authMiddleware, adminMiddleware, require('./routes/audit'));
app.use('/api/keys',          authMiddleware, require('./routes/api_keys'));
app.use('/api/webhooks/endpoints', authMiddleware, require('./routes/webhook_endpoints'));
app.use('/api/v1',            require('./routes/api_v1/index'));
// Onda 1 — Etapa 0: Multi-tenant + Settings
app.use('/api/user-settings', authMiddleware, require('./routes/user_settings'));
app.use('/api/organizations', authMiddleware, require('./routes/organizations'));
// Onda 1 — Feature 1: Resgatador Diário
app.use('/api/crm/rescues',        authMiddleware, require('./routes/crm_rescues'));

// Onda 2 — AI First Responder + AI SDR
app.use('/api/crm/auto-responder', authMiddleware, require('./routes/crm_auto_responder'));

// Onda 3 — Conversation Intelligence
app.use('/api/crm/coaching',      authMiddleware, require('./routes/crm_coaching'));
app.use('/api/crm/battle-cards',  authMiddleware, require('./routes/crm_battle_cards'));

// Onda 4 — CSV Import + Outbound Campaigns
const outboundRouter = require('./routes/crm_outbound');
app.use('/api/crm/import',        authMiddleware, require('./routes/crm_import'));
app.use('/api/crm/outbound',      authMiddleware, outboundRouter);

// Onda 5 — Distribuição de Leads + Comissões
app.use('/api/crm/distribution',  authMiddleware, require('./routes/crm_distribution'));
app.use('/api/crm/commissions',   authMiddleware, require('./routes/crm_commissions'));

// Onda 6 — Integração Tickfy ↔ CRM
app.use('/api/crm/tickfy',        authMiddleware, require('./routes/crm_tickfy'));

// Onda 7 — Metas Pessoais + Alertas Inteligentes
app.use('/api/crm/goals',         authMiddleware, require('./routes/crm_personal_goals'));
app.use('/api/crm/alerts',        authMiddleware, require('./routes/crm_alerts'));

// Onda 8 — Analytics de Pipeline
app.use('/api/crm/analytics',     authMiddleware, require('./routes/crm_analytics'));

// Onda 10 — Exportação CSV
app.use('/api/crm/export',        authMiddleware, require('./routes/crm_export'));

app.get('/api/status', authMiddleware, (req, res) => {
  res.json({ status: getStatus(Number(req.user.sub)) });
});

app.post('/api/connect', authMiddleware, async (req, res) => {
  const userId = Number(req.user.sub);
  const currentStatus = getStatus(userId);
  if (currentStatus === 'connected' || currentStatus === 'connecting') {
    return res.json({ ok: true, status: currentStatus });
  }
  connectWhatsApp(userId).catch(console.error);
  res.json({ ok: true, status: 'connecting' });
});

app.post('/api/disconnect', authMiddleware, async (req, res) => {
  try {
    await disconnectWhatsApp(Number(req.user.sub));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.IO — autenticação via token JWT no handshake
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.userId = null;
    return next();
  }
  const payload = verifyToken(token);
  if (!payload) {
    socket.userId = null;
    return next();
  }
  socket.userId = payload.sub;
  next();
});

io.on('connection', (socket) => {
  console.log('[Socket.io] Cliente conectado:', socket.id, '| userId:', socket.userId || 'anon');

  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
    socket.emit('status', { status: getStatus(socket.userId) });
  }

  socket.on('requestStatus', () => {
    if (socket.userId) {
      socket.emit('status', { status: getStatus(socket.userId) });
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.io] Cliente desconectado:', socket.id);
  });
});

// Serve frontend em produção
if (IS_PROD) {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    console.log('[Server] Servindo frontend de', frontendDist);
  }
}

// Conecta WhatsApp ao Socket.io
setIO(io);
outboundRouter.setIO(io);

// Inicia
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Server] Rodando na porta ${PORT}`);
  console.log(`[Server] API: http://localhost:${PORT}/api`);

  // Conecta WhatsApp para todos os usuários que já têm sessão salva
  const users = db.prepare('SELECT id FROM users').all();
  for (const user of users) {
    const authPath = getAuthPath(user.id);
    if (fs.existsSync(authPath)) {
      console.log(`[Server] Reconectando WhatsApp para usuário ${user.id}...`);
      connectWhatsApp(user.id).catch(console.error);
    }
  }

  // Inicia agendador
  startScheduler();
});
