import { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const FREQ_LABELS = {
  monthly: 'Mensal',
  weekly:  'Semanal',
  yearly:  'Anual',
};

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function freqDesc(r) {
  if (r.frequency === 'monthly')  return `Todo dia ${r.day_of_month}`;
  if (r.frequency === 'weekly')   return `Toda ${DAY_NAMES[r.day_of_week] || '?'}`;
  if (r.frequency === 'yearly')   return `Anual (${r.start_date?.slice(5) || '??'})`;
  return r.frequency;
}

const EMPTY_FORM = {
  type: 'expense', entity_id: '', amount: '', description: '',
  category_id: '', frequency: 'monthly', day_of_month: 1,
  day_of_week: 1, start_date: new Date().toISOString().split('T')[0], end_date: '',
};

export default function Recorrencias() {
  const { entity } = useEntity();

  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [entities, setEntities]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [modal, setModal]           = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entity) params.set('entity_id', entity.id);
      const data = await api.get(`/finance/recurring?${params}`);
      setItems(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar recorrências'); }
    finally { setLoading(false); }
  };

  const loadMeta = async () => {
    const [cats, ents] = await Promise.all([
      api.get('/finance/categories').catch(() => []),
      api.get('/finance/entities').catch(() => []),
    ]);
    setCategories(Array.isArray(cats) ? cats : []);
    setEntities(Array.isArray(ents) ? ents : []);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [entity]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, entity_id: entity?.id || '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.description)  return toast.error('Descrição obrigatória');
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Valor inválido');
    if (!form.start_date)   return toast.error('Data de início obrigatória');
    setSaving(true);
    try {
      const payload = {
        ...form,
        entity_id:   form.entity_id || entity?.id,
        amount:      Number(form.amount),
        category_id: form.category_id || null,
        end_date:    form.end_date || null,
        day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : null,
        day_of_week:  form.frequency === 'weekly'  ? Number(form.day_of_week)  : null,
      };
      await api.post('/finance/recurring', payload);
      toast.success('Recorrência criada!');
      setModal(false);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (item) => {
    try {
      await api.put(`/finance/recurring/${item.id}`, { active: !item.active });
      toast.success(item.active ? 'Recorrência pausada' : 'Recorrência ativada');
      load();
    } catch { toast.error('Erro ao atualizar'); }
  };

  const deleteItem = async (id) => {
    if (!confirm('Desativar esta recorrência?')) return;
    try {
      await api.delete(`/finance/recurring/${id}`);
      toast.success('Recorrência desativada');
      load();
    } catch { toast.error('Erro ao desativar'); }
  };

  const active   = items.filter(i => i.active);
  const inactive = items.filter(i => !i.active);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transações Recorrentes</h1>
          <p className="text-sm text-gray-400 mt-1">
            Geradas automaticamente todo dia às 06:00
            {entity ? ` · ${entity.icon || '💰'} ${entity.name}` : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
        >
          + Nova Recorrência
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {/* Ativas */}
          {active.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-green-400 mb-3">✅ Ativas ({active.length})</h3>
              <div className="space-y-2">
                {active.map(item => (
                  <div key={item.id} className="bg-gray-900 border border-gray-700/40 rounded-xl p-4 flex items-center gap-4">
                    <span className={`text-2xl w-10 h-10 flex items-center justify-center rounded-xl ${
                      item.type === 'income' ? 'bg-green-500/10' : 'bg-red-500/10'
                    }`}>
                      {item.type === 'income' ? '💚' : '🔴'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold">{item.description}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className={`text-sm font-bold ${item.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                          {fmt(item.amount)}
                        </span>
                        <span className="text-xs text-gray-400">🔄 {freqDesc(item)}</span>
                        {item.category_name && (
                          <span className="text-xs text-gray-500">{item.category_icon} {item.category_name}</span>
                        )}
                        {item.entity_name && (
                          <span className="text-xs text-gray-500">🏢 {item.entity_name}</span>
                        )}
                        {item.last_generated && (
                          <span className="text-xs text-gray-600">
                            Última geração: {new Date(item.last_generated + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleActive(item)}
                        className="text-xs bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 px-3 py-2.5 rounded-lg transition-colors min-h-[44px]"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inativas */}
          {inactive.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">⏸ Pausadas ({inactive.length})</h3>
              <div className="space-y-2">
                {inactive.map(item => (
                  <div key={item.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex items-center gap-4 opacity-60">
                    <span className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl bg-gray-700/30">
                      {item.type === 'income' ? '💚' : '🔴'}
                    </span>
                    <div className="flex-1">
                      <p className="text-gray-400 font-medium">{item.description}</p>
                      <p className="text-xs text-gray-600">{fmt(item.amount)} · {freqDesc(item)}</p>
                    </div>
                    <button
                      onClick={() => toggleActive(item)}
                      className="text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 px-3 py-2.5 rounded-lg transition-colors min-h-[44px]"
                    >
                      Ativar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active.length === 0 && inactive.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🔄</p>
              <p>Nenhuma recorrência cadastrada</p>
              <p className="text-sm mt-1 text-gray-600">Crie recorrências para aluguel, salários, assinaturas, etc.</p>
              <button onClick={openCreate} className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline">
                Criar primeira recorrência
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal — bottom sheet mobile */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-white">Nova Recorrência</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center text-xl">×</button>
            </div>

            <div className="space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'expense', label: '🔴 Despesa' },
                  { value: 'income',  label: '💚 Receita'  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, type: opt.value }))}
                    className={`py-3 rounded-lg text-sm font-medium border transition-colors min-h-[44px] ${
                      form.type === opt.value
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Valor *</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Frequência *</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.frequency}
                    onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  >
                    <option value="monthly">Mensal</option>
                    <option value="weekly">Semanal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
              </div>

              {/* Dia dinâmico conforme frequência */}
              {form.frequency === 'monthly' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Dia do mês *</label>
                  <input
                    type="number" min="1" max="31"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.day_of_month}
                    onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))}
                  />
                  <p className="text-xs text-gray-600 mt-1">Ex: 5 = gera no dia 5 de cada mês</p>
                </div>
              )}
              {form.frequency === 'weekly' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Dia da semana *</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.day_of_week}
                    onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}
                  >
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Descrição *</label>
                <input
                  type="text"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                  placeholder="Ex: Aluguel, Salário João, Netflix..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Categoria</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Entidade</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.entity_id}
                    onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))}
                  >
                    <option value="">Entidade atual</option>
                    {entities.map(e => (
                      <option key={e.id} value={e.id}>{e.icon} {e.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Data início *</label>
                  <input
                    type="date"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Data fim (opcional)</label>
                  <input
                    type="date"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px]"
              >
                {saving ? 'Salvando…' : 'Criar Recorrência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
