import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEntity } from '../contexts/EntityContext';
import api from '../lib/api';

const financeNavItems = [
  { to: '/fin/dashboard',     icon: '📈', label: 'Dashboard'      },
  { to: '/fin/entidades',     icon: '🏢', label: 'Entidades'      },
  { to: '/fin/transacoes',    icon: '💳', label: 'Transações'     },
  { to: '/fin/contas',        icon: '⏰', label: 'Contas'         },
  { to: '/fin/recorrencias',  icon: '🔄', label: 'Recorrências'   },
  { to: '/fin/fluxo',         icon: '📉', label: 'Fluxo de Caixa' },
  { to: '/fin/projetos',      icon: '🎪', label: 'Projetos'       },
  { to: '/fin/categorias',    icon: '📂', label: 'Categorias'     },
  { to: '/fin/orcamentos',    icon: '🎯', label: 'Orçamentos'     },
  { to: '/fin/configuracoes', icon: '⚙️', label: 'Configurações'  },
];

export default function SidebarFinancas({ open, onClose }) {
  const { username, logout }    = useAuth();
  const { entity, clearEntity } = useEntity();
  const navigate                = useNavigate();
  const [waStatus, setWaStatus] = useState('connecting');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await api.get('/status');
        setWaStatus(r.status || 'disconnected');
      } catch { setWaStatus('disconnected'); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const statusConfig = {
    connected:    { dot: 'bg-green-400',  text: 'Conectado',    color: 'text-green-400'  },
    connecting:   { dot: 'bg-yellow-400 animate-pulse', text: 'Conectando…', color: 'text-yellow-400' },
    disconnected: { dot: 'bg-red-500',    text: 'Desconectado', color: 'text-red-400'    },
    banned:       { dot: 'bg-red-600',    text: 'Bloqueado',    color: 'text-red-500'    },
  };
  const st = statusConfig[waStatus] || statusConfig.disconnected;

  const handleLogout = () => {
    clearEntity();
    logout();
    navigate('/fin');
  };

  const handleTrocar = () => {
    clearEntity();
    navigate('/fin/select');
  };

  return (
    <aside className={`
      fixed md:relative z-40 md:z-auto
      w-64 h-[100dvh] md:h-full
      bg-gray-900 border-r border-blue-900/40 flex flex-col shrink-0
      transition-transform duration-200 ease-in-out
      ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>

      {/* Logo + botão fechar mobile */}
      <div className="p-5 border-b border-blue-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-blue-900/40">
            💰
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-tight">Finanças</h1>
            <p className="text-xs text-blue-400">WhatsApp</p>
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

      {/* Empresa selecionada */}
      {entity && (
        <div className="px-4 py-3 border-b border-blue-900/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-8 h-8 flex items-center justify-center rounded-lg text-lg flex-shrink-0"
                style={{ backgroundColor: entity.color + '33', border: `1.5px solid ${entity.color}` }}
              >
                {entity.icon}
              </span>
              <span className="text-sm font-semibold text-white truncate">{entity.name}</span>
            </div>
            <button
              onClick={handleTrocar}
              className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 transition-colors min-h-[44px] px-2 flex items-center"
              title="Trocar empresa"
            >
              Trocar
            </button>
          </div>
        </div>
      )}

      {/* Usuário logado */}
      <div className="px-4 py-3 border-b border-blue-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-blue-600/20 rounded-full flex items-center justify-center text-xs text-blue-400 font-bold shrink-0">
            {username?.[0]?.toUpperCase() || 'U'}
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

      {/* Navegação */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {financeNavItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-700/40'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* WhatsApp Status */}
      <div className="px-4 py-3 border-t border-blue-900/40">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
          <span className={`text-xs font-medium ${st.color}`}>WhatsApp: {st.text}</span>
        </div>
        {waStatus === 'disconnected' && (
          <p className="text-xs text-gray-500 mt-1 leading-tight">
            Transações automáticas pausadas.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-blue-900/40">
        <p className="text-xs text-blue-900/60 text-center">Finanças WhatsApp &bull; v2.0</p>
      </div>
    </aside>
  );
}
