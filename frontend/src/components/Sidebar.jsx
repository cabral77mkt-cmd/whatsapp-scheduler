import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  { to: '/verificar-entregas', icon: '🔍', label: 'Verificar Entregas' },
  { to: '/grupos-vip', icon: '👑', label: 'Grupos VIP' },
  { to: '/tickfy',     icon: '🎟️', label: 'TICKFY' },
  { to: '/crm/kanban', icon: '🗂️', label: 'CRM Kanban' },
];

const financeItems = [
  { to: '/financas',             icon: '📈', label: 'Dashboard' },
  { to: '/financas/entidades',   icon: '🏢', label: 'Entidades' },
  { to: '/financas/transacoes',  icon: '💳', label: 'Transações' },
  { to: '/financas/categorias',  icon: '📂', label: 'Categorias' },
  { to: '/financas/orcamentos',  icon: '🎯', label: 'Orçamentos' },
];

export default function Sidebar({ waStatus, waUser, open, onClose }) {
  const cfg = STATUS_CONFIG[waStatus] || STATUS_CONFIG.disconnected;
  const { username, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [financeOpen, setFinanceOpen] = useState(location.pathname.startsWith('/financas'));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`
      fixed md:relative z-40 md:z-auto
      w-64 h-[100dvh] md:h-full
      bg-gray-900 border-r border-gray-800 flex flex-col shrink-0
      transition-transform duration-200 ease-in-out
      ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      {/* Logo + botão fechar mobile */}
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-whatsapp-green rounded-xl flex items-center justify-center text-xl">
            💬
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-tight">WhatsApp</h1>
            <p className="text-xs text-gray-400">Scheduler</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-2 text-gray-500 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg"
          aria-label="Fechar menu"
        >
          ✕
        </button>
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
          className="text-gray-500 hover:text-red-400 transition-colors text-xs ml-2 shrink-0 min-h-[44px] px-2 flex items-center"
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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
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

        {/* Seção Finanças */}
        <div className="border-t border-gray-800 my-2" />
        <button
          onClick={() => setFinanceOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-all min-h-[44px]"
        >
          <span className="flex items-center gap-3">
            <span className="text-base">💰</span>
            Finanças
          </span>
          <span className="text-xs text-gray-500">{financeOpen ? '▲' : '▼'}</span>
        </button>
        {financeOpen && (
          <div className="ml-3 space-y-0.5">
            {financeItems.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/financas'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                    isActive
                      ? 'bg-blue-900/30 text-blue-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`
                }
              >
                <span className="text-sm">{icon}</span>
                {label}
              </NavLink>
            ))}
          </div>
        )}

        {isAdmin && (
          <>
            <div className="border-t border-gray-800 my-2" />
            <NavLink
              to="/admin/usuarios"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                  isActive
                    ? 'bg-whatsapp-green/20 text-whatsapp-green'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              <span className="text-base">👤</span>
              Gerenciar Usuários
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">v1.0.0 &bull; Node.js + Baileys</p>
      </div>
    </aside>
  );
}
