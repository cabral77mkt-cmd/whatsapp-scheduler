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

const { connectWhatsApp, disconnectWhatsApp, getStatus, setIO } = require('./whatsapp/client');
const { startScheduler } = require('./scheduler');
const messagesRouter = require('./routes/messages');
const contactsRouter = require('./routes/contacts');
const groupsRouter = require('./routes/groups');
const authRouter = require('./routes/auth');
const { authMiddleware } = require('./middleware/auth');

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

// Rotas públicas (sem autenticação)
app.use('/api/auth', authRouter);

// Rotas protegidas
app.use('/api/messages', authMiddleware, messagesRouter);
app.use('/api/contacts', authMiddleware, contactsRouter);
app.use('/api/groups', authMiddleware, groupsRouter);

app.get('/api/status', authMiddleware, (req, res) => {
  res.json({ status: getStatus() });
});

app.post('/api/disconnect', authMiddleware, async (req, res) => {
  try {
    await disconnectWhatsApp();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io
io.on('connection', (socket) => {
  console.log('[Socket.io] Cliente conectado:', socket.id);

  // Envia status atual para o cliente que acabou de conectar
  socket.emit('status', { status: getStatus() });

  socket.on('requestStatus', () => {
    socket.emit('status', { status: getStatus() });
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

// Inicia
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Server] Rodando na porta ${PORT}`);
  console.log(`[Server] API: http://localhost:${PORT}/api`);

  // Inicia WhatsApp
  connectWhatsApp().catch(console.error);

  // Inicia agendador
  startScheduler();
});
