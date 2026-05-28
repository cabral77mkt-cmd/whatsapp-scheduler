import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16'];
const ICONS  = ['💰','🏠','🏢','🏭','🚗','📦','💼','🎯','🌟','🏗'];

const EMPTY = { name: '', description: '', wa_group_id: '', color: '#3B82F6', icon: '💰' };

export default function Entidades() {
  const { entity: selectedEntity } = useEntity();
  const [entities, setEntities]   = useState([]);
  const [groups, setGroups]       = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [modal, setModal]         = useState(null); // null | 'create' | entity
  const [form, setForm]           = useState(EMPTY);
  const [loading, setLoading]     = useState(false);
  const [deleting, setDeleting]   = useState(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const groupRef = useRef(null);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const grps = await api.get('/groups');
      setGroups(Array.isArray(grps) ? grps : []);
    } catch (e) { /* silencioso — WhatsApp pode não estar conectado */ }
    finally { setLoadingGroups(false); }
  };

  const load = async () => {
    try {
      const ents = await api.get('/finance/entities');
      setEntities(Array.isArray(ents) ? ents : []);
    } catch (e) { toast.error('Erro ao carregar entidades'); }
    loadGroups(); // em background, não bloqueia entidades
  };

  useEffect(() => { load(); }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => { if (groupRef.current && !groupRef.current.contains(e.target)) setGroupDropOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCreate = () => {
    setForm(EMPTY);
    setGroupSearch('');
    setGroupDropOpen(false);
    setModal('create');
    if (groups.length === 0) loadGroups();
  };

  const openEdit = (e) => {
    setForm({ name: e.name, description: e.description || '', wa_group_id: e.wa_group_id || '', color: e.color, icon: e.icon });
    setGroupDropOpen(false);
    setModal(e);
    // Sempre recarrega grupos ao abrir edição para garantir lista atualizada
    loadGroups();
  };

  // Nome do grupo selecionado (pode ser do cache ou do id salvo)
  const selectedGroupName = groups.find(g => g.id === form.wa_group_id)?.name || '';
  // Texto exibido no campo quando dropdown está fechado
  const groupDisplayValue = groupDropOpen
    ? groupSearch
    : (selectedGroupName || (form.wa_group_id && loadingGroups ? 'Carregando nome...' : groupSearch));

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const save = async () => {
    if (!form.name.trim()) return toast.error('Nome é obrigatório');
    setLoading(true);
    try {
      const payload = { ...form, wa_group_id: form.wa_group_id || null };
      if (modal === 'create') {
        await api.post('/finance/entities', payload);
        toast.success('Entidade criada!');
      } else {
        await api.put(`/finance/entities/${modal.id}`, payload);
        toast.success('Entidade atualizada!');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally { setLoading(false); }
  };

  const remove = async (e) => {
    if (!window.confirm(`Excluir "${e.name}"?`)) return;
    setDeleting(e.id);
    try {
      await api.delete(`/finance/entities/${e.id}`);
      toast.success('Excluída');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    } finally { setDeleting(null); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          {selectedEntity && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: selectedEntity.color + '22', color: selectedEntity.color, border: `1px solid ${selectedEntity.color}44` }}
              >
                {selectedEntity.icon} {selectedEntity.name}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">Entidades Financeiras</h1>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Nova Entidade
        </button>
      </div>

      <p className="text-gray-400 text-sm">
        Cada entidade (Casa, Empresa...) pode ser vinculada a um grupo do WhatsApp.
        Mensagens no formato <code className="bg-gray-700 px-1 rounded text-green-300">+500 descrição</code> ou{' '}
        <code className="bg-gray-700 px-1 rounded text-red-300">-200 descrição</code> no grupo serão registradas automaticamente.
      </p>

      {entities.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">💰</p>
          <p>Nenhuma entidade criada ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {entities.map((e) => (
            <div key={e.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-3xl flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl"
                    style={{ backgroundColor: e.color + '33', border: `2px solid ${e.color}` }}
                  >
                    {e.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{e.name}</p>
                    {e.description && <p className="text-gray-400 text-xs truncate">{e.description}</p>}
                    {e.wa_group_id ? (
                      <p className="text-green-400 text-xs mt-0.5">📱 WA vinculado</p>
                    ) : (
                      <p className="text-gray-500 text-xs mt-0.5">Sem grupo WA</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(e)} className="text-blue-400 hover:text-blue-300 p-1.5">✏️</button>
                  <button onClick={() => remove(e)} disabled={deleting === e.id} className="text-red-400 hover:text-red-300 p-1.5">🗑️</button>
                </div>
              </div>
              <div className="mt-3 flex gap-3 text-sm">
                <span className={`font-bold ${e.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Saldo: {fmt(e.balance)}
                </span>
                <span className="text-green-500 text-xs">+{fmt(e.total_income)}</span>
                <span className="text-red-500 text-xs">-{fmt(e.total_expense)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-5">
              {modal === 'create' ? 'Nova Entidade' : `Editar: ${modal.name}`}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-gray-300 text-sm block mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Casa, Empresa 1..."
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm"
                />
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Descrição</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Opcional"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm"
                />
              </div>
              <div ref={groupRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-gray-300 text-sm">Grupo do WhatsApp</label>
                  <button type="button" onClick={loadGroups} disabled={loadingGroups}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50">
                    {loadingGroups ? '⏳ Carregando...' : '🔄 Atualizar lista'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={groupDisplayValue}
                    onChange={(e) => {
                      setGroupSearch(e.target.value);
                      setGroupDropOpen(true);
                      if (!e.target.value) setForm({ ...form, wa_group_id: '' });
                    }}
                    onFocus={() => {
                      setGroupSearch('');
                      setGroupDropOpen(true);
                    }}
                    placeholder={loadingGroups ? '⏳ Carregando grupos...' : '🔍 Pesquisar grupo...'}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
                  />
                  {form.wa_group_id && (
                    <button
                      type="button"
                      onClick={() => { setForm({ ...form, wa_group_id: '' }); setGroupSearch(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none"
                    >×</button>
                  )}
                  {groupDropOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      <div
                        className="px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 cursor-pointer"
                        onMouseDown={() => { setForm({ ...form, wa_group_id: '' }); setGroupSearch(''); setGroupDropOpen(false); }}
                      >
                        — Nenhum grupo —
                      </div>
                      {filteredGroups.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">Nenhum grupo encontrado</div>
                      ) : filteredGroups.map((g) => (
                        <div
                          key={g.id}
                          onMouseDown={() => {
                            setForm({ ...form, wa_group_id: g.id });
                            setGroupSearch(g.name);
                            setGroupDropOpen(false);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 flex items-center justify-between gap-2 ${form.wa_group_id === g.id ? 'bg-blue-900/40 text-blue-300' : 'text-white'}`}
                        >
                          <span className="truncate">💬 {g.name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{g.size} membros</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {!loadingGroups && groups.length === 0 && (
                  <p className="text-yellow-500 text-xs mt-1">⚠ WhatsApp não conectado ou sem grupos. Clique em "Atualizar lista".</p>
                )}
                {form.wa_group_id && !loadingGroups && selectedGroupName && (
                  <p className="text-green-400 text-xs mt-1">✓ Vinculado: {selectedGroupName}</p>
                )}
                {form.wa_group_id && loadingGroups && (
                  <p className="text-blue-400 text-xs mt-1">⏳ Verificando grupo salvo...</p>
                )}
                {form.wa_group_id && !loadingGroups && !selectedGroupName && groups.length > 0 && (
                  <p className="text-yellow-400 text-xs mt-1">⚠ Grupo salvo mas não encontrado na lista atual.</p>
                )}
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => setForm({ ...form, icon: ic })}
                      className={`text-xl p-2 rounded-lg border ${form.icon === ic ? 'border-blue-500 bg-blue-900/30' : 'border-gray-600 bg-gray-700'}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-full border-2 ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-gray-700 text-white py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
