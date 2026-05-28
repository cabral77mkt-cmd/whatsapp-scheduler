import React, { useState, useEffect, Component } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import Connect from './pages/Connect';
import Schedule from './pages/Schedule';
import Messages from './pages/Messages';
import Contacts from './pages/Contacts';
import BulkSend from './pages/BulkSend';
import CheckDelivery from './pages/CheckDelivery';
import GruposVip from './pages/GruposVip';
import AdminUsers from './pages/AdminUsers';
import Tickfy from './pages/Tickfy';
import Inbox from './pages/Inbox';
import Login from './pages/Login';
import LoginFinancas from './pages/LoginFinancas';
import FinancasDashboard from './pages/Financas/Dashboard';
import Entidades from './pages/Financas/Entidades';
import Transacoes from './pages/Financas/Transacoes';
import Categorias from './pages/Financas/Categorias';
import Orcamentos from './pages/Financas/Orcamentos';
import ConfiguracaoEntidade from './pages/Financas/ConfiguracaoEntidade';
import ContasPagar from './pages/Financas/ContasPagar';
import Recorrencias from './pages/Financas/Recorrencias';
import FluxoCaixa from './pages/Financas/FluxoCaixa';
import Projetos from './pages/Financas/Projetos';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { EntityProvider, useEntity } from './contexts/EntityContext';
import EntitySelector from './pages/Financas/EntitySelector';
import KanbanBoard from './pages/Crm/KanbanBoard';
import CrmLeads from './pages/Crm/Leads';
import CrmFollowups from './pages/Crm/Followups';
import CrmReports from './pages/Crm/Reports';
import CrmSettings from './pages/Crm/Settings';
import CrmCalendar from './pages/Crm/Calendar';
import CrmCadencias from './pages/Crm/Cadencias';
import CrmGestao    from './pages/Crm/Gestao';
import CrmSnippets  from './pages/Crm/Snippets';
import CrmResgatador   from './pages/Crm/Resgatador';
import CrmAutoResponder from './pages/Crm/AutoResponder';
import CrmCoaching      from './pages/Crm/Coaching';
import CrmBattleCards   from './pages/Crm/BattleCards';
import CrmImport        from './pages/Crm/Import';
import CrmOutbound      from './pages/Crm/Outbound';
import CrmDistribution  from './pages/Crm/Distribution';
import CrmGoals         from './pages/Crm/Goals';
import CrmAnalytics     from './pages/Crm/Analytics';
import CrmExport        from './pages/Crm/Export';
import LeadTimeline     from './pages/Crm/LeadTimeline';
import CrmCommissions   from './pages/Crm/Commissions';
import CrmTickfy        from './pages/Crm/TickfyIntegration';
import Auditoria        from './pages/Admin/Auditoria';
import ApiKeys      from './pages/Admin/ApiKeys';
import Configuracoes from './pages/Configuracoes';
import socket from './lib/socket';

/* ─── ErrorBoundary ────────────────────────────────────── */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-4"
          style={{ background: 'var(--bg-canvas)' }}
        >
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
              Algo deu errado
            </p>
            <p className="text-sm mb-5 break-all" style={{ color: 'var(--text-secondary)' }}>
              {this.state.error?.message}
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              🔄 Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── FinanceLayout ─────────────────────────────────────── */
function FinanceLayoutInner() {
  const { entity, clearEntity } = useEntity();
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isSelectPage = location.pathname === '/fin/select';

  const handleLogout = () => {
    clearEntity();
    logout();
    navigate('/fin');
  };

  /* Entity badge shown inside Finance section of AppShell sidebar */
  const entityBadge = entity ? (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-6 h-6 flex items-center justify-center rounded-md text-sm shrink-0"
          style={{ backgroundColor: entity.color + '33', border: `1.5px solid ${entity.color}` }}
        >
          {entity.icon}
        </span>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {entity.name}
        </span>
      </div>
      <button
        onClick={() => { clearEntity(); navigate('/fin/select'); }}
        className="text-xs shrink-0 transition-colors"
        style={{ color: 'var(--accent-finance)' }}
      >
        Trocar
      </button>
    </div>
  ) : null;

  if (!entity && !isSelectPage) return <Navigate to="/fin/select" replace />;

  if (isSelectPage) {
    return (
      <Routes>
        <Route path="select" element={<EntitySelector />} />
        <Route path="*" element={<Navigate to="/fin/select" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell onLogout={handleLogout} entityBadge={entityBadge}>
      <Routes>
        <Route path="dashboard"    element={<FinancasDashboard />} />
        <Route path="entidades"    element={<Entidades />} />
        <Route path="transacoes"   element={<Transacoes />} />
        <Route path="categorias"   element={<Categorias />} />
        <Route path="orcamentos"   element={<Orcamentos />} />
        <Route path="contas"       element={<ContasPagar />} />
        <Route path="recorrencias" element={<Recorrencias />} />
        <Route path="fluxo"        element={<FluxoCaixa />} />
        <Route path="projetos"     element={<Projetos />} />
        <Route path="configuracoes" element={<ConfiguracaoEntidade />} />
        <Route path="*"            element={<Navigate to="/fin/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

function FinanceLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/fin" state={{ from: location }} replace />;
  return (
    <EntityProvider>
      <FinanceLayoutInner />
    </EntityProvider>
  );
}

/* ─── CrmLayout ─────────────────────────────────────────── */
function CrmLayout() {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket.connected) {
      socket.auth = { token: localStorage.getItem('wa_token') || '' };
      socket.connect();
    }
  }, []);

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <AppShell onLogout={handleLogout}>
      <Routes>
        <Route path="kanban"    element={<KanbanBoard />} />
        <Route path="leads"     element={<CrmLeads />} />
        <Route path="followups" element={<CrmFollowups />} />
        <Route path="calendar"  element={<CrmCalendar />} />
        <Route path="reports"   element={<CrmReports />} />
        <Route path="settings"   element={<CrmSettings />} />
        <Route path="cadencias"  element={<CrmCadencias />} />
        <Route path="gestao"     element={<CrmGestao />} />
        <Route path="snippets"   element={<CrmSnippets />} />
        <Route path="resgatador"    element={<CrmResgatador />} />
        <Route path="auto-responder" element={<CrmAutoResponder />} />
        <Route path="coaching"       element={<CrmCoaching />} />
        <Route path="battle-cards"   element={<CrmBattleCards />} />
        <Route path="import"         element={<CrmImport />} />
        <Route path="outbound"       element={<CrmOutbound />} />
        <Route path="distribution"   element={<CrmDistribution />} />
        <Route path="commissions"    element={<CrmCommissions />} />
        <Route path="tickfy"         element={<CrmTickfy />} />
        <Route path="goals"          element={<CrmGoals />} />
        <Route path="analytics"      element={<CrmAnalytics />} />
        <Route path="export"         element={<CrmExport />} />
        <Route path="lead/:id"       element={<LeadTimeline />} />
        <Route path="*"             element={<Navigate to="/crm/kanban" replace />} />
      </Routes>
    </AppShell>
  );
}

/* ─── ProtectedLayout ───────────────────────────────────── */
function ProtectedLayout() {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [waStatus, setWaStatus] = useState('connecting');
  const [waUser, setWaUser] = useState(null);

  useEffect(() => {
    if (!socket.connected) {
      socket.auth = { token: localStorage.getItem('wa_token') || '' };
      socket.connect();
    }

    socket.on('status', ({ status, user }) => {
      setWaStatus(status);
      if (user) setWaUser(user);
      if (status === 'disconnected') setWaUser(null);
    });

    socket.emit('requestStatus');

    import('./lib/api').then(({ default: api }) => {
      api.get('/status').then(({ status }) => setWaStatus(status)).catch(() => {});
    });

    return () => socket.off('status');
  }, []);

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <AppShell onLogout={handleLogout} waStatus={waStatus} waUser={waUser}>
      <Routes>
        <Route path="/"                    element={<Dashboard waStatus={waStatus} />} />
        <Route path="/inbox"               element={<Inbox />} />
        <Route path="/conectar"            element={<Connect waStatus={waStatus} />} />
        <Route path="/agendar"             element={<Schedule />} />
        <Route path="/mensagens"           element={<Messages />} />
        <Route path="/contatos"            element={<Contacts />} />
        <Route path="/envio-em-massa"      element={<BulkSend />} />
        <Route path="/verificar-entregas"  element={<CheckDelivery />} />
        <Route path="/grupos-vip"          element={<GruposVip />} />
        <Route path="/tickfy"              element={<Tickfy />} />
        <Route path="/admin/usuarios"      element={<AdminUsers />} />
        <Route path="/admin/auditoria"     element={<Auditoria />} />
        <Route path="/admin/api-keys"      element={<ApiKeys />} />
        <Route path="/configuracoes"       element={<Configuracoes />} />
        <Route path="/financas"            element={<FinancasDashboard />} />
        <Route path="/financas/entidades"  element={<Entidades />} />
        <Route path="/financas/transacoes" element={<Transacoes />} />
        <Route path="/financas/categorias" element={<Categorias />} />
        <Route path="/financas/orcamentos" element={<Orcamentos />} />
      </Routes>
    </AppShell>
  );
}

/* ─── Auth guards ───────────────────────────────────────── */
function LoginGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <Login />;
}

function FinanceLoginGuard() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginFinancas />;
  const hasEntity = !!localStorage.getItem('wa_fin_entity');
  return <Navigate to={hasEntity ? '/fin/dashboard' : '/fin/select'} replace />;
}

/* ─── Root ──────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/login"  element={<LoginGuard />} />
          <Route path="/fin"    element={<FinanceLoginGuard />} />
          <Route path="/fin/*"  element={<FinanceLayout />} />
          <Route path="/crm/*"  element={<CrmLayout />} />
          <Route path="/*"      element={<ProtectedLayout />} />
        </Routes>
      </ErrorBoundary>
    </AuthProvider>
  );
}
