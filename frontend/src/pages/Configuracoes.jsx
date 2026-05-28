import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { Input } from '../components/ui/Input';

/* ── Componente de Toggle (switch) ── */
function Toggle({ checked, onChange, label, desc }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-6 rounded-full transition-colors shrink-0"
        style={{ background: checked ? 'var(--gold-500)' : 'var(--bg-surface-2)' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
          style={{
            background: checked ? '#000' : 'var(--text-muted)',
            left: checked ? '18px' : '2px',
          }}
        />
      </button>
    </div>
  );
}

export default function Configuracoes() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [phone, setPhone]       = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/user-settings');
      setSettings(data);
      setPhone(data.notification_phone || '');
    } catch (e) {
      toast.error('Erro ao carregar configurações');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (patch) => setSettings(s => ({ ...s, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...settings,
        notification_phone: phone.trim() || null,
      };
      const updated = await api.put('/user-settings', payload);
      setSettings(updated);
      setPhone(updated.notification_phone || '');
      toast.success('Configurações salvas!');
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!phone.trim()) { toast.error('Configure um número primeiro'); return; }
    setTesting(true);
    try {
      await api.post('/user-settings/test-notification');
      toast.success(`🔔 Mensagem de teste enviada pra ${phone}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Falha ao enviar teste');
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
          ⚙️ Configurações
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Personalize notificações e preferências
        </p>
      </div>

      {/* Notification Phone */}
      <div className="card space-y-3">
        <div>
          <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            📱 Número pra notificações WhatsApp
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Você recebe resgates diários, alertas de leads quentes e resumos neste número.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Ex: 5517996596363 (com DDI + DDD)"
              maxLength={15}
            />
          </div>
          <button
            className="btn-ghost text-sm"
            onClick={handleTest}
            disabled={testing || !phone.trim()}
          >
            {testing ? 'Enviando…' : '🔔 Testar'}
          </button>
        </div>
        <p className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
          Formato: <code className="font-mono">55</code> + DDD + número. Ex: <code className="font-mono">5517996596363</code>
        </p>
      </div>

      {/* Resgatador Diário Settings */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            🚨 Resgatador Diário
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: 'var(--gold-500)22', color: 'var(--gold-400)' }}>
            ONDA 1
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          IA analisa todo o pipeline toda manhã e mostra leads que precisam atenção HOJE.
        </p>

        <div className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
          <Toggle
            checked={!!settings.rescue_enabled}
            onChange={v => update({ rescue_enabled: v ? 1 : 0 })}
            label="Ativar Resgatador Diário"
            desc="Análise automática toda manhã"
          />
          <Toggle
            checked={!!settings.rescue_via_whatsapp}
            onChange={v => update({ rescue_via_whatsapp: v ? 1 : 0 })}
            label="Receber resumo por WhatsApp"
            desc="Lista enviada pro número configurado acima"
          />
          <Toggle
            checked={!!settings.rescue_via_push}
            onChange={v => update({ rescue_via_push: v ? 1 : 0 })}
            label="Receber notificação push"
            desc="Notificação no navegador/celular"
          />

          <div className="py-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Horário</label>
              <input
                type="time"
                className="input w-full text-sm"
                value={settings.rescue_time || '08:00'}
                onChange={e => update({ rescue_time: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Máximo de leads</label>
              <input
                type="number"
                min={3}
                max={30}
                className="input w-full text-sm"
                value={settings.rescue_max_items || 10}
                onChange={e => update({ rescue_max_items: Number(e.target.value) || 10 })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Salvar */}
      <div className="flex justify-end gap-3">
        <button className="btn-ghost text-sm" onClick={load}>
          Descartar
        </button>
        <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : '💾 Salvar configurações'}
        </button>
      </div>
    </div>
  );
}
