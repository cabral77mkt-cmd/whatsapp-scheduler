import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { TEMPLATE_KEYS, TEMPLATE_HINTS } from './stages';

const DAYS = [
  { id: 'mon', label: 'Segunda' }, { id: 'tue', label: 'Terça' },
  { id: 'wed', label: 'Quarta' },  { id: 'thu', label: 'Quinta' },
  { id: 'fri', label: 'Sexta' },   { id: 'sat', label: 'Sábado' },
  { id: 'sun', label: 'Domingo' }
];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [webhookToken, setWebhookToken] = useState(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const load = async () => {
    try {
      const s = await api.get('/crm/settings');
      setSettings({
        auto_create_leads: s.auto_create_leads,
        business_hours: s.business_hours || {},
        templates: { ...Object.fromEntries(TEMPLATE_KEYS.map(t => [t.key, ''])), ...(s.templates || {}) }
      });
      setWebhookToken(s.webhook_token || null);
      const t = await api.get('/crm/tags');
      setTags(t);
    } catch { toast.error('Erro ao carregar configurações'); }
  };
  useEffect(() => { load(); }, []);

  if (!settings) return <div className="text-gray-400">Carregando...</div>;

  const updateTemplate = (key, val) => {
    setSettings(s => ({ ...s, templates: { ...s.templates, [key]: val } }));
  };

  const updateDay = (day, windows) => {
    setSettings(s => ({ ...s, business_hours: { ...s.business_hours, [day]: windows } }));
  };

  const runRecover = async () => {
    setRecovering(true);
    try {
      const { recovered } = await api.post('/crm/settings/recover');
      if (recovered === 0) toast.success('Nenhum lead ausente encontrado');
      else toast.success(`${recovered} lead(s) recuperado(s) com sucesso!`);
    } catch (err) { toast.error(err.message); }
    finally { setRecovering(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/crm/settings', {
        auto_create_leads: settings.auto_create_leads,
        business_hours: settings.business_hours,
        templates: settings.templates
      });
      toast.success('Configurações salvas');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const generateWebhookToken = async () => {
    try {
      const { webhook_token } = await api.post('/crm/settings/webhook-token');
      setWebhookToken(webhook_token);
      setTokenVisible(true);
      toast.success('Token gerado! Copie agora — ele não será exibido novamente.');
    } catch { toast.error('Erro ao gerar token'); }
  };

  const revokeWebhookToken = async () => {
    if (!confirm('Revogar token? Integrações existentes vão parar de funcionar.')) return;
    try {
      await api.delete('/crm/settings/webhook-token');
      setWebhookToken(null);
      toast.success('Token revogado');
    } catch { toast.error('Erro ao revogar'); }
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    try {
      await api.post('/crm/tags', { name: newTag.trim() });
      setNewTag('');
      const t = await api.get('/crm/tags'); setTags(t);
    } catch (err) { toast.error(err.message); }
  };

  const delTag = async (id) => {
    if (!confirm('Excluir esta tag?')) return;
    try { await api.delete(`/crm/tags/${id}`); setTags(tags.filter(t => t.id !== id)); }
    catch { toast.error('Erro'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">⚙️ Configurações do CRM</h1>
        <button onClick={runRecover} disabled={recovering} className="btn btn-ghost text-orange-400 border border-orange-500/40 mr-2">
          {recovering ? 'Varrendo...' : '🔍 Varrer leads ausentes'}
        </button>
        <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Salvando...' : 'Salvar tudo'}</button>
      </div>

      <div className="card mb-4">
        <h2 className="text-lg font-semibold text-white mb-3">Captura automática</h2>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={settings.auto_create_leads} onChange={e => setSettings({...settings, auto_create_leads: e.target.checked})} />
          Criar lead automaticamente quando alguém me chamar pela primeira vez no WhatsApp
        </label>
        <p className="text-xs text-gray-500 mt-2">
          Números já cadastrados em Contatos são ignorados. Mensagens enviadas por você (fromMe) não criam leads.
        </p>
      </div>

      <div className="card mb-4">
        <h2 className="text-lg font-semibold text-white mb-3">Horário comercial</h2>
        <p className="text-xs text-gray-500 mb-3">Follow-ups que cairem fora destas janelas são reagendados para o próximo horário válido.</p>
        <div className="space-y-2">
          {DAYS.map(d => {
            const w = settings.business_hours[d.id]?.[0] || { from: '', to: '' };
            const enabled = !!settings.business_hours[d.id]?.length;
            return (
              <div key={d.id} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-24 text-sm text-gray-300">
                  <input type="checkbox" checked={enabled} onChange={e => updateDay(d.id, e.target.checked ? [{ from: '08:00', to: '20:00' }] : [])} />
                  {d.label}
                </label>
                {enabled && (
                  <>
                    <input type="time" className="input text-sm" value={w.from} onChange={e => updateDay(d.id, [{ ...w, from: e.target.value }])} />
                    <span className="text-gray-500">até</span>
                    <input type="time" className="input text-sm" value={w.to} onChange={e => updateDay(d.id, [{ ...w, to: e.target.value }])} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card mb-4">
        <h2 className="text-lg font-semibold text-white mb-1">Mensagens dos follow-ups</h2>
        <p className="text-xs text-gray-500 mb-4">
          Cadastre manualmente o texto de cada mensagem. <b>Templates em branco não são agendados</b> —
          se você não quer um determinado follow-up, basta deixar vazio.
        </p>
        <div className="space-y-4">
          {TEMPLATE_KEYS.map(t => (
            <div key={t.key}>
              <label className="label flex items-center justify-between">
                <span>{t.label}</span>
                {!settings.templates[t.key] && <span className="text-[10px] text-red-400">⚠ não será enviado</span>}
              </label>
              <textarea
                rows="3"
                className="input w-full"
                placeholder="(deixe em branco para desativar este follow-up)"
                value={settings.templates[t.key] || ''}
                onChange={e => updateTemplate(t.key, e.target.value)}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                {t.hint && <span className="text-orange-400">{t.hint} </span>}
                Sugestão: <i>{TEMPLATE_HINTS[t.key]}</i>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Webhook externo ── */}
      <div className="card mb-4">
        <h2 className="text-lg font-semibold text-white mb-1">🔗 Webhook — Captura de leads externa</h2>
        <p className="text-xs text-gray-500 mb-4">
          Use este endpoint para receber leads de formulários, Instagram Ads, Zapier ou Make (Integromat).<br />
          <code className="text-orange-400">POST /api/webhooks/lead</code> com header <code className="text-orange-400">Authorization: Bearer &lt;token&gt;</code>
        </p>

        {webhookToken ? (
          <div className="space-y-3">
            <div>
              <label className="label">Token de autenticação</label>
              <div className="flex gap-2">
                <input
                  type={tokenVisible ? 'text' : 'password'}
                  readOnly
                  value={webhookToken}
                  className="input flex-1 font-mono text-xs text-orange-300"
                />
                <button onClick={() => setTokenVisible(v => !v)} className="btn btn-ghost text-xs border border-gray-600">
                  {tokenVisible ? '🙈' : '👁'}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(webhookToken); toast.success('Copiado!'); }}
                  className="btn btn-ghost text-xs border border-gray-600"
                >
                  📋 Copiar
                </button>
              </div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3 text-xs text-gray-400 font-mono space-y-1">
              <p className="text-gray-500 mb-1">Exemplo de payload:</p>
              <p>{'{'} "phone": "11999990000", "name": "João", "source": "Instagram",</p>
              <p className="pl-4">"event_name": "Festa X", "event_date": "2025-12-31", "potential_value": 5000 {'}'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={generateWebhookToken} className="btn btn-ghost text-xs border border-gray-600 text-yellow-400">
                🔄 Regenerar token
              </button>
              <button onClick={revokeWebhookToken} className="btn btn-ghost text-xs border border-red-800 text-red-400">
                🗑 Revogar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-400 mb-3">Nenhum token gerado. Gere um para começar a receber leads via webhook.</p>
            <button onClick={generateWebhookToken} className="btn btn-primary text-sm">
              ⚡ Gerar token de webhook
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Tags</h2>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" placeholder="Nova tag..." value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
          <button onClick={addTag} className="btn btn-primary">+ Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <span key={t.id} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{ background: t.color + '33', color: t.color }}>
              {t.name}
              <button onClick={() => delTag(t.id)} className="hover:text-red-400">✕</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
