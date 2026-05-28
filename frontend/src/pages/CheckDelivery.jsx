import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

export default function CheckDelivery() {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);   // { phone, state: 'checking' | 'done', ... }
  const [loading, setLoading] = useState(false);

  const parse = () =>
    input.split('\n').map((l) => l.trim()).filter(Boolean);

  const handleCheck = async () => {
    const phones = parse();
    if (phones.length === 0) { toast.error('Cole pelo menos um número'); return; }

    // Mostra lista imediatamente com estado "verificando"
    setRows(phones.map((phone) => ({ phone, state: 'checking' })));
    setLoading(true);

    try {
      const data = await api.post('/messages/check-phones', {
        phones,
        message: message.trim() || undefined,
      });

      setRows(data.results.map((r) => ({ ...r, state: 'done' })));
    } catch (err) {
      toast.error(err.message || 'Erro ao verificar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const sentCount    = rows.filter((r) => r.state === 'done' && r.sent).length;
  const notSentCount = rows.filter((r) => r.state === 'done' && !r.sent).length;
  const stuckCount   = rows.filter((r) => r.state === 'done' && r.stuck).length;

  const handleExportProblemas = () => {
    const problemas = rows
      .filter((r) => r.state === 'done' && (!r.sent || r.stuck))
      .map((r) => r.phone);
    if (problemas.length === 0) { toast('Nenhum número com problema para exportar'); return; }
    const blob = new Blob([problemas.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `numeros-problemas-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Verificar Entregas por Número</h2>
        <p className="text-gray-400 text-sm mt-1">
          Confirme se a mensagem foi enviada para cada número ou ficou com o bug "Aguardando mensagem".
        </p>
      </div>

      {/* Formulário */}
      <div className="card space-y-4">
        {/* Campo mensagem (opcional) */}
        <div>
          <label className="label">Mensagem enviada <span className="text-gray-500 font-normal">(opcional — filtra pelo conteúdo)</span></label>
          <textarea
            className="input resize-none text-sm"
            rows={3}
            placeholder={"Ex: promoção especial\n(pode ser um trecho, palavra-chave ou a mensagem completa)"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {/* Números */}
        <div>
          <label className="label">Números (um por linha)</label>
          <textarea
            className="input resize-none font-mono text-sm"
            rows={7}
            placeholder={"5511999998888\n5521888887777\n5531777776666"}
            value={input}
            onChange={(e) => { setInput(e.target.value); setRows([]); }}
          />
          <p className="text-xs text-gray-500 mt-1">{parse().length} número(s) detectado(s)</p>
        </div>

        <button
          onClick={handleCheck}
          disabled={loading || parse().length === 0}
          className="btn-primary w-full justify-center py-3"
        >
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verificando...</>
            : '🔍 Verificar Entregas'}
        </button>
      </div>

      {/* Resultados */}
      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          {/* Cabeçalho com contadores */}
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-white">Resultado</h3>
            {!loading && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-400 font-medium">✅ {sentCount} enviada(s)</span>
                  {stuckCount > 0 && <span className="text-yellow-400 font-medium">⚠ {stuckCount} com bug</span>}
                  <span className="text-red-400 font-medium">❌ {notSentCount} não enviada(s)</span>
                </div>
                {(notSentCount + stuckCount) > 0 && (
                  <button onClick={handleExportProblemas}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-all">
                    ⬇ Exportar {notSentCount + stuckCount} com problema (.txt)
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="divide-y divide-gray-800 max-h-[500px] overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-mono text-gray-200">{r.phone}</p>
                  {r.state === 'done' && r.sent_at && (
                    <p className="text-xs text-gray-500 mt-0.5">Enviado {timeAgo(r.sent_at)}</p>
                  )}
                  {r.state === 'done' && r.stuck && (
                    <p className="text-xs text-yellow-500 mt-0.5">⚠ Possível bug "Aguardando mensagem"</p>
                  )}
                </div>

                <div className="shrink-0">
                  {r.state === 'checking' ? (
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Verificando...
                    </span>
                  ) : r.sent ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                      ✅ MSG ENVIADA
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                      ❌ MSG NÃO ENVIADA
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Aviso de bug */}
          {!loading && stuckCount > 0 && (
            <div className="px-4 py-3 border-t border-yellow-500/20 bg-yellow-500/5 text-xs text-yellow-400">
              ⚠ {stuckCount} número(s) mostram "MSG ENVIADA" mas sem confirmação do celular — pode ser o bug de descriptografia.
              Acesse <strong>Envio em Massa</strong> → <strong>Verificar</strong> → <strong>Reenviar não confirmados</strong>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
