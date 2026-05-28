import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Transacoes() {
  const { entity } = useEntity();

  const EMPTY_FORM = {
    entity_id: entity?.id || '',
    type: 'expense',
    amount: '',
    description: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    project_id: '',
  };

  const [txs, setTxs]               = useState([]);
  const [total, setTotal]           = useState(0);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects]     = useState([]);
  const [filters, setFilters]       = useState({ type: '', category_id: '', start: '', end: '', page: 1, limit: 30 });
  const [modal, setModal]           = useState(false);
  const [editTx, setEditTx]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [uploadTx, setUploadTx]     = useState(null);
  const [uploading, setUploading]   = useState(false);

  const load = useCallback(async () => {
    if (!entity) return;
    try {
      const params = new URLSearchParams({ entity_id: entity.id });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      const r = await api.get(`/finance/transactions?${params}`);
      setTxs(Array.isArray(r.data) ? r.data : []);
      setTotal(r.total || 0);
    } catch { toast.error('Erro ao carregar transações'); }
  }, [filters, entity]);

  const loadMeta = async () => {
    const [cats, projs] = await Promise.all([
      api.get('/finance/categories').catch(() => []),
      api.get('/finance/projects').catch(() => ({ data: [] })),
    ]);
    setCategories(Array.isArray(cats) ? cats : []);
    setProjects(Array.isArray(projs?.data) ? projs.data : []);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTx(null);
    setForm({ ...EMPTY_FORM, entity_id: entity?.id || '' });
    setModal(true);
  };
  const openEdit = (tx) => {
    setEditTx(tx);
    setForm({
      entity_id: tx.entity_id,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      category_id: tx.category_id || '',
      date: tx.date,
      project_id: tx.project_id || '',
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Valor inválido');
    setSaving(true);
    try {
      const payload = {
        ...form,
        entity_id: entity.id,
        project_id: form.project_id || null,
        category_id: form.category_id || null,
      };
      if (editTx) {
        await api.put(`/finance/transactions/${editTx.id}`, payload);
        toast.success('Atualizada!');
      } else {
        await api.post('/finance/transactions', payload);
        toast.success('Registrada!');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro');
    } finally { setSaving(false); }
  };

  const remove = async (tx) => {
    if (!window.confirm('Excluir transação?')) return;
    try {
      await api.delete(`/finance/transactions/${tx.id}`);
      toast.success('Excluída');
      load();
    } catch { toast.error('Erro ao excluir'); }
  };

  const uploadReceipt = async (txId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      await api.post(`/finance/transactions/${txId}/receipt`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Comprovante anexado!');
      setUploadTx(null);
      load();
    } catch { toast.error('Erro ao enviar comprovante'); }
    finally { setUploading(false); }
  };

  const filtCats = categories.filter((c) =>
    form.type === 'income' ? c.type !== 'expense' : c.type !== 'income'
  );

  const hasFilters = filters.type || filters.category_id || filters.start || filters.end;

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          {entity && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: entity.color + '22', color: entity.color, border: `1px solid ${entity.color}44` }}
              >
                {entity.icon} {entity.name}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">Transações</h1>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px]">
          + Adicionar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-wrap gap-3">
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
          className="bg-gray-700 text-white rounded-lg px-3 py-2 text-base border border-gray-600 min-h-[44px]">
          <option value="">Todos os tipos</option>
          <option value="income">Entradas</option>
          <option value="expense">Saídas</option>
        </select>
        <select value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value, page: 1 })}
          className="bg-gray-700 text-white rounded-lg px-3 py-2 text-base border border-gray-600 min-h-[44px]">
          <option value="">Todas categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value, page: 1 })}
          className="bg-gray-700 text-white rounded-lg px-3 py-2 text-base border border-gray-600 min-h-[44px]" />
        <input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value, page: 1 })}
          className="bg-gray-700 text-white rounded-lg px-3 py-2 text-base border border-gray-600 min-h-[44px]" />
        {hasFilters && (
          <button onClick={() => setFilters({ type: '', category_id: '', start: '', end: '', page: 1, limit: 30 })}
            className="text-gray-400 hover:text-white text-sm px-2 min-h-[44px]">Limpar</button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {txs.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-2">📋</p>
            <p>Nenhuma transação encontrada.</p>
          </div>
        ) : (
          <>
            {/* ── Mobile: cards ── */}
            <div className="md:hidden divide-y divide-gray-700/50">
              {txs.map((tx) => (
                <div key={tx.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-lg shrink-0">{tx.type === 'income' ? '✅' : '🔴'}</span>
                      <p className="text-white text-sm font-medium truncate">{tx.description || '—'}</p>
                    </div>
                    <span className={`font-bold text-sm shrink-0 ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2 ml-7">
                    <span className="text-gray-500 text-xs">{tx.date}</span>
                    {tx.category_name && (
                      <span className="text-gray-400 text-xs">· {tx.category_icon} {tx.category_name}</span>
                    )}
                    {tx.project_name && (
                      <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40 rounded px-1.5 py-0.5">
                        🎪 {tx.project_name}
                      </span>
                    )}
                    {tx.source === 'whatsapp' && (
                      <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 rounded px-1.5 py-0.5">WA</span>
                    )}
                  </div>
                  <div className="flex gap-1 ml-7">
                    {tx.receipt_path ? (
                      <a href={`http://localhost:3001${tx.receipt_path}`} target="_blank" rel="noreferrer"
                         className="text-blue-400 hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-700/50" title="Ver comprovante">🧾</a>
                    ) : (
                      <button onClick={() => setUploadTx(tx)}
                        className="text-gray-500 hover:text-gray-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-700/50" title="Anexar comprovante">📎</button>
                    )}
                    <button onClick={() => openEdit(tx)}
                      className="text-blue-400 hover:text-blue-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-700/50">✏️</button>
                    <button onClick={() => remove(tx)}
                      className="text-red-400 hover:text-red-300 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-700/50">🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: tabela ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr className="text-gray-400">
                    <th className="text-left px-4 py-3">Data</th>
                    <th className="text-left px-4 py-3">Descrição</th>
                    <th className="text-left px-4 py-3">Categoria</th>
                    <th className="text-left px-4 py-3">Projeto</th>
                    <th className="text-left px-4 py-3">Origem</th>
                    <th className="text-right px-4 py-3">Valor</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{tx.date}</td>
                      <td className="px-4 py-3 text-white max-w-xs truncate">
                        {tx.type === 'income' ? '✅' : '🔴'} {tx.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {tx.category_name ? `${tx.category_icon} ${tx.category_name}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {tx.project_name ? (
                          <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40 rounded px-1.5 py-0.5">
                            🎪 {tx.project_name}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {tx.source === 'whatsapp' ? (
                          <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 rounded px-1.5 py-0.5">WA</span>
                        ) : (
                          <span className="text-xs bg-gray-700 text-gray-400 rounded px-1.5 py-0.5">Manual</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {tx.receipt_path ? (
                            <a href={`http://localhost:3001${tx.receipt_path}`} target="_blank" rel="noreferrer"
                               className="text-blue-400 hover:text-blue-300 p-2 rounded hover:bg-gray-700/50" title="Ver comprovante">🧾</a>
                          ) : (
                            <button onClick={() => setUploadTx(tx)} className="text-gray-500 hover:text-gray-300 p-2 rounded hover:bg-gray-700/50" title="Anexar comprovante">📎</button>
                          )}
                          <button onClick={() => openEdit(tx)} className="text-blue-400 hover:text-blue-300 p-2 rounded hover:bg-gray-700/50">✏️</button>
                          <button onClick={() => remove(tx)} className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-gray-700/50">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
              <span>{total} transação(ões)</span>
              <div className="flex gap-2">
                <button disabled={filters.page === 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                  className="px-3 py-1.5 bg-gray-700 rounded disabled:opacity-40 min-h-[36px]">Anterior</button>
                <span className="px-2 py-1.5">Pág {filters.page}</span>
                <button disabled={filters.page * filters.limit >= total}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                  className="px-3 py-1.5 bg-gray-700 rounded disabled:opacity-40 min-h-[36px]">Próxima</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal criar/editar — bottom sheet mobile */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-gray-800 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-md border border-gray-700 max-h-[90dvh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-1">{editTx ? 'Editar Transação' : 'Nova Transação'}</h2>
            {entity && (
              <p className="text-sm mb-4" style={{ color: entity.color }}>{entity.icon} {entity.name}</p>
            )}
            <div className="space-y-4">
              <div className="flex gap-3">
                <button
                  onClick={() => setForm({ ...form, type: 'income' })}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium border min-h-[44px] ${form.type === 'income' ? 'bg-green-700 border-green-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                >✅ Entrada</button>
                <button
                  onClick={() => setForm({ ...form, type: 'expense' })}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium border min-h-[44px] ${form.type === 'expense' ? 'bg-red-800 border-red-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                >🔴 Saída</button>
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" min="0" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 text-base" />
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Descrição</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ex: Aluguel, Venda..."
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 text-base" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-300 text-sm block mb-1">Categoria</label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 text-base min-h-[44px]">
                    <option value="">Sem categoria</option>
                    {filtCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-300 text-sm block mb-1">Data</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 text-base min-h-[44px]" />
                </div>
              </div>
              {projects.length > 0 && (
                <div>
                  <label className="text-gray-300 text-sm block mb-1">Vincular a Projeto <span className="text-gray-500">(opcional)</span></label>
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 text-base min-h-[44px]">
                    <option value="">Nenhum projeto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.type === 'event' ? '🎪' : p.type === 'campaign' ? '📣' : '📁'} {p.name}
                        {p.entity_name ? ` · ${p.entity_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 bg-gray-700 text-white py-3 rounded-lg text-sm min-h-[44px]">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-medium min-h-[44px]">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal upload comprovante — bottom sheet mobile */}
      {uploadTx && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-gray-800 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-sm border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-3">Anexar Comprovante</h2>
            <p className="text-gray-400 text-sm mb-4">
              Transação: <strong className="text-white">{uploadTx.description}</strong> — {fmt(uploadTx.amount)}
            </p>
            <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp"
              onChange={(e) => { if (e.target.files[0]) uploadReceipt(uploadTx.id, e.target.files[0]); }}
              className="w-full text-base text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer" />
            {uploading && <p className="text-blue-400 text-sm mt-2">Enviando...</p>}
            <button onClick={() => setUploadTx(null)} className="mt-4 w-full bg-gray-700 text-white py-3 rounded-lg text-sm min-h-[44px]">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
