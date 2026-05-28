import { useState } from 'react';

const TOKEN_KEY = 'wa_token';

/* ── helper: dispara download de arquivo CSV ────────────────────── */
async function downloadCsv(path, filename, setLoading) {
  setLoading(true);
  try {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Erro ao exportar');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Falha ao exportar: ' + e.message);
  } finally {
    setLoading(false);
  }
}

/* ── mini component: um cartão de exportação ───────────────────── */
function ExportCard({ icon, title, description, onDownload, loading, filters }) {
  return (
    <div
      className="card p-5 flex flex-col gap-3"
      style={{ border: '1px solid var(--border-default)' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-white">{icon} {title}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
        </div>
        <button
          onClick={onDownload}
          disabled={loading}
          className="btn btn-primary text-sm shrink-0 flex items-center gap-1.5"
          style={{ minWidth: 100 }}
        >
          {loading ? '⏳ ...' : '⬇ CSV'}
        </button>
      </div>
      {filters && <div className="pt-3 border-t border-zinc-800 space-y-2">{filters}</div>}
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */
function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── componente de filtro inline ─────────────────────────────────── */
function DateRange({ from, to, onFrom, onTo }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs" style={{ color: 'var(--text-muted)' }}>De</label>
      <input
        type="date" value={from} onChange={e => onFrom(e.target.value)}
        className="input text-xs px-2 py-1"
        style={{ maxWidth: 140 }}
      />
      <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Até</label>
      <input
        type="date" value={to} onChange={e => onTo(e.target.value)}
        className="input text-xs px-2 py-1"
        style={{ maxWidth: 140 }}
      />
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function Export() {
  // Leads
  const [leadsFrom, setLeadsFrom]   = useState(monthStart());
  const [leadsTo,   setLeadsTo]     = useState(today());
  const [leadsStage, setLeadsStage] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Pipeline
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  // Comissões
  const [commFrom,   setCommFrom]   = useState(monthStart());
  const [commTo,     setCommTo]     = useState(today());
  const [commStatus, setCommStatus] = useState('');
  const [loadingComm, setLoadingComm] = useState(false);

  // Reuniões
  const [meetFrom, setMeetFrom] = useState(monthStart());
  const [meetTo,   setMeetTo]   = useState(today());
  const [loadingMeet, setLoadingMeet] = useState(false);

  // Propostas
  const [propFrom, setPropFrom] = useState(monthStart());
  const [propTo,   setPropTo]   = useState(today());
  const [loadingProp, setLoadingProp] = useState(false);

  // Follow-ups
  const [fuFrom, setFuFrom] = useState(monthStart());
  const [fuTo,   setFuTo]   = useState(today());
  const [loadingFu, setLoadingFu] = useState(false);

  // Metas
  const [goalPeriod, setGoalPeriod] = useState(currentMonth());
  const [loadingGoals, setLoadingGoals] = useState(false);

  // Atividade
  const [actFrom, setActFrom] = useState(monthStart());
  const [actTo,   setActTo]   = useState(today());
  const [loadingAct, setLoadingAct] = useState(false);

  /* ── Builders de URL ─────────────────────────────────────────── */
  function leadsUrl() {
    const p = new URLSearchParams();
    if (leadsFrom)  p.set('date_from', leadsFrom);
    if (leadsTo)    p.set('date_to',   leadsTo);
    if (leadsStage) p.set('stage',     leadsStage);
    return `/api/crm/export/leads?${p}`;
  }

  function commUrl() {
    const p = new URLSearchParams();
    if (commFrom)   p.set('date_from', commFrom);
    if (commTo)     p.set('date_to',   commTo);
    if (commStatus) p.set('status',    commStatus);
    return `/api/crm/export/commissions?${p}`;
  }

  function meetUrl() {
    const p = new URLSearchParams();
    if (meetFrom) p.set('date_from', meetFrom);
    if (meetTo)   p.set('date_to',   meetTo);
    return `/api/crm/export/meetings?${p}`;
  }

  function propUrl() {
    const p = new URLSearchParams();
    if (propFrom) p.set('date_from', propFrom);
    if (propTo)   p.set('date_to',   propTo);
    return `/api/crm/export/proposals?${p}`;
  }

  function fuUrl() {
    const p = new URLSearchParams();
    if (fuFrom) p.set('date_from', fuFrom);
    if (fuTo)   p.set('date_to',   fuTo);
    return `/api/crm/export/followups?${p}`;
  }

  function goalsUrl() {
    const p = new URLSearchParams();
    if (goalPeriod) p.set('period', goalPeriod);
    return `/api/crm/export/goals?${p}`;
  }

  function actUrl() {
    const p = new URLSearchParams();
    if (actFrom) p.set('date_from', actFrom);
    if (actTo)   p.set('date_to',   actTo);
    return `/api/crm/export/activity?${p}`;
  }

  const stageOpts = [
    { value: '',                 label: 'Todas as etapas' },
    { value: 'entrou_contato',   label: 'Entrou em Contato' },
    { value: 'qualificando',     label: 'Qualificando' },
    { value: 'proposta_enviada', label: 'Proposta Enviada' },
    { value: 'negociando',       label: 'Negociando' },
    { value: 'fechado',          label: 'Fechado' },
    { value: 'perdido',          label: 'Perdido' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">📤 Exportar Dados</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Exporte qualquer módulo em CSV — compatível com Excel, Google Sheets e Power BI.
        </p>
      </div>

      {/* Info banner */}
      <div
        className="text-xs px-4 py-3 rounded-lg flex items-center gap-2"
        style={{ background: 'var(--gold-500)15', border: '1px solid var(--gold-500)40', color: 'var(--gold-400)' }}
      >
        💡 O arquivo inclui BOM UTF-8 — abre corretamente no Excel sem configuração extra.
      </div>

      {/* Grid de exportações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Leads */}
        <ExportCard
          icon="👥" title="Leads"
          description="Todos os campos + responsável, AI score, evento, cidade."
          loading={loadingLeads}
          onDownload={() => downloadCsv(leadsUrl(), `leads-${leadsFrom?.slice(0,7) || today()}.csv`, setLoadingLeads)}
          filters={
            <>
              <DateRange from={leadsFrom} to={leadsTo} onFrom={setLeadsFrom} onTo={setLeadsTo} />
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Etapa</label>
                <select
                  value={leadsStage} onChange={e => setLeadsStage(e.target.value)}
                  className="input text-xs px-2 py-1 flex-1"
                >
                  {stageOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </>
          }
        />

        {/* Pipeline */}
        <ExportCard
          icon="📊" title="Resumo do Pipeline"
          description="Contagem, valor potencial e ticket médio por etapa."
          loading={loadingPipeline}
          onDownload={() => downloadCsv('/api/crm/export/pipeline', `pipeline-${today()}.csv`, setLoadingPipeline)}
        />

        {/* Comissões */}
        <ExportCard
          icon="💰" title="Comissões"
          description="Histórico de comissões com status pago/pendente por vendedor."
          loading={loadingComm}
          onDownload={() => downloadCsv(commUrl(), `comissoes-${commFrom?.slice(0,7) || today()}.csv`, setLoadingComm)}
          filters={
            <>
              <DateRange from={commFrom} to={commTo} onFrom={setCommFrom} onTo={setCommTo} />
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Status</label>
                <select
                  value={commStatus} onChange={e => setCommStatus(e.target.value)}
                  className="input text-xs px-2 py-1 flex-1"
                >
                  <option value="">Todos</option>
                  <option value="pending">Pendente</option>
                  <option value="paid">Pago</option>
                </select>
              </div>
            </>
          }
        />

        {/* Reuniões */}
        <ExportCard
          icon="📅" title="Reuniões"
          description="Reuniões agendadas e realizadas com duração, tipo e local."
          loading={loadingMeet}
          onDownload={() => downloadCsv(meetUrl(), `reunioes-${meetFrom?.slice(0,7) || today()}.csv`, setLoadingMeet)}
          filters={
            <DateRange from={meetFrom} to={meetTo} onFrom={setMeetFrom} onTo={setMeetTo} />
          }
        />

        {/* Propostas */}
        <ExportCard
          icon="📋" title="Propostas"
          description="Propostas enviadas com valor, probabilidade, validade e status."
          loading={loadingProp}
          onDownload={() => downloadCsv(propUrl(), `propostas-${propFrom?.slice(0,7) || today()}.csv`, setLoadingProp)}
          filters={
            <DateRange from={propFrom} to={propTo} onFrom={setPropFrom} onTo={setPropTo} />
          }
        />

        {/* Follow-ups */}
        <ExportCard
          icon="📨" title="Follow-ups"
          description="Histórico de follow-ups concluídos e pendentes."
          loading={loadingFu}
          onDownload={() => downloadCsv(fuUrl(), `followups-${fuFrom?.slice(0,7) || today()}.csv`, setLoadingFu)}
          filters={
            <DateRange from={fuFrom} to={fuTo} onFrom={setFuFrom} onTo={setFuTo} />
          }
        />

        {/* Metas */}
        <ExportCard
          icon="🎯" title="Metas e Progresso"
          description="Metas vs realizado por vendedor — receita, deals, reuniões, follow-ups."
          loading={loadingGoals}
          onDownload={() => downloadCsv(goalsUrl(), `metas-${goalPeriod || today()}.csv`, setLoadingGoals)}
          filters={
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Período</label>
              <input
                type="month" value={goalPeriod} onChange={e => setGoalPeriod(e.target.value)}
                className="input text-xs px-2 py-1"
                style={{ maxWidth: 150 }}
              />
            </div>
          }
        />

        {/* Atividade */}
        <ExportCard
          icon="⚡" title="Atividade por Vendedor"
          description="Mensagens enviadas, reuniões, follow-ups, leads movidos e receita por vendedor."
          loading={loadingAct}
          onDownload={() => downloadCsv(actUrl(), `atividade-${actFrom?.slice(0,7) || today()}.csv`, setLoadingAct)}
          filters={
            <DateRange from={actFrom} to={actTo} onFrom={setActFrom} onTo={setActTo} />
          }
        />

      </div>

      {/* Dica de uso */}
      <div
        className="p-4 rounded-lg text-xs space-y-1"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
      >
        <p className="font-semibold text-white mb-2">💡 Como usar com Excel</p>
        <p>1. Clique em <strong className="text-white">⬇ CSV</strong> — o arquivo é baixado automaticamente.</p>
        <p>2. No Excel: <em>Dados → De Texto/CSV</em> e selecione o arquivo. Encoding: UTF-8.</p>
        <p>3. No Google Sheets: <em>Arquivo → Importar → Fazer upload</em>.</p>
        <p>4. Para Power BI: use <em>Obter Dados → Texto/CSV</em>.</p>
      </div>

    </div>
  );
}
