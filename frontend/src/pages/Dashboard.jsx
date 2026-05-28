import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { MetricCard } from '../components/ui/MetricCard';

/* ─── helpers ──────────────────────────────────────────────── */
const fmt = (n) =>
  n >= 1_000_000 ? `R$ ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `R$ ${(n / 1_000).toFixed(1)}k`
  : `R$ ${Number(n || 0).toFixed(0)}`;

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const STAGE_LABELS = {
  entrou_contato: 'Entrou', conversando: 'Conv.', diagnostico: 'Diag.',
  reuniao_agendada: 'Reun. Ag.', reuniao_realizada: 'Reun. Ok',
  aguardando_proposta: 'Ag. Prop.', proposta_enviada: 'Prop. Env.',
  analisando_proposta: 'Analis.', negociacao: 'Negoc.',
};

const STAGE_COLOR = {
  entrou_contato: '#64748B', conversando: '#3B82F6', diagnostico: '#06B6D4',
  reuniao_agendada: '#6366F1', reuniao_realizada: '#8B5CF6',
  aguardando_proposta: '#F59E0B', proposta_enviada: '#F97316',
  analisando_proposta: '#EAB308', negociacao: '#EC4899',
};

const WA_STATUS = {
  connected:    { dot: '#10B981', label: 'Conectado',   bg: '#10B98115' },
  connecting:   { dot: '#F59E0B', label: 'Conectando…', bg: '#F59E0B15' },
  disconnected: { dot: '#EF4444', label: 'Desconectado',bg: '#EF444415' },
};

/* ─── sub-components ───────────────────────────────────────── */
function AgendaItem({ item }) {
  const isMeeting  = item.type === 'meeting';
  const navigate   = useNavigate();
  return (
    <button
      onClick={() => navigate(`/crm/kanban`)}
      className="w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors"
      style={{ background: 'var(--bg-surface-2)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface-2)'}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0"
        style={{ background: isMeeting ? '#6366F115' : '#F9731615' }}
      >
        {isMeeting ? '📅' : '📨'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {item.lead_name || 'Lead'}
        </p>
        {item.description && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {item.description}
          </p>
        )}
      </div>
      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
        {timeLabel(item.scheduled_at)}
      </span>
    </button>
  );
}

function AiLeadItem({ lead }) {
  const navigate = useNavigate();
  const scoreColor = lead.score >= 70 ? '#D4AF37' : lead.score >= 40 ? '#F59E0B' : '#9CA3AF';
  const tempIcon   = { quente: '🔥', frio: '🧊', morno: '😐' }[lead.temperature] || '😐';
  return (
    <button
      onClick={() => navigate(`/crm/kanban`)}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors"
      style={{ background: 'var(--bg-surface-2)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface-2)'}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
        style={{ background: scoreColor + '22', color: scoreColor }}
      >
        {lead.score}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {tempIcon} {lead.name || lead.phone}
        </p>
        {lead.next_step_text && (
          <p className="text-xs truncate" style={{ color: 'var(--gold-400)' }}>
            ✨ {lead.next_step_text}
          </p>
        )}
      </div>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
        style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
      >
        {STAGE_LABELS[lead.stage] || lead.stage}
      </span>
    </button>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function Dashboard({ waStatus: waStatusProp }) {
  const { isAdmin } = useAuth();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const d = await api.get('/dashboard/home');
      setData(d);
    } catch (e) {
      console.error('[Dashboard] load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh every 60s, pause when tab hidden
  useEffect(() => {
    let t = setInterval(load, 60000);
    const onVis = () => {
      if (document.hidden) { clearInterval(t); t = null; }
      else { load(); t = setInterval(load, 60000); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const kpis     = data?.kpis             || {};
  const agenda   = data?.agenda           || [];
  const pipeline = data?.pipeline         || [];
  const aiLeads  = data?.ai_leads         || [];
  const waStatus = data?.wa_status        || waStatusProp || 'disconnected';
  const waCfg    = WA_STATUS[waStatus]    || WA_STATUS.disconnected;
  const global   = data?.global_kpis;
  const pm       = data?.personal_metrics || null; // F6

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-lg" style={{ background: 'var(--bg-surface-2)' }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl" style={{ background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            📊 Visão Geral
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* WA status badge */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: waCfg.bg, border: `1px solid ${waCfg.dot}33` }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: waCfg.dot }} />
          <span className="text-xs font-medium" style={{ color: waCfg.dot }}>WA {waCfg.label}</span>
          {waStatus !== 'connected' && (
            <Link
              to="/conectar"
              className="text-xs underline ml-1"
              style={{ color: 'var(--gold-400)' }}
            >
              Conectar
            </Link>
          )}
        </div>
      </div>

      {/* ── Admin global KPIs ── */}
      {isAdmin && global && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        >
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Equipe</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--gold-400)' }}>{global.team_count}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Leads Ativos (Global)</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{global.active_leads}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Negócios (Mês)</p>
            <p className="text-2xl font-bold" style={{ color: '#10B981' }}>{global.deals}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Receita (Mês)</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--gold-400)' }}>{fmt(global.revenue)}</p>
          </div>
        </div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Receita do Mês"
          value={fmt(kpis.revenue)}
          sub={kpis.target_revenue > 0
            ? `Meta: ${fmt(kpis.target_revenue)} (${kpis.pct_revenue ?? 0}%)`
            : 'Sem meta definida'}
          icon="💰"
        />
        <MetricCard
          label="Negócios Fechados"
          value={kpis.deals_closed ?? 0}
          sub={kpis.target_deals > 0 ? `Meta: ${kpis.target_deals}` : 'Este mês'}
          icon="🤝"
          color={kpis.deals_closed > 0 ? '#10B981' : undefined}
        />
        <MetricCard
          label="Leads Ativos"
          value={kpis.active_leads ?? 0}
          sub={kpis.stale_count > 0 ? `⚠️ ${kpis.stale_count} parados >7d` : 'Pipeline saudável ✅'}
          icon="👥"
          color={kpis.stale_count > 5 ? '#F59E0B' : undefined}
        />
        <MetricCard
          label="Reuniões Hoje"
          value={kpis.today_meetings ?? 0}
          sub={agenda.length > 0 ? `${agenda.length} item(s) na agenda` : 'Agenda livre hoje'}
          icon="📅"
          color={kpis.today_meetings > 0 ? '#6366F1' : undefined}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Agenda do dia */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              📋 Agenda de Hoje
            </h2>
            <Link
              to="/crm/calendar"
              className="text-xs"
              style={{ color: 'var(--gold-400)' }}
            >
              Ver tudo →
            </Link>
          </div>
          {agenda.length > 0 ? (
            <div className="space-y-2">
              {agenda.map((item, i) => <AgendaItem key={`${item.type}-${item.id}-${i}`} item={item} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <span className="text-3xl">☀️</span>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Agenda livre hoje</p>
              <Link to="/crm/followups" className="text-xs" style={{ color: 'var(--gold-400)' }}>
                Ver follow-ups pendentes →
              </Link>
            </div>
          )}
        </div>

        {/* IA sugere + Pipeline */}
        <div className="space-y-5 lg:col-span-2">

          {/* IA sugere */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                🤖 IA Sugere — Ação Agora
              </h2>
              <Link to="/crm/kanban" className="text-xs" style={{ color: 'var(--gold-400)' }}>
                Ver Kanban →
              </Link>
            </div>
            {aiLeads.length > 0 ? (
              <div className="space-y-1.5">
                {aiLeads.map(lead => <AiLeadItem key={lead.id} lead={lead} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 gap-2">
                <span className="text-2xl">🤖</span>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  IA ainda analisando os leads…
                </p>
                <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                  Scores são gerados a cada 15 minutos
                </p>
              </div>
            )}
          </div>

          {/* Mini pipeline */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                🔽 Pipeline
              </h2>
              <Link to="/crm/kanban" className="text-xs" style={{ color: 'var(--gold-400)' }}>
                Abrir Kanban →
              </Link>
            </div>
            <div className="space-y-1.5">
              {pipeline.filter(p => p.count > 0).slice(0, 6).map(p => (
                <div key={p.stage} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: STAGE_COLOR[p.stage] || '#6B7280' }}
                  />
                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {p.label}
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {p.count}
                  </span>
                  {p.total_value > 0 && (
                    <span className="text-[10px]" style={{ color: '#10B981' }}>
                      {fmt(p.total_value)}
                    </span>
                  )}
                </div>
              ))}
              {pipeline.filter(p => p.count > 0).length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>
                  Nenhum lead ativo no pipeline
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── F6: Métricas pessoais & Streak ── */}
      {pm && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              📈 Suas Métricas
            </h2>
            {pm.streak?.current > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                style={{ background: pm.streak.current >= 7 ? '#D4AF3720' : '#F9731615', border: `1px solid ${pm.streak.current >= 7 ? '#D4AF3740' : '#F9731635'}` }}
              >
                <span className="text-sm">🔥</span>
                <span className="text-xs font-bold" style={{ color: pm.streak.current >= 7 ? 'var(--gold-400)' : '#F97316' }}>
                  {pm.streak.current}d streak
                </span>
                {pm.streak.longest > 0 && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    · recorde: {pm.streak.longest}d
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Hoje vs Semana */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Msgs hoje',    value: pm.today.messages_sent,   icon: '💬', sub: `${pm.week.messages_sent} na semana`  },
              { label: 'Follow-ups',   value: pm.today.followups_done,  icon: '📨', sub: `${pm.week.followups_done} na semana` },
              { label: 'Hot Recovery', value: pm.today.hot_recoveries,  icon: '🔥', sub: `${pm.week.hot_recoveries} na semana` },
              { label: 'Leads ativos', value: pm.pipeline.active,       icon: '👥', sub: `${pm.pipeline.closed_month} fechados no mês` },
            ].map(m => (
              <div
                key={m.label}
                className="p-3 rounded-xl text-center"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}
              >
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{m.icon} {m.label}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{m.value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-disabled)' }}>{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Mini barchart da semana */}
          {pm.chart?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Atividade da semana
              </p>
              <div className="flex items-end gap-1.5 h-10">
                {pm.chart.map((day, i) => {
                  const total = (day.messages_sent || 0) + (day.followups_done || 0);
                  const maxVal = Math.max(...pm.chart.map(d => (d.messages_sent || 0) + (d.followups_done || 0)), 1);
                  const pct = Math.round((total / maxVal) * 100);
                  const isToday = day.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.date}: ${total} ações`}>
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max(pct, 4)}%`,
                          background: isToday ? 'var(--gold-500)' : total > 0 ? 'var(--gold-400)' : 'var(--bg-surface)',
                          opacity: total === 0 ? 0.3 : 1,
                          minHeight: 3,
                        }}
                      />
                      <span className="text-[8px]" style={{ color: isToday ? 'var(--gold-400)' : 'var(--text-disabled)' }}>
                        {['D','S','T','Q','Q','S','S'][new Date(day.date + 'T12:00:00').getDay()]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="card">
        <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          ⚡ Ações Rápidas
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/inbox',          icon: '💬', label: 'Inbox',           sub: 'Responder leads' },
            { to: '/crm/kanban',     icon: '🗂️', label: 'Kanban',          sub: 'Ver pipeline'    },
            { to: '/crm/followups',  icon: '📨', label: 'Follow-ups',      sub: 'Pendentes hoje'  },
            { to: '/agendar',        icon: '⏰', label: 'Agendar Msg',     sub: 'Envio programado'},
          ].map(({ to, icon, label, sub }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 p-3 rounded-xl transition-all"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-500)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
            >
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
