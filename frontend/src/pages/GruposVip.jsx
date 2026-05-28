import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const STATUS_CONFIG = {
  pending:  { label: 'Aguardando criação', badge: 'bg-gray-700 text-gray-400 border-gray-600' },
  created:  { label: 'Criado no WhatsApp', badge: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed:   { label: 'Falhou', badge: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

function ModalLancamento({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Digite o nome do lançamento'); return; }
    setLoading(true);
    try {
      await onSave(name.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white">Novo Lançamento</h3>
        <div>
          <label className="label">Nome do evento</label>
          <input className="input" placeholder="Ex: Baile de Outubro 2025" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Criando...' : 'Criar Lançamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalGrupo({ lancamentoId, onClose, onSave }) {
  const [baseName, setBaseName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [startNumber, setStartNumber] = useState(1);
  const [adminPhone, setAdminPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(false);

  const qty = Math.max(1, parseInt(quantity) || 1);
  const start = Math.max(1, parseInt(startNumber) || 1);

  // Preview dos nomes que serão gerados
  const previewNames = Array.from({ length: Math.min(qty, 3) }, (_, i) =>
    `${baseName.trim() || 'NOME DO GRUPO'} #${start + i}`
  );

  const handleSave = async () => {
    if (!baseName.trim()) { toast.error('Digite o nome base do grupo'); return; }
    if (!adminPhone.trim()) { toast.error('Digite o número do admin'); return; }
    if (qty < 1 || qty > 100) { toast.error('Quantidade deve ser entre 1 e 100'); return; }
    setLoading(true);
    try {
      const groups = Array.from({ length: qty }, (_, i) => ({
        lancamento_id: lancamentoId,
        name: `${baseName.trim()} #${start + i}`,
        admin_phone: adminPhone.trim(),
        admin_name: adminName.trim() || null,
      }));
      await onSave(groups);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white">Novo Grupo VIP</h3>

        <div>
          <label className="label">Nome do Grupo VIP</label>
          <input className="input" placeholder="Ex: SABOR FARRA GRUPO VIP" value={baseName}
            onChange={e => setBaseName(e.target.value)} autoFocus />
          <p className="text-xs text-gray-500 mt-1">O número será adicionado automaticamente no final</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Quantidade de Grupos</label>
            <input className="input" type="number" min="1" max="100" value={quantity}
              onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="label">Começar pelo nº</label>
            <input className="input" type="number" min="1" value={startNumber}
              onChange={e => setStartNumber(e.target.value)} />
          </div>
        </div>

        {/* Preview */}
        {baseName.trim() && (
          <div className="bg-gray-800 rounded-lg p-3 space-y-1">
            <p className="text-xs text-gray-400 font-medium mb-2">Prévia dos grupos:</p>
            {previewNames.map((n, i) => (
              <p key={i} className="text-xs text-white font-mono">{n}</p>
            ))}
            {qty > 3 && (
              <p className="text-xs text-gray-500">... e mais {qty - 3} grupo(s)</p>
            )}
          </div>
        )}

        <div>
          <label className="label">Número do Admin</label>
          <input className="input font-mono" placeholder="5511999998888" value={adminPhone}
            onChange={e => setAdminPhone(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">Com DDI e DDD, só números</p>
        </div>

        <div>
          <label className="label">Nome do Admin <span className="text-gray-500 font-normal">(opcional)</span></label>
          <input className="input" placeholder="Ex: João Silva" value={adminName}
            onChange={e => setAdminName(e.target.value)} />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary text-sm">
            {loading
              ? `Adicionando... (${qty} grupo${qty > 1 ? 's' : ''})`
              : `Adicionar ${qty > 1 ? `${qty} Grupos` : 'Grupo'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function LancamentoCard({ lancamento, onDeleted }) {
  const [grupos, setGrupos] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [showModalGrupo, setShowModalGrupo] = useState(false);
  const [creating, setCreating] = useState(null); // id do grupo sendo criado no WA

  const loadGrupos = () =>
    api.get(`/vip-groups?lancamento_id=${lancamento.id}`).then(setGrupos).catch(() => {});

  useEffect(() => {
    if (expanded) loadGrupos();
  }, [expanded]);

  const handleAddGrupo = async (groups) => {
    try {
      for (const data of groups) {
        await api.post('/vip-groups', data);
      }
      toast.success(groups.length > 1 ? `${groups.length} grupos adicionados!` : 'Grupo adicionado!');
      loadGrupos();
    } catch (err) {
      toast.error(err.message || 'Erro ao adicionar grupo');
      throw err;
    }
  };

  const handleCreateWA = async (grupo) => {
    setCreating(grupo.id);
    try {
      await api.post(`/vip-groups/${grupo.id}/create-wa`);
      toast.success(`Grupo "${grupo.name}" criado no WhatsApp!`);
      loadGrupos();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar grupo');
      loadGrupos();
    } finally {
      setCreating(null);
    }
  };

  const handleDeleteGrupo = async (grupo) => {
    if (!confirm(`Remover "${grupo.name}" da lista?`)) return;
    try {
      await api.delete(`/vip-groups/${grupo.id}`);
      toast.success('Removido');
      loadGrupos();
    } catch (err) {
      toast.error(err.message || 'Erro ao remover');
    }
  };

  const handleDeleteLancamento = async () => {
    if (!confirm(`Excluir o lançamento "${lancamento.name}"?`)) return;
    try {
      await api.delete(`/lancamentos/${lancamento.id}`);
      toast.success('Lançamento excluído');
      onDeleted();
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir');
    }
  };

  return (
    <>
      {showModalGrupo && (
        <ModalGrupo lancamentoId={lancamento.id} onClose={() => setShowModalGrupo(false)} onSave={handleAddGrupo} />
      )}

      <div className="card p-0 overflow-hidden">
        {/* Header do lançamento */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-800">
          <button className="flex items-center gap-2 text-left flex-1 min-w-0" onClick={() => setExpanded(v => !v)}>
            <span className="text-lg">{expanded ? '▾' : '▸'}</span>
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{lancamento.name}</p>
              <p className="text-xs text-gray-400">{lancamento.total_grupos} grupo(s)</p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { setExpanded(true); setShowModalGrupo(true); }}
              className="text-xs text-whatsapp-green hover:text-green-300 transition-colors">
              + Novo Grupo
            </button>
            <button onClick={handleDeleteLancamento}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-2">
              Excluir
            </button>
          </div>
        </div>

        {/* Lista de grupos */}
        {expanded && (
          <div className="divide-y divide-gray-800">
            {grupos.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p className="text-2xl mb-2">👥</p>
                <p>Nenhum grupo ainda.</p>
                <button onClick={() => setShowModalGrupo(true)}
                  className="text-whatsapp-green hover:underline text-xs mt-1">
                  Adicionar primeiro grupo
                </button>
              </div>
            ) : grupos.map((g) => {
              const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.pending;
              return (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{g.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Admin: {g.admin_name ? `${g.admin_name} · ` : ''}<span className="font-mono">{g.admin_phone}</span>
                    </p>
                    {g.wa_group_id && (
                      <p className="text-xs text-gray-600 mt-0.5 font-mono truncate">{g.wa_group_id}</p>
                    )}
                    {g.error_msg && (
                      <p className="text-xs text-red-400 mt-0.5 truncate" title={g.error_msg}>{g.error_msg}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-md border ${cfg.badge}`}>{cfg.label}</span>
                    {g.status !== 'created' && (
                      <button
                        onClick={() => handleCreateWA(g)}
                        disabled={creating === g.id}
                        className="text-xs text-whatsapp-green hover:text-green-300 transition-colors disabled:opacity-50"
                      >
                        {creating === g.id
                          ? <span className="flex items-center gap-1"><span className="w-3 h-3 border-2 border-whatsapp-green border-t-transparent rounded-full animate-spin" />Criando...</span>
                          : '▶ Criar no WA'}
                      </button>
                    )}
                    <button onClick={() => handleDeleteGrupo(g)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default function GruposVip() {
  const [lancamentos, setLancamentos] = useState([]);
  const [showModalLancamento, setShowModalLancamento] = useState(false);

  const loadLancamentos = () =>
    api.get('/lancamentos').then(setLancamentos).catch(() => {});

  useEffect(() => { loadLancamentos(); }, []);

  const handleCreateLancamento = async (name) => {
    try {
      await api.post('/lancamentos', { name });
      toast.success('Lançamento criado!');
      loadLancamentos();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar lançamento');
      throw err;
    }
  };

  return (
    <>
      {showModalLancamento && (
        <ModalLancamento onClose={() => setShowModalLancamento(false)} onSave={handleCreateLancamento} />
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Grupos VIP</h2>
            <p className="text-gray-400 text-sm mt-1">
              Organize seus grupos por evento. Crie o lançamento, adicione os grupos e crie direto no WhatsApp.
            </p>
          </div>
          <button onClick={() => setShowModalLancamento(true)} className="btn-primary text-sm">
            + Novo Lançamento
          </button>
        </div>

        {lancamentos.length === 0 ? (
          <div className="card text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-medium text-white">Nenhum lançamento ainda</p>
            <p className="text-sm mt-1">Crie um lançamento para começar a organizar seus grupos VIP</p>
            <button onClick={() => setShowModalLancamento(true)} className="btn-primary text-sm mt-4 mx-auto">
              + Criar Primeiro Lançamento
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {lancamentos.map((l) => (
              <LancamentoCard key={l.id} lancamento={l} onDeleted={loadLancamentos} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
