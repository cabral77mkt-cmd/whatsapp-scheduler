import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

/* ─── Campos mapeáveis ──────────────────────────────────────────────────── */
const FIELDS = [
  { key: 'phone',           label: 'Telefone *',       required: true  },
  { key: 'name',            label: 'Nome',              required: false },
  { key: 'source',          label: 'Fonte',             required: false },
  { key: 'temperature',     label: 'Temperatura',       required: false },
  { key: 'potential_value', label: 'Valor potencial',   required: false },
  { key: 'notes',           label: 'Notas',             required: false },
];

/* ─── Step indicator ────────────────────────────────────────────────────── */
function Steps({ current }) {
  const steps = ['Upload', 'Mapeamento', 'Preview', 'Resultado'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                background: i < current ? '#10B981' : i === current ? 'var(--gold-500,#D4AF37)' : '#3f3f46',
                color: i <= current ? '#000' : '#71717a',
              }}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span className="text-[11px] mt-1" style={{ color: i === current ? 'var(--gold-500,#D4AF37)' : '#71717a' }}>
              {s}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-12 h-0.5 mb-4 mx-1" style={{ background: i < current ? '#10B981' : '#3f3f46' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Import() {
  /* State */
  const [step, setStep]         = useState(0);
  const [file, setFile]         = useState(null);
  const [headers, setHeaders]   = useState([]);
  const [preview, setPreview]   = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping]   = useState({});
  const [parsing, setParsing]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState(null);
  const [history, setHistory]   = useState([]);
  const [drag, setDrag]         = useState(false);
  const fileRef = useRef();

  /* Auto-map columns by common names */
  const autoMap = useCallback((hdrs) => {
    const m = {};
    const lower = hdrs.map(h => h.toLowerCase());
    const tryMatch = (field, patterns) => {
      const idx = lower.findIndex(h => patterns.some(p => h.includes(p)));
      if (idx >= 0) m[field] = hdrs[idx];
    };
    tryMatch('phone',           ['telefone','phone','celular','tel','numero','número','fone']);
    tryMatch('name',            ['nome','name','contato','contact']);
    tryMatch('source',          ['fonte','source','origem','canal']);
    tryMatch('temperature',     ['temperatura','temperature','temp','quente','frio']);
    tryMatch('potential_value', ['valor','value','ticket','orcamento','orçamento','budget']);
    tryMatch('notes',           ['notas','notes','observacao','observação','obs','comentario']);
    return m;
  }, []);

  const loadHistory = useCallback(async () => {
    try { setHistory(await api.get('/crm/import/history')); } catch {}
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  /* File handling */
  const processFile = async (f) => {
    if (!f?.name.toLowerCase().endsWith('.csv')) {
      return toast.error('Apenas arquivos .CSV são aceitos');
    }
    setFile(f);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const data = await api.post('/crm/import/parse', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setHeaders(data.headers || []);
      setPreview(data.preview || []);
      setTotalRows(data.total_rows || 0);
      setMapping(autoMap(data.headers || []));
      setStep(1);
    } catch (e) {
      toast.error(e.message || 'Erro ao processar CSV');
    } finally { setParsing(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  /* Import */
  const handleImport = async () => {
    if (!mapping.phone) return toast.error('Mapeie a coluna de telefone');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      const data = await api.post('/crm/import/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setStep(3);
      loadHistory();
      toast.success(`${data.imported} leads importados!`);
    } catch (e) {
      toast.error(e.message || 'Erro ao importar');
    } finally { setImporting(false); }
  };

  const reset = () => {
    setStep(0); setFile(null); setHeaders([]); setPreview([]);
    setMapping({}); setResult(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">📥 Importar Leads via CSV</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Importe uma lista de contatos para o CRM em segundos.
        </p>
      </div>

      <Steps current={step} />

      {/* ── STEP 0: Upload ── */}
      {step === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors"
          style={{ borderColor: drag ? 'var(--gold-500,#D4AF37)' : '#3f3f46', background: drag ? '#D4AF3710' : '#18181b' }}
        >
          <div className="text-5xl mb-4">📄</div>
          <p className="text-white font-semibold mb-1">
            {parsing ? 'Processando…' : 'Arraste um arquivo CSV aqui'}
          </p>
          <p className="text-zinc-500 text-sm">ou clique para selecionar</p>
          <p className="text-zinc-600 text-xs mt-3">Máximo 5MB · Separador vírgula ou ponto-e-vírgula</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => processFile(e.target.files?.[0])} />
        </div>
      )}

      {/* ── STEP 1: Mapeamento ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-400 mb-1">Arquivo: <span className="text-white">{file?.name}</span></p>
            <p className="text-sm text-zinc-400">{totalRows} linha(s) detectada(s)</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Mapeie as colunas</h3>
            {FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="text-sm text-zinc-300 w-36 shrink-0">
                  {f.label}
                </label>
                <select
                  value={mapping[f.key] || ''}
                  onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value || undefined }))}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">— Ignorar —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(2)} disabled={!mapping.phone}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: 'var(--gold-500,#D4AF37)' }}>
              Ver preview →
            </button>
            <button onClick={reset} className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-800">
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-sm text-white font-semibold mb-3">Preview (primeiras 5 linhas)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500">
                    {FIELDS.filter(f => mapping[f.key]).map(f => (
                      <th key={f.key} className="text-left pr-4 pb-2">{f.label.replace(' *','')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-zinc-800">
                      {FIELDS.filter(f => mapping[f.key]).map(f => (
                        <td key={f.key} className="pr-4 py-1.5 text-zinc-300 truncate max-w-[120px]">
                          {row[mapping[f.key]] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500 mt-3">
              Total a importar: <strong className="text-white">{totalRows}</strong> leads (duplicatas serão ignoradas)
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black disabled:opacity-50"
              style={{ background: 'var(--gold-500,#D4AF37)' }}
            >
              {importing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Importando…
                </span>
              ) : `Importar ${totalRows} leads →`}
            </button>
            <button onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-800">
              Ajustar
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Resultado ── */}
      {step === 3 && result && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h3 className="text-lg font-bold text-white">Importação concluída!</h3>
            <div className="grid grid-cols-3 gap-4 mt-5">
              {[
                { label: 'Importados', value: result.imported, color: '#10B981' },
                { label: 'Ignorados*', value: result.skipped,  color: '#F59E0B' },
                { label: 'Erros',      value: result.errors,   color: '#EF4444' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-3">* Duplicatas (telefone já cadastrado) são ignoradas</p>
          </div>

          <div className="flex gap-3">
            <button onClick={reset}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black"
              style={{ background: 'var(--gold-500,#D4AF37)' }}>
              Nova importação
            </button>
            <a href="/crm/leads"
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center border border-zinc-800 text-zinc-300">
              Ver leads →
            </a>
          </div>
        </div>
      )}

      {/* ── Histórico ── */}
      {history.length > 0 && step === 0 && (
        <div className="mt-10">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Histórico de importações</h3>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <span className="text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{h.filename || 'arquivo.csv'}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(h.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-emerald-400">+{h.imported}</p>
                  {h.skipped > 0 && <p className="text-xs text-zinc-500">{h.skipped} ignorados</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
