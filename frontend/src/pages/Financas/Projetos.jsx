import { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const TYPE_LABELS = { event: '🎪 Evento', project: '📁 Projeto', campaign: '📢 Campanha' };
const STATUS_LABELS = {
  planning: { label: 'Planejamento', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-700/30' },
  active:   { label: 'Ativo',        color: 'text-green-400',  bg: 'bg-green-500/10 border-green-700/30' },
  closed:   { label: 'Encerrado',    color: 'text-gray-400',   bg: 'bg-gray-700/30 border-gray-700/40' },
};

const EMPTY_FORM = {
  entity_id: '', name: '', type: 'event', start_date: '', end_date: '',
  budget: '', description: '', status: 'active',
};

export default function Projetos() {
  const { entity } = useEntity();

  const [projects, setProjects]   = useState([]);
  const [entities, setEntities]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [modal, setModal]         = useState(false);
  const [selected, setSelected]   = useState(null); // projeto aberto para P&L
  const [plData, setPlData]       = useState(null);
  const [plLoading, setPlLoading] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [filterStatus, setFilterStatus] = useState('active');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entity)       params.set('entity_id', entity.id);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const data = await api.get(`/finance/projects?${params}`);
      setProjects(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar projetos'); }
    finally { setLoading(false); }
  };

  const loadPL = async (id) => {
    setPlLoading(true);
    try {
      const data = await api.get(`/finance/projects/${id}/pl`);
      setPlData(data);
    } catch { toast.error('Erro ao carregar P&L'); }
    finally { setPlLoading(false); }
  };

  const loadMeta = async () => {
    const ents = await api.get('/finance/entities').catch(() => []);
    setEntities(Array.isArray(ents) ? ents : []);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [entity, filterStatus]);

  const openDetail = (proj) => {
    setSelected(proj);
    setPlData(null);
    loadPL(proj.id);
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, entity_id: entity?.id || '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name)      return toast.error('Nome obrigatório');
    if (!form.entity_id && !entity) return toast.error('Selecione a entidade');
    setSaving(true);
    try {
      await api.post('/finance/projects', {
        ...form,
        entity_id: form.entity_id || entity?.id,
        budget: form.budget ? Number(form.budget) : 0,
      });
      toast.success('Projeto criado!');
      setModal(false);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const closeProject = async (id) => {
    if (!confirm('Encerrar este projeto?')) return;
    try {
      await api.delete(`/finance/projects/${id}`);
      toast.success('Projeto encerrado');
      load();
      if (selected?.id === id) setSelected(null);
    } catch { toast.error('Erro ao encerrar'); }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Projetos & Eventos</h1>
          <p className="text-sm text-gray-400 mt-1">
            P&L por evento ou projeto
            {entity ? ` · ${entity.icon || '💰'} ${entity.name}` : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
        >
          + Novo Projeto
        </button>
      </div>

      {/* Filtro status */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: 'active',   label: '✅ Ativos' },
          { key: 'planning', label: '📋 Planejamento' },
          { key: 'closed',   label: '📦 Encerrados' },
          { key: 'all',      label: 'Todos' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              filterStatus === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de projetos */}
        <div>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🎪</p>
              <p>Nenhum projeto encontrado</p>
              <button onClick={openCreate} className="mt-4 text-blue-400 text-sm underline">
                Criar primeiro projeto
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map(proj => {
                const st = STATUS_LABELS[proj.status] || STATUS_LABELS.active;
                const resultColor = proj.result >= 0 ? 'text-green-400' : 'text-red-400';
                const isSelected = selected?.id === proj.id;
                return (
                  <div
                    key={proj.id}
                    onClick={() => openDetail(proj)}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600/60 bg-blue-900/10'
                        : 'border-gray-700/40 bg-gray-900 hover:border-gray-600/60 hover:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs text-gray-500">{TYPE_LABELS[proj.type] || proj.type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${st.bg} ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <p className="text-white font-semibold">{proj.name}</p>
                        {proj.entity_name && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {proj.entity_icon} {proj.entity_name}
                          </p>
                        )}
                        {(proj.start_date || proj.end_date) && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            📅 {proj.start_date ? new Date(proj.start_date + 'T12:00:00').toLocaleDateString('pt-BR') : '?'}
                            {proj.end_date ? ` → ${new Date(proj.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-lg font-bold ${resultColor}`}>{fmt(proj.result)}</p>
                        {proj.margin !== null && (
                          <p className={`text-xs ${resultColor}`}>margem {proj.margin}%</p>
                        )}
                        {proj.budget > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            orç. {fmt(proj.budget)}
                            {proj.budget_used !== null ? ` (${proj.budget_used}% usado)` : ''}
                          </p>
                        )}
                        <p className="text-xs text-gray-600">{proj.tx_count} tx</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Painel P&L */}
        <div>
          {!selected ? (
            <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-8 text-center text-gray-500">
              <p className="text-3xl mb-3">📊</p>
              <p>Clique em um projeto para ver o P&L</p>
            </div>
          ) : plLoading ? (
            <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-8 text-center text-gray-500">
              Carregando P&L...
            </div>
          ) : plData ? (
            <div className="bg-gray-900 border border-gray-700/40 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg">{selected.name}</h3>
                  <p className="text-xs text-gray-500">{TYPE_LABELS[selected.type] || selected.type}</p>
                </div>
                <div className="flex gap-2 items-center">
                  {selected.status !== 'closed' && (
                    <button
                      onClick={() => closeProject(selected.id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-2.5 rounded-lg border border-gray-700 hover:border-red-700/40 min-h-[44px] flex items-center"
                    >
                      Encerrar
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="text-gray-500 hover:text-white text-xl min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* P&L resumo — 1 coluna em mobile, 3 em sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Receitas</p>
                  <p className="text-green-400 font-bold">{fmt(plData.totals.total_income)}</p>
                </div>
                <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Despesas</p>
                  <p className="text-red-400 font-bold">{fmt(plData.totals.total_expense)}</p>
                </div>
                <div className={`border rounded-xl p-3 text-center ${
                  plData.totals.result >= 0
                    ? 'bg-blue-900/20 border-blue-800/30'
                    : 'bg-orange-900/20 border-orange-800/30'
                }`}>
                  <p className="text-xs text-gray-400 mb-1">Resultado</p>
                  <p className={`font-bold ${plData.totals.result >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                    {fmt(plData.totals.result)}
                  </p>
                </div>
              </div>

              {plData.totals.margin !== null && (
                <div className="flex items-center gap-4 mb-4 text-sm flex-wrap">
                  <span className="text-gray-400">Margem:</span>
                  <span className={`font-bold ${plData.totals.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {plData.totals.margin}%
                  </span>
                  {plData.totals.budget_used !== null && (
                    <>
                      <span className="text-gray-400">Orçamento usado:</span>
                      <span className={`font-bold ${plData.totals.budget_used > 100 ? 'text-red-400' : 'text-gray-300'}`}>
                        {plData.totals.budget_used}%
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Gastos por categoria */}
              {plData.by_category.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-400 mb-2">Por categoria:</p>
                  <div className="space-y-1.5">
                    {plData.by_category.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">{c.icon || '•'} {c.name || 'Sem categoria'}</span>
                        <span className={c.type === 'income' ? 'text-green-400' : 'text-red-400'}>
                          {c.type === 'income' ? '+' : '-'}{fmt(c.total)}
                          <span className="text-gray-500 text-xs ml-1">({c.count}x)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Últimas transações */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2">
                  Transações ({plData.transactions.length})
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {plData.transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{tx.type === 'income' ? '💚' : '🔴'}</span>
                        <span className="text-gray-300 truncate">{tx.description}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-500">{tx.date}</span>
                        <span className={`font-medium ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {plData.transactions.length === 0 && (
                    <p className="text-gray-500 text-center py-3">Nenhuma transação vinculada</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal novo projeto — bottom sheet em mobile */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-white">Novo Projeto / Evento</h2>
              <button
                onClick={() => setModal(false)}
                className="text-gray-400 hover:text-white text-xl min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Tipo — 3 colunas sempre (labels curtos) */}
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setForm(f => ({ ...f, type: value }))}
                    className={`py-3 rounded-lg text-sm border transition-colors min-h-[44px] ${
                      form.type === value
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Nome *</label>
                <input
                  type="text"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                  placeholder="Ex: Réveillon 2025, Campanha Verão..."
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Data início</label>
                  <input
                    type="date"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Data fim</label>
                  <input
                    type="date"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Orçamento (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    placeholder="0,00"
                    value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  />
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

              <div>
                <label className="block text-xs text-gray-400 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base resize-none"
                  placeholder="Descrição opcional..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm transition-colors min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px]"
              >
                {saving ? 'Salvando…' : 'Criar Projeto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
