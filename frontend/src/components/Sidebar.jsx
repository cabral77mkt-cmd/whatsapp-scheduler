import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const STATUS_CONFIG = {
  connected: { label: 'Conectado', color: 'bg-green-500', dot: 'bg-green-400' },
  connecting: { label: 'Conectando...', color: 'bg-yellow-500', dot: 'bg-yellow-400' },
  disconnected: { label: 'Desconectado', color: 'bg-red-500', dot: 'bg-red-400' },
};

const navItems = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/conectar', icon: '🔗', label: 'Conectar WhatsApp' },
  { to: '/agendar', icon: '⏰', label: 'Agendar Mensagem' },
  { to: '/envio-em-massa', icon: '📢', label: 'Envio em Massa' },
  { to: '/mensagens', icon: '📋', label: 'Mensagens' },
  { to: '/contatos', icon: '👥', label: 'Contatos' },
];

export default function Sidebar({ waStatus, waUser }) {
  const cfg = STATUS_CONFIG[waStatus] || STATUS_CONFIG.disconnected;
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-whatsapp-green rounded-xl flex items-center justify-center text-xl">
            💬
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-tight">WhatsApp</h1>
            <p className="text-xs text-gray-400">Scheduler</p>
          </div>
        </div>
      </div>

      {/* Usuário logado */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-whatsapp-green/20 rounded-full flex items-center justify-center text-xs text-whatsapp-green font-bold shrink-0">
            {username?.[0]?.toUpperCase() || 'A'}
          </div>
          <span className="text-xs text-gray-300 truncate">{username}</span>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          className="text-gray-500 hover:text-red-400 transition-colors text-xs ml-2 shrink-0"
        >
          Sair
        </button>
      </div>

      {/* Status WhatsApp */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.dot} ${waStatus === 'connecting' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-gray-400">{cfg.label}</span>
        </div>
        {waUser && <p className="text-xs text-gray-500 mt-1 truncate">{waUser}</p>}
      </div>

      {/* Navegação */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-whatsapp-green/20 text-whatsapp-green'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">v1.0.0 &bull; Node.js + Baileys</p>
      </div>
    </aside>
  );
}
