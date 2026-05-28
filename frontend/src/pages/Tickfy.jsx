import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

// ─── Constantes de status ───────────────────────────────────────────────────

const STATUS_INFO = {
  PG: { label: 'Pago',        color: 'bg-green-500/20 text-green-400',  dot: 'bg-green-400' },
  NP: { label: 'Não Pago',    color: 'bg-red-500/20 text-red-400',      dot: 'bg-red-400' },
  EA: { label: 'Em Análise',  color: 'bg-yellow-500/20 text-yellow-400',dot: 'bg-yellow-400' },
  DV: { label: 'Devolvido',   color: 'bg-orange-500/20 text-orange-400',dot: 'bg-orange-400' },
  CA: { label: 'Cancelado',   color: 'bg-gray-500/20 text-gray-400',    dot: 'bg-gray-400' },
};

const WA_SENT_INFO = {
  0: { label: 'Pendente',      color: 'bg-gray-500/20 text-gray-400' },
  1: { label: 'Enviado',       color: 'bg-green-500/20 text-green-400' },
  2: { label: 'Falhou',        color: 'bg-red-500/20 text-red-400' },
  3: { label: 'Sem Template',  color: 'bg-yellow-500/20 text-yellow-400' },
  4: { label: 'Sem Telefone',  color: 'bg-gray-500/20 text-gray-400' },
};

const VARIABLES = ['{nome}', '{evento}', '{valor}', '{data}'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ code }) {
  const info = STATUS_INFO[code] || { label: code, color: 'bg-gray-500/20 text-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot || 'bg-gray-400'}`} />
      {info.label}
    </span>
  );
}

function WaBadge({ value }) {
  const info = WA_SENT_INFO[value] ?? WA_SENT_INFO[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

function previewMessage(tpl, variables) {
  if (!tpl) return '';
  const fake = { nome: 'João Silva', evento: 'BALS PRIME', valor: 'R$ 50,00', data: '04/04/2026' };
  return tpl
    .replace(/\{nome\}/gi, fake.nome)
    .replace(/\{evento\}/gi, fake.evento)
    .replace(/\{valor\}/gi, fake.valor)
    .replace(/\{data\}/gi, fake.data);
}

// ─── Aba: Configuração ────────────────────────────────────────────────────────

function ConfigTab({ config, onSaved }) {
  const [form, setForm] = useState({
    link_sistema: '',
    api_key: '',
    last_trn_id: 0,
    poll_interval: 3,
    event_ids: '',
    active: false,
  });
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [nextPoll, setNextPoll] = useState(null);
  const [testId, setTestId] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testSend, setTestSend] = useState({ phone: '', nome: '', evento: '', valor: '' });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    if (!config) return;
    setForm({
      link_sistema: config.link_sistema || '',
      api_key: config.api_key || '',
      last_trn_id: config.last_trn_id ?? 0,
      poll_interval: config.poll_interval ?? 3,
      event_ids: JSON.parse(config.event_ids || '[]').join(', '),
      active: !!config.active,
    });
  }, [config]);

  useEffect(() => {
    if (!form.active || !form.poll_interval) { setNextPoll(null); return; }
    const interval = setInterval(() => {
      const mins = form.poll_interval;
      const now = new Date();
      const secs = (mins * 60) - (now.getMinutes() % mins) * 60 - now.getSeconds();
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setNextPoll(`${m}m ${s.toString().padStart(2, '0')}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [form.active, form.poll_interval]);

  const save = async () => {
    setSaving(true);
    try {
      const eventArray = form.event_ids
        .split(',').map((s) => s.trim()).filter(Boolean);
      await api.post('/tickfy/config', {
        link_sistema: form.link_sistema,
        api_key: form.api_key,
        last_trn_id: Number(form.last_trn_id),
        poll_interval: Number(form.poll_interval),
        event_ids: eventArray,
        active: form.active,
      });
      toast.success('Configuração salva!');
      onSaved();
    } catch { toast.error('Erro ao salvar configuração'); }
    finally { setSaving(false); }
  };

  const pollNow = async () => {
    setPolling(true);
    try {
      await api.post('/tickfy/poll');
      toast.success('Verificação iniciada! Veja a aba Vendas em instantes.');
    } catch { toast.error('Erro ao iniciar verificação'); }
    finally { setTimeout(() => setPolling(false), 3000); }
  };

  const sendTest = async () => {
    if (!testSend.phone) return toast.error('Digite o número de telefone');
    setSending(true);
    setSendResult(null);
    try {
      const data = await api.post('/tickfy/test-send', {
        phone: testSend.phone,
        nome: testSend.nome || undefined,
        evento: testSend.evento || undefined,
        valor: testSend.valor || undefined,
      });
      setSendResult({ ok: true, msg: data.mensagem });
      toast.success('Mensagem de teste enviada!');
    } catch (e) {
      const err = e?.response?.data?.error || e.message;
      setSendResult({ ok: false, error: err });
      toast.error(err);
    } finally { setSending(false); }
  };

  const testApi = async () => {
    if (!testId) return toast.error('Digite um pag_id para testar');
    setTesting(true);
    setTestResult(null);
    try {
      const data = await api.get(`/tickfy/test?pag_id=${testId}`);
      setTestResult({ ok: true, data });
    } catch (e) {
      setTestResult({ ok: false, error: e?.response?.data?.error || e.message });
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <label className="block text-sm text-gray-400 mb-1">URL do Sistema (LINK_SISTEMA)</label>
        <input
          type="text"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-whatsapp-green"
          placeholder="sis.minhaloja.com.br"
          value={form.link_sistema}
          onChange={(e) => setForm({ ...form, link_sistema: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">Sem https://, sem barra no final</p>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">API Key (key=)</label>
        <input
          type="text"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-whatsapp-green font-mono"
          placeholder="sua-chave-aqui"
          value={form.api_key}
          onChange={(e) => setForm({ ...form, api_key: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Último TRN ID (ponto de partida)</label>
        <input
          type="number"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-whatsapp-green"
          placeholder="8419"
          value={form.last_trn_id}
          onChange={(e) => setForm({ ...form, last_trn_id: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">
          Compras com TRN maior que este serão monitoradas. Use o TRN da última compra para não enviar mensagens retroativas.
        </p>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Intervalo de verificação: <span className="text-white font-medium">{form.poll_interval} min</span>
        </label>
        <input
          type="range" min="1" max="10" step="1"
          className="w-full accent-green-500"
          value={form.poll_interval}
          onChange={(e) => setForm({ ...form, poll_interval: e.target.value })}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1 min</span><span>5 min</span><span>10 min</span>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Eventos a monitorar (opcional)</label>
        <input
          type="text"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-whatsapp-green"
          placeholder="77, 80, 81 (deixe vazio para monitorar todos)"
          value={form.event_ids}
          onChange={(e) => setForm({ ...form, event_ids: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">IDs dos eventos separados por vírgula (eve_cod do G-ticket)</p>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div>
          <p className="text-sm font-medium text-white">Monitoramento automático</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {form.active
              ? nextPoll ? `Próxima verificação em ${nextPoll}` : 'Ativo'
              : 'Desativado'}
          </p>
        </div>
        <button
          onClick={() => setForm({ ...form, active: !form.active })}
          className={`relative w-12 h-6 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar Configuração'}
        </button>
        <button
          onClick={pollNow}
          disabled={polling}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {polling ? '⏳ Verificando...' : '🔍 Verificar agora'}
        </button>
      </div>

      {/* Enviar Mensagem de Teste */}
      <div className="border border-green-800/40 rounded-xl p-4 bg-green-900/10">
        <p className="text-sm font-medium text-white mb-1">📲 Enviar mensagem de teste</p>
        <p className="text-xs text-gray-400 mb-3">
          Envia o template <strong className="text-green-400">PG (Pago)</strong> para um número real, para confirmar que o WhatsApp está funcionando.
        </p>
        <div className="space-y-2">
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
            placeholder="Telefone (ex: 17996205973 ou +5517996205973)"
            value={testSend.phone}
            onChange={(e) => setTestSend({ ...testSend, phone: e.target.value })}
          />
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="Nome (opcional)"
              value={testSend.nome}
              onChange={(e) => setTestSend({ ...testSend, nome: e.target.value })}
            />
            <input
              type="text"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="Evento (opcional)"
              value={testSend.evento}
              onChange={(e) => setTestSend({ ...testSend, evento: e.target.value })}
            />
            <input
              type="text"
              className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="Valor"
              value={testSend.valor}
              onChange={(e) => setTestSend({ ...testSend, valor: e.target.value })}
            />
          </div>
          <button
            onClick={sendTest}
            disabled={sending}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {sending ? '⏳ Enviando...' : '📲 Enviar WhatsApp de Teste'}
          </button>
          {sendResult && (
            <div className={`p-3 rounded-lg text-xs ${sendResult.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-400'}`}>
              {sendResult.ok
                ? <><strong>✓ Enviado!</strong><br /><span className="text-gray-300 whitespace-pre-wrap">{sendResult.msg}</span></>
                : <><strong>✗ Erro:</strong> {sendResult.error}</>}
            </div>
          )}
        </div>
      </div>

      {/* Diagnóstico */}
      <div className="border border-gray-700 rounded-xl p-4 bg-gray-900/40">
        <p className="text-sm font-medium text-white mb-3">🔬 Testar API (diagnóstico)</p>
        <p className="text-xs text-gray-400 mb-3">
          Insira o <strong className="text-white">pag_id</strong> de uma compra recente para ver a resposta bruta da API G-ticket.
          O pag_id é o número da coluna <strong className="text-white">TRN</strong> no relatório do painel.
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
            placeholder="Ex: 8420"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
          />
          <button
            onClick={testApi}
            disabled={testing}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {testing ? 'Testando...' : 'Testar'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap overflow-x-auto ${testResult.ok ? 'bg-gray-800 text-green-300' : 'bg-red-900/30 text-red-400'}`}>
            {testResult.ok
              ? JSON.stringify(testResult.data.raw, null, 2)
              : `Erro: ${testResult.error}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba: Templates ───────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/tickfy/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar templates'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (t) => {
    setSaving(t.status_code);
    try {
      await api.post('/tickfy/templates', {
        status_code: t.status_code,
        status_label: t.status_label,
        message: t.message,
        active: t.active,
      });
      toast.success(`Template "${t.status_label}" salvo!`);
    } catch { toast.error('Erro ao salvar template'); }
    finally { setSaving(null); }
  };

  const update = (statusCode, field, value) => {
    setTemplates((prev) => prev.map((t) => t.status_code === statusCode ? { ...t, [field]: value } : t));
  };

  const insertVar = (statusCode, variable) => {
    setTemplates((prev) => prev.map((t) => {
      if (t.status_code !== statusCode) return t;
      const el = document.getElementById(`tpl-${statusCode}`);
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const newMsg = t.message.slice(0, start) + variable + t.message.slice(end);
        setTimeout(() => { el.focus(); el.setSelectionRange(start + variable.length, start + variable.length); }, 0);
        return { ...t, message: newMsg };
      }
      return { ...t, message: t.message + variable };
    }));
  };

  const STATUS_ORDER = ['PG', 'NP', 'EA', 'DV', 'CA'];
  const sorted = [...templates].sort((a, b) => STATUS_ORDER.indexOf(a.status_code) - STATUS_ORDER.indexOf(b.status_code));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Configure a mensagem enviada para cada status de pagamento. Use as variáveis abaixo para personalizar.
      </p>
      {sorted.map((t) => {
        const info = STATUS_INFO[t.status_code] || { label: t.status_code, color: 'bg-gray-500/20 text-gray-400' };
        const preview = previewMessage(t.message);
        return (
          <div key={t.status_code} className={`bg-gray-800/60 border rounded-xl p-4 ${t.active ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${info.color}`}>{t.status_code}</span>
                <span className="text-white text-sm font-medium">{t.status_label}</span>
              </div>
              <button
                onClick={() => update(t.status_code, 'active', t.active ? 0 : 1)}
                className={`relative w-10 h-5 rounded-full transition-colors ${t.active ? 'bg-green-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${t.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <textarea
              id={`tpl-${t.status_code}`}
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-green-500"
              placeholder="Digite a mensagem..."
              value={t.message}
              onChange={(e) => update(t.status_code, 'message', e.target.value)}
            />

            <div className="flex flex-wrap gap-1 mt-2">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVar(t.status_code, v)}
                  className="bg-gray-700 hover:bg-gray-600 text-green-400 text-xs px-2 py-0.5 rounded font-mono transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>

            {t.message && (
              <div className="mt-3 p-2 bg-green-900/20 border border-green-800/30 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Preview:</p>
                <p className="text-xs text-gray-200 whitespace-pre-wrap">{preview}</p>
              </div>
            )}

            <button
              onClick={() => save(t)}
              disabled={saving === t.status_code}
              className="mt-3 w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg py-1.5 text-sm transition-colors"
            >
              {saving === t.status_code ? 'Salvando...' : 'Salvar template'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba: Vendas ──────────────────────────────────────────────────────────────

function SalesTab() {
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [resending, setResending] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = filterStatus ? `?status=${filterStatus}` : '';
      const data = await api.get(`/tickfy/sales${params}`);
      setSales(data.sales || []);
      setTotal(data.total || 0);
    } catch { /* silencioso */ }
  }, [filterStatus]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const resend = async (saleId) => {
    setResending(saleId);
    try {
      await api.post(`/tickfy/sales/${saleId}/resend`);
      toast.success('Reenviado com sucesso!');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Erro ao reenviar');
    } finally { setResending(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">{total} venda(s) detectada(s)</p>
        <div className="flex gap-2">
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_INFO).map(([code, info]) => (
              <option key={code} value={code}>{info.label}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
          >
            ↻ Atualizar
          </button>
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">🎟️</p>
          <p className="text-sm">Nenhuma venda detectada ainda.</p>
          <p className="text-xs mt-1">Configure as credenciais e clique em "Verificar agora".</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                <th className="px-3 py-2 text-left">Data/Hora</th>
                <th className="px-3 py-2 text-left">Comprador</th>
                <th className="px-3 py-2 text-left">Celular</th>
                <th className="px-3 py-2 text-left">Evento</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">WhatsApp</th>
                <th className="px-3 py-2 text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={s.id} className={`border-t border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-900/30' : ''}`}>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">
                    {new Date(s.detected_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2 text-white">{s.comprador_nome || '—'}</td>
                  <td className="px-3 py-2 text-gray-300 font-mono text-xs">{s.comprador_telefone || '—'}</td>
                  <td className="px-3 py-2 text-gray-300 max-w-[160px] truncate">{s.evento || '—'}</td>
                  <td className="px-3 py-2 text-right text-white whitespace-nowrap">
                    {s.valor ? `R$ ${Number(s.valor).toFixed(2).replace('.', ',')}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center"><StatusBadge code={s.status_code} /></td>
                  <td className="px-3 py-2 text-center"><WaBadge value={s.wa_sent} /></td>
                  <td className="px-3 py-2 text-center">
                    {s.wa_sent === 2 && (
                      <button
                        onClick={() => resend(s.id)}
                        disabled={resending === s.id}
                        className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-2 py-1 rounded transition-colors"
                      >
                        {resending === s.id ? '...' : 'Reenviar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'config',    label: '⚙️ Configuração' },
  { id: 'templates', label: '✉️ Mensagens' },
  { id: 'sales',     label: '🎟️ Vendas' },
];

export default function Tickfy() {
  const [tab, setTab] = useState('config');
  const [config, setConfig] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api.get('/tickfy/config');
      setConfig(data);
    } catch { /* silencioso na primeira vez */ }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🎟️</span>
        <div>
          <h1 className="text-xl font-bold text-white">TICKFY</h1>
          <p className="text-sm text-gray-400">Integração G-ticket — envio automático pelo WhatsApp</p>
        </div>
        {config && (
          <div className="ml-auto">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              <span className={`w-2 h-2 rounded-full ${config.active ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              {config.active ? 'Monitorando' : 'Inativo'}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/60 p-1 rounded-xl mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div>
        {tab === 'config'    && <ConfigTab config={config} onSaved={loadConfig} />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'sales'     && <SalesTab />}
      </div>
    </div>
  );
}
