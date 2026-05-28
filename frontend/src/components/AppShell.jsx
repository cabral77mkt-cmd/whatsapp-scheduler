import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from './ui/Avatar';
import CommandPalette from './CommandPalette';
import AlertsPanel from './AlertsPanel';
import { usePushNotifications } from '../hooks/usePushNotifications';
import api from '../lib/api';

/* ─────────────── Navigation config ────────────────────── */
const WA_NAV = [
  { to: '/',                  icon: '📊', label: 'Dashboard',          end: true },
  { to: '/inbox',             icon: '💬', label: 'Inbox'              },
  { to: '/conectar',          icon: '🔗', label: 'Conectar WhatsApp' },
  { to: '/agendar',           icon: '⏰', label: 'Agendar Mensagem'  },
  { to: '/envio-em-massa',    icon: '📢', label: 'Envio em Massa'    },
  { to: '/mensagens',         icon: '📋', label: 'Mensagens'         },
  { to: '/contatos',          icon: '👥', label: 'Contatos'          },
  { to: '/verificar-entregas',icon: '🔍', label: 'Verificar Entregas'},
  { to: '/grupos-vip',        icon: '👑', label: 'Grupos VIP'        },
  { to: '/tickfy',            icon: '🎟️', label: 'TICKFY'            },
];

const CRM_NAV = [
  { to: '/crm/resgatador',     icon: '🚨', label: 'Resgatador'       },
  { to: '/crm/kanban',         icon: '🗂️', label: 'Funil (Kanban)'  },
  { to: '/crm/leads',          icon: '👥', label: 'Leads'            },
  { to: '/crm/followups',      icon: '📨', label: 'Follow-ups'       },
  { to: '/crm/cadencias',      icon: '🔄', label: 'Cadências'        },
  { to: '/crm/auto-responder', icon: '🤖', label: 'AI Responder'     },
  { to: '/crm/coaching',       icon: '🎯', label: 'Coaching'         },
  { to: '/crm/battle-cards',   icon: '⚔️', label: 'Battle Cards'    },
  { to: '/crm/import',         icon: '📥', label: 'Importar Leads'   },
  { to: '/crm/outbound',       icon: '📣', label: 'Outbound'         },
  { to: '/crm/distribution',   icon: '🔀', label: 'Distribuição'      },
  { to: '/crm/commissions',    icon: '💰', label: 'Comissões'         },
  { to: '/crm/tickfy',         icon: '🎟️', label: 'Tickfy → CRM'     },
  { to: '/crm/goals',          icon: '🎯', label: 'Minhas Metas'      },
  { to: '/crm/analytics',      icon: '📊', label: 'Analytics'          },
  { to: '/crm/export',         icon: '📤', label: 'Exportar Dados'    },
  { to: '/crm/calendar',       icon: '📅', label: 'Calendário'       },
  { to: '/crm/reports',        icon: '📈', label: 'Relatórios'       },
  { to: '/crm/settings',       icon: '⚙️', label: 'Configurações'   },
  { to: '/crm/gestao',         icon: '📊', label: 'Gestão',  managerOnly: true },
  { to: '/crm/snippets',       icon: '📝', label: 'Snippets'         },
];

const FIN_NAV = [
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

/* ─────────────── WA Status dot ────────────────────────── */
const WA_STATUS = {
  connected:    { dot: '#10B981', label: 'Conectado',    pulse: false },
  connecting:   { dot: '#F59E0B', label: 'Conectando…',  pulse: true  },
  disconnected: { dot: '#EF4444', label: 'Desconectado', pulse: false },
  banned:       { dot: '#EF4444', label: 'Bloqueado',    pulse: false },
};

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      <span className="text-base w-5 text-center shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function SectionHeader({ icon, title, accentColor, open, onToggle, badge }) {
  return (
    <button onClick={onToggle} className="nav-section-btn" style={{ color: accentColor }}>
      <span className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        {title}
        {badge}
      </span>
      <span className="text-xs opacity-60">{open ? '▲' : '▼'}</span>
    </button>
  );
}

/* ─────────────── Mobile bottom tab bar ─────────────────── */
const BOTTOM_TABS = [
  { to: '/inbox',        icon: '💬', label: 'Inbox'   },
  { to: '/crm/kanban',   icon: '🗂️', label: 'Kanban'  },
  { to: '/crm/followups',icon: '📨', label: 'Follow'  },
  { to: '/',             icon: '📊', label: 'Dash', end: true },
];

function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch"
      style={{
        background: 'var(--bg-sidebar)',
        borderTop:  '1px solid var(--border-default)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {BOTTOM_TABS.map((tab) => {
        const isActive = tab.end
          ? location.pathname === tab.to
          : location.pathname.startsWith(tab.to);
        return (
          <button
            key={tab.to}
            onClick={() => navigate(tab.to)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
            style={{ color: isActive ? 'var(--gold-500)' : 'var(--text-muted)' }}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
            {isActive && (
              <span
                className="absolute bottom-0 rounded-t-full"
                style={{ width: 24, height: 2, background: 'var(--gold-500)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ─────────────── Push notification prompt ──────────────── */
function PushPrompt({ onDismiss }) {
  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 z-40 flex items-start gap-3 p-4 rounded-2xl shadow-2xl max-w-xs"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--gold-500)',
        boxShadow: '0 8px 32px #D4AF3733',
      }}
    >
      <span className="text-2xl shrink-0">🔔</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Ativar Notificações
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Receba alertas de leads quentes e follow-ups vencendo.
        </p>
        <div className="flex gap-2 mt-3">
          <button className="btn-primary text-xs py-1.5 px-3" onClick={onDismiss}>
            Ativar
          </button>
          <button
            className="text-xs px-2"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => {
              localStorage.setItem('push_dismissed', '1');
              onDismiss(false);
            }}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Main AppShell ─────────────────────────── */
export default function AppShell({
  onLogout,
  waStatus,
  waUser,
  entityBadge,
  children,
}) {
  const { username, isAdmin, role } = useAuth();
  const isManager = role === 'manager' || isAdmin;
  const location = useLocation();

  const inCrm = location.pathname.startsWith('/crm');
  const inFin = location.pathname.startsWith('/fin');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [waOpen,  setWaOpen]  = useState(!inCrm && !inFin);
  const [crmOpen, setCrmOpen] = useState(inCrm);
  const [finOpen, setFinOpen] = useState(inFin);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [streak, setStreak] = useState(0);

  const { supported: pushSupported, permission: pushPerm, subscribed: pushSubscribed, subscribe: pushSubscribe } = usePushNotifications();

  /* Show push prompt after 30s if not yet subscribed/dismissed */
  useEffect(() => {
    if (!pushSupported || pushPerm === 'granted' || localStorage.getItem('push_dismissed')) return;
    const t = setTimeout(() => setShowPushPrompt(true), 30000);
    return () => clearTimeout(t);
  }, [pushSupported, pushPerm]);

  /* Close mobile sidebar on route change */
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  /* F6: Load streak */
  useEffect(() => {
    api.get('/dashboard/metrics')
      .then(data => setStreak(data?.streak?.current || 0))
      .catch(() => {});
  }, []);

  /* Global Cmd+K / Ctrl+K shortcut */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const waCfg = WA_STATUS[waStatus] || WA_STATUS.disconnected;

  /* ── Topbar title derivation ─── */
  const topbarTitle = inCrm ? '🗂️ CRM' : inFin ? '💰 Finanças' : '💬 WhatsApp Scheduler';

  return (
    <div
      className="flex h-[100dvh] overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─────────────────────────────────────── */}
      <aside
        className={`
          fixed md:relative z-40 md:z-auto
          w-64 h-[100dvh] md:h-full
          flex flex-col shrink-0
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {/* Logo */}
        <div
          className="px-4 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-black text-sm shrink-0"
              style={{ background: 'var(--gold-500)' }}
            >
              W
            </div>
            <div>
              <p className="font-display font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                WA Scheduler
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plataforma Comercial</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>

        {/* User */}
        <div
          className="px-4 py-3 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={username} size="sm" />
            <div className="min-w-0">
              <span className="text-xs truncate block" style={{ color: 'var(--text-secondary)' }}>{username}</span>
              {streak > 0 && (
                <span
                  className="text-[10px] font-bold"
                  style={{ color: streak >= 7 ? 'var(--gold-400)' : '#F97316' }}
                  title={`${streak} dias produtivos consecutivos!`}
                >
                  🔥 {streak}d streak
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="text-xs px-2 py-1 rounded transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            Sair
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">

          {/* ── WhatsApp section ── */}
          <SectionHeader
            icon="💬"
            title="WhatsApp"
            accentColor="var(--accent-whatsapp)"
            open={waOpen}
            onToggle={() => setWaOpen((v) => !v)}
            badge={
              waStatus && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${waCfg.pulse ? 'animate-pulse' : ''}`}
                  style={{ background: waCfg.dot }}
                />
              )
            }
          />
          {waOpen && (
            <div className="space-y-0.5 mb-2">
              {WA_NAV.map((item) => <NavItem key={item.to} {...item} />)}
            </div>
          )}

          <div className="my-1" style={{ borderTop: '1px solid var(--border-default)' }} />

          {/* ── CRM section ── */}
          <SectionHeader
            icon="🗂️"
            title="CRM"
            accentColor="var(--accent-crm)"
            open={crmOpen}
            onToggle={() => setCrmOpen((v) => !v)}
          />
          {crmOpen && (
            <div className="space-y-0.5 mb-2">
              {CRM_NAV.filter((item) => !item.managerOnly || isManager).map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          )}

          <div className="my-1" style={{ borderTop: '1px solid var(--border-default)' }} />

          {/* ── Finance section ── */}
          <SectionHeader
            icon="💰"
            title="Finanças"
            accentColor="var(--accent-finance)"
            open={finOpen}
            onToggle={() => setFinOpen((v) => !v)}
          />
          {finOpen && (
            <div className="space-y-0.5 mb-2">
              {entityBadge && (
                <div className="px-3 py-2 mb-1">{entityBadge}</div>
              )}
              {FIN_NAV.map((item) => <NavItem key={item.to} {...item} />)}
            </div>
          )}

          {/* ── Configurações (todos) ── */}
          <div className="my-1" style={{ borderTop: '1px solid var(--border-default)' }} />
          <NavItem to="/configuracoes" icon="⚙️" label="Configurações" />

          {/* ── Admin ── */}
          {isAdmin && (
            <>
              <div className="my-1" style={{ borderTop: '1px solid var(--border-default)' }} />
              <NavItem to="/admin/usuarios"  icon="👤" label="Gerenciar Usuários" />
              <NavItem to="/admin/auditoria" icon="🔍" label="Auditoria" />
              <NavItem to="/admin/api-keys"  icon="🔑" label="API & Integrações" />
            </>
          )}
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border-default)' }}
        >
          {waStatus && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${waCfg.pulse ? 'animate-pulse' : ''}`}
                style={{ background: waCfg.dot }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                WA: {waCfg.label}
                {waUser && ` · ${waUser}`}
              </span>
            </div>
          )}
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
            v1.1.0 · Node.js + Baileys
          </p>
        </div>
      </aside>

      {/* ─── Command Palette ─────────────────────────────── */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* ─── Main area ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header
          className="flex items-center gap-3 px-4 shrink-0"
          style={{
            minHeight: 52,
            background: 'var(--bg-sidebar)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Abrir menu"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ☰
          </button>

          {/* Module title (mobile) */}
          <span
            className="md:hidden font-semibold text-sm truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {topbarTitle}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search trigger (Cmd+K) */}
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-muted)',
              minWidth: 180,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
          >
            <span>🔍</span>
            <span className="flex-1 text-left">Buscar…</span>
            <kbd
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-surface-2)', color: 'var(--text-disabled)' }}
            >
              ⌘K
            </kbd>
          </button>

          {/* Alerts bell — Onda 7 */}
          <AlertsPanel />

          {/* Push bell */}
          {pushSupported && pushPerm !== 'denied' && (
            <button
              onClick={() => !pushSubscribed && pushSubscribe()}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              title={pushSubscribed ? 'Notificações ativas' : 'Ativar notificações'}
              style={{ color: pushSubscribed ? 'var(--gold-500)' : 'var(--text-muted)' }}
            >
              {pushSubscribed ? '🔔' : '🔕'}
            </button>
          )}

          {/* User avatar */}
          <div className="flex items-center gap-2">
            <Avatar name={username} size="sm" />
            <span
              className="hidden md:block text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {username}
            </span>
          </div>
        </header>

        {/* Page content — bottom padding on mobile for tab bar */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* ─── Mobile bottom tab bar ───────────────────────── */}
      <BottomTabBar />

      {/* ─── Push notification prompt ────────────────────── */}
      {showPushPrompt && !pushSubscribed && (
        <PushPrompt
          onDismiss={(doSubscribe = true) => {
            setShowPushPrompt(false);
            if (doSubscribe) pushSubscribe();
          }}
        />
      )}
    </div>
  );
}
