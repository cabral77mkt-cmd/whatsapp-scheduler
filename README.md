# WhatsApp Scheduler

Sistema web para agendamento e envio em massa de mensagens WhatsApp.

## Funcionalidades

- 🔗 **Conectar WhatsApp** via QR Code (WhatsApp Web API)
- ⏰ **Agendar mensagens** para data e hora específica
- 📢 **Envio em massa** para múltiplos números simultaneamente
- 👥 **Gerenciar contatos** com nome e telefone
- 📊 **Dashboard** com estatísticas em tempo real

## Instalação

### Pré-requisitos
- Node.js 18+
- npm

### 1. Backend
```bash
cd backend
npm install
npm start
```

### 2. Frontend (outro terminal)
```bash
cd frontend
npm install
npm run dev
```

### 3. Acesso
Abra `http://localhost:5173` no navegador.

## Uso

1. Acesse **Conectar WhatsApp** no menu
2. Escaneie o QR Code com seu WhatsApp (Configurações → Dispositivos Conectados)
3. Após conectar, vá em **Agendar Mensagem** ou **Envio em Massa**

## Formato de Telefone
- Use o formato internacional sem símbolos: `5511999998888`
- Brasil: `55` + DDD + número

## Estrutura
```
whatsapp-scheduler/
├── backend/          # Node.js + Express + Baileys
└── frontend/         # React + Vite + Tailwind CSS
```
