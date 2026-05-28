import { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const today = () => new Date().toISOString().split('T')[0];

function statusInfo(item) {
  if (item.paid_date) return { label: 'Paga', color: 'text-green-400', bg: 'bg-green-500/10 border-green-700/30' };
  const now = today();
  if (item.due_date < now) return { label: 'Vencida', color: 'text-red-400', bg: 'bg-red-500/10 border-red-700/30' };
  if (item.due_date === now) return { label: 'Vence hoje', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-700/30' };
  return { label: 'Pendente', color: 'text-gray-400', bg: 'bg-gray-800 border-gray-700/40' };
}

const EMPTY_FORM = {
  type: 'payable', entity_id: '', amount: '', description: '',
  counterpart: '', category_id: '', due_date: today(), notes: '',
  installment_total: 1, installment_current: 1,
};

export default function ContasPagar() {
  const { entity } = useEntity();

  const [tab, setTab]               = useState('pending');  // pending | paid
  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [entities, setEntities]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [modal, setModal]           = useState(false);
  const [payModal, setPayModal]     = useState(null);  // item a marcar como pago
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [filterType, setFilterType] = useState('all'); // all | payable | receivable

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entity) params.set('entity_id', entity.id);
      if (tab === 'pending') params.set('status', 'pending');
      if (tab === 'overdue') params.set('status', 'overdue');
      if (tab === 'paid')    params.set('status', 'paid');
      if (filterType !== 'all') params.set('type', filterType);
      const data = await api.get(`/finance/payables?${params}`);
      setItems(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar contas'); }
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
  useEffect(() => { load(); }, [tab, entity, filterType]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, entity_id: entity?.id || '', due_date: today() });
    setModal(true);
  };

  const save = async () => {
    if (!form.description) return toast.error('Descrição obrigatória');
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Valor inválido');
    if (!form.due_date) return toast.error('Data de vencimento obrigatória');
    if (!form.entity_id && !entity) return toast.error('Selecione a entidade');
    setSaving(true);
    try {
      const payload = {
        ...form,
        entity_id: form.entity_id || entity?.id,
        amount: Number(form.amount),
        category_id: form.category_id || null,
      };
      await api.post('/finance/payables', payload);
      toast.success('Conta cadastrada!');
      setModal(false);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const markPaid = async (item) => {
    try {
      await api.post(`/finance/payables/${item.id}/pay`, { paid_date: today() });
      toast.success(`${item.type === 'payable' ? 'Pagamento' : 'Recebimento'} registrado!`);
      setPayModal(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
  };

  const deleteItem = async (id) => {
    if (!confirm('Excluir esta conta?')) return;
    try {
      await api.delete(`/finance/payables/${id}`);
      toast.success('Conta excluída');
      load();
    } catch { toast.error('Erro ao excluir'); }
  };

  // Agrupamento para exibição
  const overdue  = items.filter(i => !i.paid_date && i.due_date < today());
  const dueToday = items.filter(i => !i.paid_date && i.due_date === today());
  const pending  = items.filter(i => !i.paid_date && i.due_date > today());
  const paid     = items.filter(i => !!i.paid_date);

  const groups = tab === 'paid'
    ? [{ label: 'Pagas', items: paid, accent: 'text-green-400' }]
    : [
        { label: '⚠️ Vencidas', items: overdue,  accent: 'text-red-400'    },
        { label: '⏰ Vencem hoje', items: dueToday, accent: 'text-yellow-400' },
        { label: '📋 Pendentes', items: pending,  accent: 'text-gray-300'   },
      ];

  // Totais
  const totalPagar    = items.filter(i => i.type === 'payable'    && !i.paid_date).reduce((s, i) => s + i.amount, 0);
  const totalReceber  = items.filter(i => i.type === 'receivable' && !i.paid_date).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contas a Pagar/Receber</h1>
          <p className="text-sm text-gray-400 mt-1">
            {entity ? `📍 ${entity.icon || '💰'} ${entity.name}` : 'Todas as entidades'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 min-h-[44px]"
        >
          <span>+</span> Nova Conta
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 border border-red-900/30 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total a Pagar (em aberto)</p>
          <p className="text-xl font-bold text-red-400">{fmt(totalPagar)}</p>
        </div>
        <div className="bg-gray-900 border border-green-900/30 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total a Receber (em aberto)</p>
          <p className="text-xl font-bold text-green-400">{fmt(totalReceber)}</p>
        </div>
      </div>

      {/* Tabs + filtro */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex gap-2">
          {[
            { key: 'pending', label: '📋 Em aberto' },
            { key: 'paid',    label: '✅ Pagas'      },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-base rounded-lg px-3 py-2.5 min-h-[44px]"
        >
          <option value="all">Todos</option>
          <option value="payable">Só A Pagar</option>
          <option value="receivable">Só A Receber</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ label, items: groupItems, accent }) => {
            if (groupItems.length === 0) return null;
            return (
              <div key={label}>
                <h3 className={`text-sm font-semibold ${accent} mb-3`}>{label} ({groupItems.length})</h3>
                <div className="space-y-2">
                  {groupItems.map(item => {
                    const st = statusInfo(item);
                    const isPayable = item.type === 'payable';
                    return (
                      <div key={item.id} className={`border rounded-xl p-4 ${st.bg}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                isPayable ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                              }`}>
                                {isPayable ? '🔴 PAGAR' : '💚 RECEBER'}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${st.bg} ${st.color}`}>
                                {st.label}
                              </span>
                            </div>
                            <p className="text-white font-semibold mt-1.5">{item.description}</p>
                            {item.counterpart && (
                              <p className="text-xs text-gray-400 mt-0.5">👤 {item.counterpart}</p>
                            )}
                            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                              <span className={`text-lg font-bold ${isPayable ? 'text-red-400' : 'text-green-400'}`}>
                                {fmt(item.amount)}
                              </span>
                              <span className="text-xs text-gray-500">
                                📅 Vence: {new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                              {item.paid_date && (
                                <span className="text-xs text-green-500">
                                  ✅ Pago em {new Date(item.paid_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              )}
                              {item.category_name && (
                                <span className="text-xs text-gray-500">
                                  {item.category_icon} {item.category_name}
                                </span>
                              )}
                            </div>
                            {item.notes && <p className="text-xs text-gray-500 mt-1 italic">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!item.paid_date && (
                              <button
                                onClick={() => setPayModal(item)}
                                className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-2.5 rounded-lg transition-colors font-medium min-h-[44px]"
                              >
                                {isPayable ? 'Marcar Pago' : 'Marcar Recebido'}
                              </button>
                            )}
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="text-gray-500 hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg"
                              title="Excluir"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {groups.every(g => g.items.length === 0) && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">📋</p>
              <p>Nenhuma conta encontrada</p>
              <button onClick={openCreate} className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline">
                Cadastrar primeira conta
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal nova conta — bottom sheet mobile */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-5 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-white">Nova Conta</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center text-xl">×</button>
            </div>

            <div className="space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'payable',    label: '🔴 A Pagar' },
                  { value: 'receivable', label: '💚 A Receber' },
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
                  <label className="block text-xs text-gray-400 mb-1">Vencimento *</label>
                  <input
                    type="date"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Descrição *</label>
                <input
                  type="text"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                  placeholder="Ex: Aluguel, Fornecedor X, Mensalidade..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {form.type === 'payable' ? 'Fornecedor/Credor' : 'Cliente/Devedor'}
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base min-h-[44px]"
                  placeholder="Nome opcional..."
                  value={form.counterpart}
                  onChange={e => setForm(f => ({ ...f, counterpart: e.target.value }))}
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

              <div>
                <label className="block text-xs text-gray-400 mb-1">Observações</label>
                <textarea
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-base resize-none"
                  placeholder="Observações opcionais..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
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
                {saving ? 'Salvando…' : 'Salvar Conta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar pagamento — bottom sheet mobile */}
      {payModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">{payModal.type === 'payable' ? '💸' : '💰'}</p>
            <h3 className="text-white font-bold text-lg mb-2">{payModal.description}</h3>
            <p className="text-gray-400 text-sm mb-1">{fmt(payModal.amount)}</p>
            <p className="text-gray-500 text-xs mb-5">
              {payModal.type === 'payable' ? 'Confirmar pagamento?' : 'Confirmar recebimento?'}
              {' '}Uma transação será registrada automaticamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPayModal(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm transition-colors min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={() => markPaid(payModal)}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px]"
              >
                {payModal.type === 'payable' ? '✅ Marcar Pago' : '✅ Marcar Recebido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
