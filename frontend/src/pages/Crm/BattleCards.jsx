import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const CATEGORY_ICONS = {
  preço: '💰', tempo: '⏰', autoridade: '👔', urgência: '🚀',
  confiança: '🤝', concorrência: '⚔️', produto: '📦', objeção: '🛡️', geral: '💬',
};
const DEFAULT_CATEGORIES = Object.keys(CATEGORY_ICONS);

function CardRow({ card, onEdit, onDelete, isSystem }) {
  const icon = CATEGORY_ICONS[card.category] || '🛡️';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{card.category}</span>
            {isSystem && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">template</span>
            )}
            {card.uses_count > 0 && (
              <span className="text-xs text-zinc-600">{card.uses_count}× usado</span>
            )}
          </div>
          <p className="text-sm font-medium text-white mb-1">{card.objection}</p>
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{card.response}</p>
          {card.tips && <p className="text-[11px] text-amber-400/70 mt-1">💡 {card.tips}</p>}
        </div>
        {!isSystem && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(card)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
              title="Editar"
            >✏️</button>
            <button
              onClick={() => onDelete(card.id)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Excluir"
            >🗑️</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardModal({ card, onClose, onSave }) {
  const [form, setForm] = useState(card || { category: 'objeção', objection: '', response: '', tips: '' });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.objection.trim() || !form.response.trim()) {
      return toast.error('Objeção e resposta são obrigatórios');
    }
    setSaving(true);
    try {
      const result = card?.id
        ? await api.put(`/crm/battle-cards/${card.id}`, form)
        : await api.post('/crm/battle-cards', form);
      onSave(result);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{card?.id ? 'Editar Battle Card' : 'Novo Battle Card'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Categoria</label>
          <select
            value={form.category}
            onChange={e => set('category', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
          >
            {DEFAULT_CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
            ))}
            <option value="geral">💬 geral</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Objeção do cliente *</label>
          <input
            value={form.objection}
            onChange={e => set('objection', e.target.value)}
            placeholder='Ex: "Tá muito caro"'
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Sua resposta *</label>
          <textarea
            value={form.response}
            onChange={e => set('response', e.target.value)}
            rows={4}
            placeholder="Como você responde a essa objeção..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Dica de uso (opcional)</label>
          <input
            value={form.tips || ''}
            onChange={e => set('tips', e.target.value)}
            placeholder="Ex: Pergunte antes de dar desconto"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black disabled:opacity-50"
            style={{ background: 'var(--gold-500, #D4AF37)' }}
          >
            {saving ? 'Salvando…' : card?.id ? 'Salvar alterações' : 'Criar card'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-zinc-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BattleCards() {
  const [cards, setCards]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [activeCat, setActiveCat] = useState('');
  const [modal, setModal]         = useState(null); // null | {} | card object

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)    params.q        = search;
      if (activeCat) params.category = activeCat;
      const data = await api.get('/crm/battle-cards', { params });
      setCards(data.cards || []);
      setCategories(data.categories || []);
    } catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  }, [search, activeCat]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Excluir este battle card?')) return;
    try {
      await api.delete(`/crm/battle-cards/${id}`);
      setCards(prev => prev.filter(c => c.id !== id));
      toast.success('Card excluído');
    } catch { toast.error('Erro ao excluir'); }
  };

  const handleSaved = (saved) => {
    setCards(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    load(); // reload categories
  };

  const userCards   = cards.filter(c => !c.is_system);
  const systemCards = cards.filter(c => c.is_system);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">⚔️ Battle Cards</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Respostas prontas para objeções. Acesse durante conversas no Inbox com o botão ⚔️.
          </p>
        </div>
        <button
          onClick={() => setModal({})}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-black"
          style={{ background: 'var(--gold-500, #D4AF37)' }}
        >
          + Novo card
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar objeção ou resposta…"
          className="flex-1 min-w-40 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
        />
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCat('')}
            className="text-xs px-3 py-1 rounded-full transition-colors"
            style={{
              background: !activeCat ? 'var(--gold-500)' : 'var(--bg-surface-2, #1f1f1f)',
              color: !activeCat ? '#000' : '#a1a1aa',
            }}
          >
            Todos ({cards.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat === activeCat ? '' : cat)}
              className="text-xs px-3 py-1 rounded-full transition-colors"
              style={{
                background: activeCat === cat ? 'var(--gold-500)' : 'var(--bg-surface-2, #1f1f1f)',
                color: activeCat === cat ? '#000' : '#a1a1aa',
              }}
            >
              {CATEGORY_ICONS[cat] || '•'} {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: '#1f1f1f' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* User's custom cards */}
          {userCards.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Meus cards ({userCards.length})
              </h2>
              <div className="space-y-3">
                {userCards.map(c => (
                  <CardRow
                    key={c.id} card={c} isSystem={false}
                    onEdit={c => setModal(c)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* System templates */}
          {systemCards.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Templates do sistema ({systemCards.length})
              </h2>
              <div className="space-y-3">
                {systemCards.map(c => (
                  <CardRow
                    key={c.id} card={c} isSystem={true}
                    onEdit={() => {}} onDelete={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {cards.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <div className="text-4xl mb-3">⚔️</div>
              <p className="text-sm font-medium text-white">Nenhum battle card encontrado</p>
              <p className="text-xs mt-1">Crie um novo card para ter respostas prontas durante conversas.</p>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <CardModal
          card={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
