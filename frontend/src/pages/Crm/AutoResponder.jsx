import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

/* ─── Toggle simples ───────────────────────────────────────────────────── */
function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-colors shrink-0"
        style={{ background: checked ? 'var(--gold-500, #D4AF37)' : '#3f3f46' }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-zinc-400">{description}</p>}
      </div>
    </label>
  );
}

/* ─── Card de seção ────────────────────────────────────────────────────── */
function Section({ title, subtitle, icon, children }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <span>{icon}</span>{title}
        </h3>
        {subtitle && <p className="text-xs text-zinc-400 mt-0.5 ml-6">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ─── Componente principal ─────────────────────────────────────────────── */
export default function AutoResponder() {
  const [cfg, setCfg]       = useState(null);
  const [stats, setStats]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const [cfgData, statsData] = await Promise.all([
        api.get('/crm/auto-responder'),
        api.get('/crm/auto-responder/stats'),
      ]);
      setCfg(cfgData);
      setStats(statsData);
    } catch (e) {
      setError('Erro ao carregar configurações.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      await api.put('/crm/auto-responder', cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isEnabled = !!cfg.enabled;
  const isSDR     = !!cfg.sdr_enabled;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          🤖 AI First Responder + SDR
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Responde automaticamente as primeiras mensagens de novos leads com IA —
          e pode ativar o modo SDR para agendar reuniões.
        </p>
      </div>

      {/* ── Stats Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Respostas hoje',    value: stats.today_total,           icon: '📩' },
            { label: 'First Responder',   value: stats.first_responder_total, icon: '🤖' },
            { label: 'SDR total',         value: stats.sdr_total,             icon: '📅' },
            { label: 'Leads ativos',      value: stats.active_leads,          icon: '👥' },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-center">
              <div className="text-lg">{s.icon}</div>
              <div className="text-xl font-bold text-white mt-1">{s.value ?? '—'}</div>
              <div className="text-[11px] text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Ativar / desativar ── */}
      <Section icon="⚡" title="Ativar Auto-Responder" subtitle="Liga ou desliga o módulo inteiro">
        <Toggle
          checked={isEnabled}
          onChange={v => set('enabled', v ? 1 : 0)}
          label={isEnabled ? 'Auto-responder ATIVADO' : 'Auto-responder desativado'}
          description={isEnabled
            ? 'Novos leads receberão respostas automáticas da IA'
            : 'Nenhuma mensagem automática será enviada'}
        />
        {isEnabled && (
          <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 text-xs text-amber-300">
            ⚠️ Certifique-se que o WhatsApp está conectado para o módulo funcionar.
          </div>
        )}
      </Section>

      {isEnabled && (
        <>
          {/* ── Personalidade ── */}
          <Section icon="🎭" title="Personalidade & Objetivos" subtitle="Define como a IA vai se comportar">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Persona / Estilo de comunicação
                </label>
                <textarea
                  value={cfg.persona || ''}
                  onChange={e => set('persona', e.target.value)}
                  rows={2}
                  placeholder="Ex: Consultora de eventos corporativos, fala de forma profissional mas descontraída..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Objetivos das primeiras mensagens
                </label>
                <textarea
                  value={cfg.objectives || ''}
                  onChange={e => set('objectives', e.target.value)}
                  rows={2}
                  placeholder="Ex: Entender o tipo de evento, número de convidados e data. Qualificar se é cliente potencial."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </Section>

          {/* ── Controles ── */}
          <Section icon="🎛️" title="Controles do First Responder" subtitle="Quantas mensagens automáticas e com qual delay">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Nº máximo de mensagens automáticas
                </label>
                <input
                  type="number" min={1} max={10}
                  value={cfg.max_auto_msgs || 3}
                  onChange={e => set('max_auto_msgs', Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Recomendado: 3 mensagens</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Delay antes de responder (segundos)
                </label>
                <input
                  type="number" min={1} max={60}
                  value={cfg.response_delay_secs || 5}
                  onChange={e => set('response_delay_secs', Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Mais humano com 5–15s</p>
              </div>
            </div>

            {!isSDR && (
              <div className="mt-2">
                <label className="block text-xs text-zinc-400 mb-1">
                  Mensagem de Handoff (após esgotar respostas automáticas)
                </label>
                <textarea
                  value={cfg.handoff_message || ''}
                  onChange={e => set('handoff_message', e.target.value)}
                  rows={2}
                  placeholder="Ex: Perfeito! Vou pedir para nossa equipe entrar em contato com você ainda hoje. 👋"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/50"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Enviada 30s após a última resposta automática para passar o bastão.
                </p>
              </div>
            )}
          </Section>

          {/* ── SDR Mode ── */}
          <Section
            icon="📅"
            title="Modo SDR — Agendamento de Reuniões"
            subtitle="Após o First Responder, a IA tenta agendar uma reunião"
          >
            <Toggle
              checked={isSDR}
              onChange={v => set('sdr_enabled', v ? 1 : 0)}
              label={isSDR ? 'Modo SDR ATIVADO' : 'Modo SDR desativado'}
              description={isSDR
                ? `Após ${cfg.max_auto_msgs || 3} msgs de qualificação, a IA tenta agendar reunião`
                : 'Ativar para que a IA tente agendar reuniões automaticamente'}
            />

            {isSDR && (
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Objetivo do SDR
                  </label>
                  <input
                    type="text"
                    value={cfg.sdr_goal || ''}
                    onChange={e => set('sdr_goal', e.target.value)}
                    placeholder="Ex: Agendar uma demonstração de 20 minutos"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Link de agendamento (Calendly, Cal.com, etc.)
                  </label>
                  <input
                    type="url"
                    value={cfg.sdr_calendar_link || ''}
                    onChange={e => set('sdr_calendar_link', e.target.value)}
                    placeholder="https://calendly.com/seu-link"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    A IA enviará este link quando o lead demonstrar interesse.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Máximo de tentativas SDR
                  </label>
                  <input
                    type="number" min={1} max={10}
                    value={cfg.sdr_max_attempts || 5}
                    onChange={e => set('sdr_max_attempts', Number(e.target.value))}
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                {/* Handoff no modo SDR */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Mensagem de Handoff (após esgotar SDR)
                  </label>
                  <textarea
                    value={cfg.handoff_message || ''}
                    onChange={e => set('handoff_message', e.target.value)}
                    rows={2}
                    placeholder="Ex: Nossa equipe vai entrar em contato em breve para encontrar o melhor horário! 😊"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            )}
          </Section>

          {/* ── Fluxo visual ── */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Fluxo configurado
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-blue-500/20 text-blue-300 px-3 py-1">
                📩 Lead manda mensagem
              </span>
              <span className="text-zinc-600">→</span>
              <span className="rounded-full bg-amber-500/20 text-amber-300 px-3 py-1">
                🤖 IA responde ({cfg.max_auto_msgs || 3}x)
              </span>
              {isSDR ? (
                <>
                  <span className="text-zinc-600">→</span>
                  <span className="rounded-full bg-purple-500/20 text-purple-300 px-3 py-1">
                    📅 SDR tenta agendar ({cfg.sdr_max_attempts || 5}x)
                  </span>
                  {cfg.handoff_message && (
                    <>
                      <span className="text-zinc-600">→</span>
                      <span className="rounded-full bg-green-500/20 text-green-300 px-3 py-1">
                        📨 Handoff para humano
                      </span>
                    </>
                  )}
                </>
              ) : cfg.handoff_message ? (
                <>
                  <span className="text-zinc-600">→</span>
                  <span className="rounded-full bg-green-500/20 text-green-300 px-3 py-1">
                    📨 Handoff para humano
                  </span>
                </>
              ) : (
                <>
                  <span className="text-zinc-600">→</span>
                  <span className="rounded-full bg-zinc-700/60 text-zinc-400 px-3 py-1">
                    👤 Aguarda atendente
                  </span>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Botão salvar ── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-black transition-opacity disabled:opacity-50"
          style={{ background: 'var(--gold-500, #D4AF37)' }}
        >
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            ✓ Salvo com sucesso!
          </span>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {/* ── Dica de API Key ── */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 text-xs text-zinc-400">
        <strong className="text-zinc-300">💡 Dica:</strong> Para obter respostas personalizadas da IA, configure a variável{' '}
        <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300">ANTHROPIC_API_KEY</code>{' '}
        no servidor. Sem a chave, o sistema usa mensagens de fallback predefinidas.
      </div>
    </div>
  );
}
