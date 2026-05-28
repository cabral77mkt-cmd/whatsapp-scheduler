import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const STATUS_BADGE = {
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  failed:    'bg-red-500/20 text-red-400',
  paused:    'bg-blue-500/20 text-blue-400',
  running:   'bg-yellow-500/20 text-yellow-400',
};
const STATUS_LABEL = {
  completed: '✅ Concluído',
  cancelled: '🚫 Cancelado',
  failed:    '❌ Interrompido',
  paused:    '⏸ Pausado',
  running:   '⏳ Em andamento',
};

const DELIVERY_ICON = {
  failed:    { icon: '❌', label: 'Falhou', color: 'text-red-400' },
  sent:      { icon: '✓', label: 'Enviado (não confirmado)', color: 'text-gray-400' },
  delivered: { icon: '✓✓', label: 'Entregue ao celular', color: 'text-blue-400' },
  read:      { icon: '✓✓', label: 'Lido', color: 'text-whatsapp-green' },
  played:    { icon: '🔊', label: 'Reproduzido', color: 'text-whatsapp-green' },
};

function DeliveryModal({ bulkId, onClose, onResend }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    api.get(`/messages/bulk/${bulkId}/deliveries`)
      .then(setData)
      .catch(() => toast.error('Erro ao carregar entregas'));
  }, [bulkId]);

  const filtered = data?.deliveries?.filter((d) => {
    if (filter === 'undelivered') return d.wa_status <= 1;
    if (filter === 'delivered') return d.wa_status === 2;
    if (filter === 'read') return d.wa_status >= 3;
    return true;
  }) || [];

  const undeliveredCount = data?.deliveries?.filter((d) => d.wa_status <= 1).length || 0;

  const handleResend = async () => {
    if (!confirm(`Reenviar para ${undeliveredCount} contato(s) não confirmados?`)) return;
    setResending(true);
    try {
      await api.post(`/messages/bulk/${bulkId}/resend-undelivered`);
      toast.success('Reenvio iniciado!');
      onResend();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Erro ao reenviar');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h3 className="font-semibold text-white">Verificar Entregas</h3>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                {data.deliveries.filter(d => d.wa_status >= 2).length} entregues •{' '}
                {undeliveredCount} não confirmados •{' '}
                {data.deliveries.filter(d => d.wa_status >= 3).length} lidos
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 p-3 border-b border-gray-700">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'undelivered', label: `Não entregues (${undeliveredCount})` },
            { key: 'delivered', label: 'Entregues' },
            { key: 'read', label: 'Lidos' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`text-xs px-2 py-1 rounded-md border transition-all ${filter === key
                ? 'border-whatsapp-green bg-whatsapp-green/10 text-whatsapp-green'
                : 'border-gray-700 text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
          {!data ? (
            <div className="flex items-center justify-center py-8">
              <span className="w-6 h-6 border-2 border-whatsapp-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">Nenhum resultado</p>
          ) : filtered.map((d, i) => {
            const ds = DELIVERY_ICON[d.status_label] || DELIVERY_ICON.sent;
            return (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-mono text-gray-200">{d.phone}</p>
                  {d.wa_status === 1 && (
                    <p className="text-xs text-yellow-500 mt-0.5">⚠ Possível "Aguardando mensagem" no celular</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${ds.color}`}>{ds.icon}</span>
                  <p className={`text-xs ${ds.color}`}>{ds.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {undeliveredCount > 0 && (
          <div className="p-4 border-t border-gray-700">
            <button onClick={handleResend} disabled={resending}
              className="btn-primary w-full justify-center py-2.5 text-sm">
              {resending
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Reenviando...</>
                : `🔁 Reenviar para ${undeliveredCount} não confirmado(s)`}
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              Inclui contatos com ✓ (enviado mas não confirmado no celular)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BulkSend() {
  const [contacts, setContacts] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [manualPhones, setManualPhones] = useState('');
  const [messages, setMessages] = useState(['', '', '', '', '']);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('contacts');
  const [bulkHistory, setBulkHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [deliveryModal, setDeliveryModal] = useState(null); // bulkId sendo verificado
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [batchSize, setBatchSize] = useState(0);
  const [batchDelaySeconds, setBatchDelaySeconds] = useState(30);
  const pollRef = useRef(null);

  const loadHistory = () =>
    api.get('/messages/bulk').then(setBulkHistory).catch(() => {});

  useEffect(() => {
    api.get('/contacts').then(setContacts).catch(() => {});
    loadHistory();
  }, []);

  // Polling automático quando há envio em andamento
  // Não inicia se a aba está em background (economiza bateria/dados no mobile)
  useEffect(() => {
    const hasActive = bulkHistory.some((b) => b.status === 'running');
    if (hasActive && !pollRef.current && !document.hidden) {
      pollRef.current = setInterval(loadHistory, 2000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [bulkHistory]);

  // Retomar polling ao voltar para a aba (se ainda houver envio ativo)
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        loadHistory();
      } else if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const toggleContact = (phone) =>
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );

  const selectAll = () =>
    setSelectedPhones(selectedPhones.length === contacts.length ? [] : contacts.map((c) => c.phone));

  const getPhones = () => {
    if (mode === 'contacts') return selectedPhones;
    return manualPhones
      .split('\n')
      .map((p) => p.replace(/[^0-9]/g, '').trim())
      .filter((p) => p.length >= 10);
  };

  const handleSend = async () => {
    const phones = getPhones();
    const activeMessages = messages.filter((m) => m.trim());
    if (phones.length === 0) { toast.error('Selecione pelo menos um destinatário'); return; }
    if (activeMessages.length === 0) { toast.error('Digite pelo menos uma mensagem'); return; }
    if (!confirm(`Enviar para ${phones.length} número(s) usando ${activeMessages.length} mensagem(ns) em rotação?`)) return;

    setLoading(true);
    try {
      const data = await api.post('/messages/bulk', { phones, messages: activeMessages, delaySeconds, batchSize, batchDelaySeconds });
      toast.success(`Envio iniciado para ${data.total} número(s)!`);
      setMessages(['', '', '', '', '']);
      setSelectedPhones([]);
      setManualPhones('');
      setTimeout(loadHistory, 500);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (id) => {
    try {
      await api.post(`/messages/bulk/${id}/pause`);
      toast.success('Envio pausado');
      loadHistory();
    } catch (err) { toast.error(err.message || 'Erro ao pausar'); }
  };

  const handleResume = async (id) => {
    try {
      await api.post(`/messages/bulk/${id}/resume`);
      toast.success('Envio retomado');
      loadHistory();
    } catch (err) { toast.error(err.message || 'Erro ao retomar'); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancelar este envio em massa?')) return;
    try {
      await api.delete(`/messages/bulk/${id}`);
      toast.success('Envio cancelado');
      loadHistory();
    } catch (err) { toast.error(err.message || 'Erro ao cancelar'); }
  };

  const toggleExpanded = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {deliveryModal && (
        <DeliveryModal
          bulkId={deliveryModal}
          onClose={() => setDeliveryModal(null)}
          onResend={loadHistory}
        />
      )}
      <div>
        <h2 className="text-2xl font-bold text-white">Envio em Massa</h2>
        <p className="text-gray-400 text-sm mt-1">Envie a mesma mensagem para múltiplos contatos de uma vez.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Destinatários */}
        <div className="card space-y-4">
          <h3 className="font-semibold text-white">Destinatários</h3>
          <div className="flex gap-2">
            {['contacts', 'manual'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${mode === m ? 'border-whatsapp-green bg-whatsapp-green/10 text-whatsapp-green' : 'border-gray-700 text-gray-400'}`}>
                {m === 'contacts' ? `👥 Da Agenda (${contacts.length})` : '✏️ Manual'}
              </button>
            ))}
          </div>

          {mode === 'contacts' ? (
            <>
              {contacts.length > 0 && (
                <button onClick={selectAll} className="text-xs text-whatsapp-green hover:underline">
                  {selectedPhones.length === contacts.length ? 'Desmarcar todos' : `Selecionar todos (${contacts.length})`}
                </button>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {contacts.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">Nenhum contato cadastrado</p>
                ) : contacts.map((c) => (
                  <label key={c.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all ${selectedPhones.includes(c.phone) ? 'border-whatsapp-green/50 bg-whatsapp-green/5' : 'border-gray-700 hover:border-gray-600'}`}>
                    <input type="checkbox" className="accent-whatsapp-green"
                      checked={selectedPhones.includes(c.phone)} onChange={() => toggleContact(c.phone)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </div>
                  </label>
                ))}
              </div>
              {selectedPhones.length > 0 && <p className="text-xs text-whatsapp-green">{selectedPhones.length} contato(s) selecionado(s)</p>}
            </>
          ) : (
            <div>
              <label className="label">Números (um por linha)</label>
              <textarea className="input resize-none" rows={8}
                placeholder={"5511999998888\n5521888887777\n5531777776666"}
                value={manualPhones} onChange={(e) => setManualPhones(e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">{getPhones().length} número(s) válido(s) detectado(s)</p>
            </div>
          )}
        </div>

        {/* Mensagem */}
        <div className="card space-y-4">
          <div>
            <h3 className="font-semibold text-white">Mensagens</h3>
            <p className="text-xs text-gray-400 mt-1">As mensagens são enviadas em rotação: contato 1 → msg 1, contato 2 → msg 2, etc.</p>
          </div>

          {/* Abas */}
          <div className="flex gap-1 flex-wrap">
            {messages.map((m, i) => (
              <button key={i} onClick={() => setActiveTab(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeTab === i
                  ? 'border-whatsapp-green bg-whatsapp-green/10 text-whatsapp-green'
                  : m.trim()
                    ? 'border-gray-600 text-gray-300'
                    : 'border-gray-700 text-gray-500'}`}>
                Msg {i + 1}{m.trim() ? ' ✓' : ''}
              </button>
            ))}
          </div>

          <div>
            <label className="label">Mensagem {activeTab + 1}</label>
            <textarea className="input resize-none" rows={7}
              placeholder={`Digite a mensagem ${activeTab + 1}...${activeTab > 0 ? '\n(opcional — deixe vazio para não usar)' : ''}`}
              value={messages[activeTab]}
              onChange={(e) => {
                const updated = [...messages];
                updated[activeTab] = e.target.value;
                setMessages(updated);
              }} />
            <p className="text-xs text-gray-500 mt-1">
              {messages[activeTab].length} caracteres •{' '}
              {messages.filter((m) => m.trim()).length} mensagem(ns) ativa(s)
            </p>
          </div>
          {/* Configurações de delay */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-300">⏱ Configurações de velocidade</h4>

            <div>
              <label className="label">Delay entre mensagens (segundos)</label>
              <input type="number" min="1" max="300" className="input" value={delaySeconds}
                onChange={(e) => setDelaySeconds(Math.max(1, Number(e.target.value)))} />
              <p className="text-xs text-gray-500 mt-1">Pausa entre cada envio individual</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pausar a cada (msgs)</label>
                <input type="number" min="0" max="9999" className="input" value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(0, Number(e.target.value)))}
                  placeholder="0 = desativado" />
                <p className="text-xs text-gray-500 mt-1">0 = desativado</p>
              </div>
              <div>
                <label className="label">Pausa do lote (segundos)</label>
                <input type="number" min="1" max="3600" className="input" value={batchDelaySeconds}
                  disabled={batchSize === 0}
                  onChange={(e) => setBatchDelaySeconds(Math.max(1, Number(e.target.value)))} />
              </div>
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Destinatários:</span>
              <span className="text-white font-medium">{getPhones().length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Delay entre envios:</span>
              <span className="text-white">{delaySeconds}s</span>
            </div>
            {batchSize > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Pausa a cada {batchSize} msgs:</span>
                <span className="text-white">{batchDelaySeconds}s</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Tempo estimado:</span>
              <span className="text-white">~{(() => {
                const n = getPhones().length;
                const base = n * delaySeconds;
                const pauses = batchSize > 0 ? Math.floor(n / batchSize) * batchDelaySeconds : 0;
                return Math.ceil((base + pauses) / 60);
              })()} min</span>
            </div>
          </div>
          <button onClick={handleSend}
            disabled={loading || getPhones().length === 0 || messages.filter((m) => m.trim()).length === 0}
            className="btn-primary w-full justify-center py-3">
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
            ) : `📢 Enviar para ${getPhones().length} contato(s)`}
          </button>
        </div>
      </div>

      {/* Histórico */}
      {bulkHistory.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Histórico de Envios em Massa</h3>
          <div className="space-y-3">
            {bulkHistory.map((b) => {
              const results = (() => { try { return JSON.parse(b.results || '[]'); } catch { return []; } })();
              const allPhones = (() => { try { return JSON.parse(b.phones || '[]'); } catch { return []; } })();
              const pendingPhones = allPhones.filter(p => !results.find(r => r.phone === p));

              return (
                <div key={b.id} className="border border-gray-700 rounded-lg overflow-hidden">
                  {/* Cabeçalho */}
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{b.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(b.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-white">{b.sent}/{b.total}</p>
                      <p className="text-xs text-gray-400">enviados</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-md shrink-0 ${STATUS_BADGE[b.status] || STATUS_BADGE.running}`}>
                      {STATUS_LABEL[b.status] || '⏳ Em andamento'}
                    </span>
                    {/* Botões de ação */}
                    <div className="flex gap-2 shrink-0">
                      {b.status === 'running' && (
                        <button onClick={() => handlePause(b.id)}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          ⏸ Pausar
                        </button>
                      )}
                      {b.status === 'paused' && (
                        <button onClick={() => handleResume(b.id)}
                          className="text-xs text-whatsapp-green hover:text-green-300 transition-colors">
                          ▶ Continuar
                        </button>
                      )}
                      {['running', 'paused'].includes(b.status) && (
                        <button onClick={() => handleCancel(b.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors">
                          Cancelar
                        </button>
                      )}
                      {['completed', 'failed', 'paused', 'cancelled'].includes(b.status) && (
                        <button onClick={() => setDeliveryModal(b.id)}
                          className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                          🔍 Verificar
                        </button>
                      )}
                      <button onClick={() => toggleExpanded(b.id)}
                        className="text-xs text-gray-400 hover:text-gray-300 transition-colors">
                        {expanded[b.id] ? '▲ Ocultar' : '▼ Ver lista'}
                      </button>
                    </div>
                  </div>

                  {/* Lista de números expandida */}
                  {expanded[b.id] && (
                    <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
                      {results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2">
                          <span className="text-sm text-gray-300 font-mono">{r.phone}</span>
                          <span className={`text-xs font-medium ${r.status === 'sent' ? 'text-green-400' : 'text-red-400'}`}>
                            {r.status === 'sent' ? '✅ Enviado' : '❌ Falhou'}
                          </span>
                        </div>
                      ))}
                      {pendingPhones.map((phone, i) => (
                        <div key={`pending-${i}`} className="flex items-center justify-between px-4 py-2 opacity-50">
                          <span className="text-sm text-gray-300 font-mono">{phone}</span>
                          <span className="text-xs text-gray-500">⏳ Pendente</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
