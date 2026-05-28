import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/crm/kanban',    icon: '🗂️', label: 'Funil (Kanban)' },
  { to: '/crm/leads',     icon: '👥', label: 'Leads' },
  { to: '/crm/followups', icon: '📨', label: 'Follow-ups' },
  { to: '/crm/calendar',  icon: '📅', label: 'Calendário' },
  { to: '/crm/reports',   icon: '📈', label: 'Relatórios' },
  { to: '/crm/settings',  icon: '⚙️', label: 'Configurações' },
];

export default function SidebarCrm({ open, onClose }) {
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className={`
      fixed md:relative z-40 md:z-auto
      w-64 h-[100dvh] md:h-full
      bg-gray-900 border-r border-orange-900/40 flex flex-col shrink-0
      transition-transform duration-200 ease-in-out
      ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      <div className="p-5 border-b border-orange-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-crm-orange rounded-xl flex items-center justify-center text-xl">
            🗂️
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-tight">CRM</h1>
            <p className="text-xs text-gray-400">Kanban de Leads</p>
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

      <div className="px-4 py-3 border-b border-orange-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-crm-orange/20 rounded-full flex items-center justify-center text-xs text-crm-orange font-bold shrink-0">
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

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                isActive
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}

        <div className="border-t border-gray-800 my-2" />
        <NavLink
          to="/"
          className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 min-h-[44px]"
        >
          <span className="text-base">💬</span>
          Voltar ao WhatsApp
        </NavLink>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">CRM v1.0</p>
      </div>
    </aside>
  );
}
