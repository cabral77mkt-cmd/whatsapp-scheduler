import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { useEntity } from '../../contexts/EntityContext';

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16'];
const ICONS  = ['💰','🏠','🏢','🏭','🚗','📦','💼','🎯','🌟','🏗'];

export default function ConfiguracaoEntidade() {
  const { entity, selectEntity } = useEntity();

  const [form, setForm] = useState({
    name: '', description: '', wa_group_id: '', color: '#3B82F6', icon: '💰',
  });
  const [groups, setGroups]               = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupSearch, setGroupSearch]     = useState('');
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const [saving, setSaving]               = useState(false);
  const groupRef = useRef(null);

  // Preenche form com dados da entidade selecionada
  useEffect(() => {
    if (entity) {
      setForm({
        name:        entity.name        || '',
        description: entity.description || '',
        wa_group_id: entity.wa_group_id || '',
        color:       entity.color       || '#3B82F6',
        icon:        entity.icon        || '💰',
      });
    }
  }, [entity?.id]);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const grps = await api.get('/groups');
      setGroups(Array.isArray(grps) ? grps : []);
    } catch { /* WhatsApp pode não estar conectado */ }
    finally { setLoadingGroups(false); }
  };

  useEffect(() => { loadGroups(); }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedGroupName = groups.find(g => g.id === form.wa_group_id)?.name || '';

  // Assim que o grupo for encontrado na lista, popula o campo de busca com o nome
  useEffect(() => {
    if (selectedGroupName && !groupDropOpen) {
      setGroupSearch(selectedGroupName);
    }
  }, [selectedGroupName]);

  const groupDisplayValue = groupDropOpen ? groupSearch
    : (selectedGroupName || (form.wa_group_id && loadingGroups ? '⏳ Carregando nome...' : groupSearch));

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const save = async () => {
    if (!form.name.trim()) return toast.error('Nome é obrigatório');
    setSaving(true);
    try {
      const payload = { ...form, wa_group_id: form.wa_group_id || null };
      await api.put(`/finance/entities/${entity.id}`, payload);

      // Atualiza contexto para refletir imediatamente no sidebar
      selectEntity({ ...entity, ...payload });
      toast.success('Configurações salvas!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  if (!entity) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Nenhuma entidade selecionada.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="w-12 h-12 flex items-center justify-center rounded-xl text-2xl"
          style={{ backgroundColor: entity.color + '33', border: `2px solid ${entity.color}` }}
        >
          {entity.icon}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-sm text-gray-400">{entity.name}</p>
        </div>
      </div>

      {/* Card principal */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 space-y-5">

        <h2 className="text-base font-semibold text-white border-b border-gray-700 pb-3">
          Informações da Entidade
        </h2>

        {/* Nome */}
        <div>
          <label className="text-gray-300 text-sm block mb-1">Nome *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Casa, Empresa 1..."
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="text-gray-300 text-sm block mb-1">Descrição</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descrição opcional..."
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Ícone */}
        <div>
          <label className="text-gray-300 text-sm block mb-2">Ícone</label>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setForm({ ...form, icon: ic })}
                className={`text-xl p-2 rounded-lg border transition-all ${
                  form.icon === ic
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        {/* Cor */}
        <div>
          <label className="text-gray-300 text-sm block mb-2">Cor</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  form.color === c ? 'border-white scale-110' : 'border-transparent hover:border-gray-500'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Card WhatsApp */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 space-y-4">
        <h2 className="text-base font-semibold text-white border-b border-gray-700 pb-3 flex items-center gap-2">
          📱 Grupo do WhatsApp
        </h2>

        <p className="text-gray-400 text-sm">
          Mensagens enviadas neste grupo serão automaticamente registradas como transações desta entidade.
        </p>

        <div ref={groupRef}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-gray-300 text-sm">Grupo vinculado</label>
            <button
              type="button"
              onClick={loadGroups}
              disabled={loadingGroups}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
            >
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
              onFocus={() => { setGroupSearch(''); setGroupDropOpen(true); }}
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
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 flex items-center justify-between gap-2 ${
                      form.wa_group_id === g.id ? 'bg-blue-900/40 text-blue-300' : 'text-white'
                    }`}
                  >
                    <span className="truncate">💬 {g.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{g.size} membros</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status do vínculo */}
          {form.wa_group_id && !loadingGroups && selectedGroupName && (
            <div className="mt-2 flex items-center gap-2 bg-green-900/20 border border-green-700/40 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="text-green-400 text-xs font-medium">Vinculado: <strong>{selectedGroupName}</strong></span>
            </div>
          )}
          {form.wa_group_id && loadingGroups && (
            <p className="text-blue-400 text-xs mt-1">⏳ Verificando grupo...</p>
          )}
          {form.wa_group_id && !loadingGroups && !selectedGroupName && groups.length > 0 && (
            <div className="mt-2 flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2">
              <span className="text-yellow-400 text-xs">⚠ Grupo salvo mas não encontrado na lista atual. Clique em "Atualizar lista".</span>
            </div>
          )}
          {!form.wa_group_id && (
            <p className="text-gray-500 text-xs mt-1">Sem grupo vinculado — transações não serão capturadas automaticamente.</p>
          )}
          {!loadingGroups && groups.length === 0 && (
            <p className="text-yellow-500 text-xs mt-1">⚠ WhatsApp não conectado ou sem grupos.</p>
          )}
        </div>
      </div>

      {/* Botão salvar */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Salvando...' : '💾 Salvar alterações'}
        </button>
      </div>

    </div>
  );
}
