import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import toast from 'react-hot-toast';

const CATEGORY_ICONS = {
  preço:        '💰',
  tempo:        '⏰',
  autoridade:   '👔',
  urgência:     '🚀',
  confiança:    '🤝',
  concorrência: '⚔️',
  produto:      '📦',
  objeção:      '🛡️',
  geral:        '💬',
};

export default function BattleCardsPanel({ onInsert, onClose }) {
  const [cards, setCards]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter]         = useState('');
  const [activeCat, setActiveCat]   = useState('');
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filter)    params.q        = filter;
      if (activeCat) params.category = activeCat;
      const data = await api.get('/crm/battle-cards', { params });
      setCards(data.cards || []);
      setCategories(data.categories || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filter, activeCat]);

  useEffect(() => { load(); }, [load]);

  const handleUse = async (card) => {
    try { await api.post(`/crm/battle-cards/${card.id}/use`); } catch {}
    if (onInsert) {
      onInsert(card.response);
      toast.success('Resposta inserida!', { duration: 1500 });
    } else {
      navigator.clipboard?.writeText(card.response);
      toast.success('Copiado!', { duration: 1500 });
    }
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, uses_count: (c.uses_count || 0) + 1 } : c));
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">⚔️ Battle Cards</h3>
          <p className="text-[11px] text-zinc-500">Respostas para objeções</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">×</button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pt-3 shrink-0">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Buscar objeção…"
          className="w-full text-xs px-3 py-1.5 rounded-lg outline-none"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 px-3 py-2 flex-wrap shrink-0">
          <button
            onClick={() => setActiveCat('')}
            className="text-[11px] px-2 py-0.5 rounded-full transition-colors"
            style={{
              background: !activeCat ? 'var(--gold-500)' : 'var(--bg-surface-2)',
              color: !activeCat ? '#000' : 'var(--text-secondary)',
            }}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat === activeCat ? '' : cat)}
              className="text-[11px] px-2 py-0.5 rounded-full transition-colors"
              style={{
                background: activeCat === cat ? 'var(--gold-500)' : 'var(--bg-surface-2)',
                color: activeCat === cat ? '#000' : 'var(--text-secondary)',
              }}
            >
              {CATEGORY_ICONS[cat] || '•'} {cat}
            </button>
          ))}
        </div>
      )}

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
          ))
        ) : cards.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">Nenhum card encontrado</div>
        ) : (
          cards.map(card => (
            <div
              key={card.id}
              className="rounded-lg border cursor-pointer transition-colors"
              style={{
                background: expanded === card.id ? 'var(--bg-surface)' : 'var(--bg-surface-2)',
                borderColor: expanded === card.id ? 'var(--gold-500)' : 'var(--border-default)',
              }}
            >
              {/* Collapsed header */}
              <div
                className="flex items-center gap-2 px-3 py-2.5"
                onClick={() => setExpanded(expanded === card.id ? null : card.id)}
              >
                <span className="text-base shrink-0">{CATEGORY_ICONS[card.category] || '🛡️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{card.objection}</p>
                  <p className="text-[11px] text-zinc-500">{card.category}</p>
                </div>
                <span className="text-zinc-600 text-xs">{expanded === card.id ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {expanded === card.id && (
                <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                  <p className="text-xs text-zinc-300 leading-relaxed pt-2">{card.response}</p>
                  {card.tips && (
                    <p className="text-[11px] text-amber-400/80 italic">💡 {card.tips}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleUse(card)}
                      className="flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors"
                      style={{ background: 'var(--gold-500)', color: '#000' }}
                    >
                      {onInsert ? '→ Usar no chat' : '📋 Copiar'}
                    </button>
                    {card.uses_count > 0 && (
                      <span className="text-[11px] text-zinc-500">{card.uses_count}× usado</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
