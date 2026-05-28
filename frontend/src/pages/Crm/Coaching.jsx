import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const TYPE_META = {
  win:    { label: 'Vitórias',        color: '#10B981', bg: '#10B98115', icon: '🏆' },
  loss:   { label: 'Aprendizados',    color: '#EF4444', bg: '#EF444415', icon: '📚' },
  stale:  { label: 'Alertas',         color: '#F59E0B', bg: '#F59E0B15', icon: '⏰' },
  general:{ label: 'Geral',           color: '#6B7280', bg: '#6B728015', icon: '💡' },
};

function CoachingCard({ card, onDismiss }) {
  const meta = TYPE_META[card.type] || TYPE_META.general;
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await api.post(`/crm/coaching/${card.id}/dismiss`);
      onDismiss(card.id);
    } catch { toast.error('Erro ao descartar'); }
    finally { setDismissing(false); }
  };

  return (
    <div
      className="rounded-xl p-4 border transition-all hover:border-opacity-60"
      style={{ background: meta.bg, borderColor: meta.color + '40' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{card.emoji || meta.icon}</span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">{card.title}</h4>
            {card.lead_name && (
              <p className="text-xs mt-0.5" style={{ color: meta.color }}>
                <Link to={`/crm/leads?id=${card.lead_id}`} className="hover:underline">
                  {card.lead_name}
                </Link>
                {card.lead_stage && <span className="text-zinc-500"> · {card.lead_stage}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {card.score !== null && card.score !== undefined && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: card.score >= 70 ? '#10B98130' : card.score >= 40 ? '#F59E0B30' : '#EF444430',
                color: card.score >= 70 ? '#10B981' : card.score >= 40 ? '#F59E0B' : '#EF4444',
              }}
            >
              {card.score}/100
            </span>
          )}
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Descartar"
          >
            ✕
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{card.insight}</p>

      {card.action && (
        <div
          className="mt-3 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: meta.color + '20', color: meta.color }}
        >
          ▶ {card.action}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-zinc-600">
          {card.source === 'ai' ? '🤖 IA' : '📏 Regra'} ·{' '}
          {new Date(card.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </p>
      </div>
    </div>
  );
}

export default function Coaching() {
  const [cards, setCards]       = useState([]);
  const [summary, setSummary]   = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        api.get('/crm/coaching', { params: activeTab !== 'all' ? { type: activeTab } : {} }),
        api.get('/crm/coaching/summary'),
      ]);
      setCards(res.cards || []);
      setSummary(sum);
    } catch { toast.error('Erro ao carregar coaching'); }
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleDismiss = (id) => setCards(prev => prev.filter(c => c.id !== id));

  const TABS = [
    { key: 'all',   label: 'Todos',          icon: '💡', count: null },
    { key: 'win',   label: 'Vitórias',        icon: '🏆', count: summary?.wins },
    { key: 'loss',  label: 'Aprendizados',    icon: '📚', count: summary?.losses },
    { key: 'stale', label: 'Alertas',         icon: '⏰', count: summary?.stale },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          🎯 Coaching Inteligente
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          A IA analisa suas vendas e te dá feedback personalizado após cada negócio.
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Esta semana',  value: summary.total || 0,                  icon: '📊', color: '#D4AF37' },
            { label: 'Vitórias',     value: summary.wins || 0,                   icon: '🏆', color: '#10B981' },
            { label: 'Aprendizados', value: summary.losses || 0,                 icon: '📚', color: '#EF4444' },
            { label: 'Score médio',  value: summary.avg_score ? `${Math.round(summary.avg_score)}` : '—', icon: '⭐', color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-center">
              <div className="text-lg">{s.icon}</div>
              <div className="text-xl font-bold mt-1" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-surface-2)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 text-xs py-1.5 rounded-lg transition-colors font-medium"
            style={{
              background: activeTab === tab.key ? 'var(--gold-500, #D4AF37)' : 'transparent',
              color: activeTab === tab.key ? '#000' : 'var(--text-muted)',
            }}
          >
            {tab.icon} {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-[10px] opacity-70">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div
          className="rounded-xl border border-zinc-800 p-10 text-center"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm font-medium text-white">Nenhum coaching ainda</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
            Coaching cards são gerados automaticamente quando você fecha ou perde um negócio.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <CoachingCard key={card.id} card={card} onDismiss={handleDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
