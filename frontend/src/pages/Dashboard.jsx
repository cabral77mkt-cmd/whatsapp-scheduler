import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard({ waStatus }) {
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, c] = await Promise.all([
          api.get('/messages/stats'),
          api.get('/contacts'),
        ]);
        setStats(s);
        setContacts(c.length);
      } catch {}
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const statusInfo = {
    connected: { label: 'WhatsApp Conectado', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', icon: '✅' },
    connecting: { label: 'Conectando ao WhatsApp...', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: '⏳' },
    disconnected: { label: 'WhatsApp Desconectado', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', icon: '❌' },
  }[waStatus] || {};

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">Visão geral do sistema</p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${statusInfo.bg} ${statusInfo.border}`}>
        <span className="text-xl">{statusInfo.icon}</span>
        <div className="flex-1">
          <p className={`font-semibold ${statusInfo.text}`}>{statusInfo.label}</p>
          {waStatus !== 'connected' && (
            <p className="text-xs text-gray-400 mt-0.5">
              Vá em{' '}
              <Link to="/conectar" className="text-whatsapp-green underline">
                Conectar WhatsApp
              </Link>{' '}
              para escanear o QR Code.
            </p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total de Mensagens" value={stats?.total} icon="📨" color="bg-blue-500/10" />
        <StatCard label="Pendentes" value={stats?.pending} icon="⏰" color="bg-yellow-500/10" />
        <StatCard label="Enviadas" value={stats?.sent} icon="✅" color="bg-green-500/10" />
        <StatCard label="Contatos" value={contacts} icon="👥" color="bg-purple-500/10" />
      </div>

      {/* Ações Rápidas */}
      <div className="card">
        <h3 className="font-semibold text-white mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            to="/agendar"
            className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg hover:bg-gray-750 hover:border-whatsapp-green/50 border border-gray-700 transition-all group"
          >
            <span className="text-2xl">⏰</span>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-whatsapp-green transition-colors">Agendar Mensagem</p>
              <p className="text-xs text-gray-500">Envio programado</p>
            </div>
          </Link>
          <Link
            to="/envio-em-massa"
            className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg hover:bg-gray-750 hover:border-whatsapp-green/50 border border-gray-700 transition-all group"
          >
            <span className="text-2xl">📢</span>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-whatsapp-green transition-colors">Envio em Massa</p>
              <p className="text-xs text-gray-500">Múltiplos números</p>
            </div>
          </Link>
          <Link
            to="/contatos"
            className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg hover:bg-gray-750 hover:border-whatsapp-green/50 border border-gray-700 transition-all group"
          >
            <span className="text-2xl">👥</span>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-whatsapp-green transition-colors">Gerenciar Contatos</p>
              <p className="text-xs text-gray-500">Adicionar / Editar</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
