import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import socket from '../../lib/socket';
import { STAGES, STAGE_BY_ID } from './stages';
import KanbanColumn from './KanbanColumn';
import LeadCard from './LeadCard';
import LeadDrawer from './LeadDrawer';
import LossReasonModal from './LossReasonModal';
import NewLeadModal from './NewLeadModal';
import FilterPanel from './FilterPanel';

/* ── helpers ──────────────────────────────────────────────── */
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const EMPTY_FILTERS = {
  search: '', stage: '', temperature: '', source: '',
  value_min: '', value_max: '', stale_days: '', sort: '', responsible_user_id: '',
};

function staleDaysFor(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

const DENSITY_OPTIONS = [
  { id: 'compact',     label: '▪ Compacto'    },
  { id: 'comfortable', label: '▫ Confortável'  },
  { id: 'detailed',    label: '□ Detalhado'   },
];

// Stage accent colors aligned to design tokens
const STAGE_ACCENT = {
  entrou_contato:      '#64748B',
  conversando:         '#3B82F6',
  diagnostico:         '#06B6D4',
  reuniao_agendada:    '#6366F1',
  reuniao_realizada:   '#8B5CF6',
  aguardando_proposta: '#F59E0B',
  proposta_enviada:    '#F97316',
  analisando_proposta: '#EAB308',
  negociacao:          '#EC4899',
  fechado:             '#10B981',
  perdido:             '#EF4444',
};

/* ── Bulk action bar ──────────────────────────────────────── */
function BulkActionBar({ count, stages, tags, cadences, users, onMove, onTag, onCadence, onAssign, onClear }) {
  const [moveOpen, setMoveOpen]       = useState(false);
  const [tagOpen, setTagOpen]         = useState(false);
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [assignOpen, setAssignOpen]   = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setMoveOpen(false); setTagOpen(false); setCadenceOpen(false); setAssignOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const Dropdown = ({ open, items, onSelect, emptyMsg }) => (
    open && (
      <div
        className="absolute bottom-full mb-2 left-0 rounded-xl overflow-hidden z-50 py-1 min-w-44"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', boxShadow: '0 8px 32px #00000066' }}
      >
        {items.length === 0
          ? <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>{emptyMsg}</p>
          : items.map(item => (
            <button
              key={item.id}
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => { onSelect(item.id); setMoveOpen(false); setTagOpen(false); setCadenceOpen(false); setAssignOpen(false); }}
            >
              {item.label}
            </button>
          ))
        }
      </div>
    )
  );

  return (
    <div
      ref={ref}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl"
      style={{ background: 'var(--gold-500)', color: '#000', boxShadow: '0 8px 40px #D4AF3766' }}
    >
      <span className="font-bold text-sm mr-1">{count} selecionado{count !== 1 ? 's' : ''}</span>

      {/* Move */}
      <div className="relative">
        <button className="btn-dark text-xs px-3 py-1.5" onClick={() => { setMoveOpen(v => !v); setTagOpen(false); setCadenceOpen(false); setAssignOpen(false); }}>
          🗂️ Mover para…
        </button>
        <Dropdown open={moveOpen} emptyMsg="Sem estágios"
          items={stages.filter(s => !['fechado','perdido'].includes(s.id)).map(s => ({ id: s.id, label: s.label }))}
          onSelect={onMove}
        />
      </div>

      {/* Tag */}
      <div className="relative">
        <button className="btn-dark text-xs px-3 py-1.5" onClick={() => { setTagOpen(v => !v); setMoveOpen(false); setCadenceOpen(false); setAssignOpen(false); }}>
          🏷️ Tag…
        </button>
        <Dropdown open={tagOpen} emptyMsg="Crie tags primeiro"
          items={tags.map(t => ({ id: t.id, label: t.name }))}
          onSelect={onTag}
        />
      </div>

      {/* Cadência */}
      <div className="relative">
        <button className="btn-dark text-xs px-3 py-1.5" onClick={() => { setCadenceOpen(v => !v); setMoveOpen(false); setTagOpen(false); setAssignOpen(false); }}>
          🔄 Cadência…
        </button>
        <Dropdown open={cadenceOpen} emptyMsg="Crie cadências primeiro"
          items={cadences.map(c => ({ id: c.id, label: c.name }))}
          onSelect={onCadence}
        />
      </div>

      {/* Atribuir */}
      <div className="relative">
        <button className="btn-dark text-xs px-3 py-1.5" onClick={() => { setAssignOpen(v => !v); setMoveOpen(false); setTagOpen(false); setCadenceOpen(false); }}>
          👤 Atribuir…
        </button>
        <Dropdown open={assignOpen} emptyMsg="Sem usuários"
          items={users.map(u => ({ id: u.id, label: u.name || u.username }))}
          onSelect={onAssign}
        />
      </div>

      <button
        className="ml-2 text-sm font-bold opacity-70 hover:opacity-100 transition-opacity px-2"
        onClick={onClear}
        title="Limpar seleção (Esc)"
      >
        ✕
      </button>
    </div>
  );
}

/* ── Saved filter chips ───────────────────────────────────── */
function SavedFilters({ savedFilters, activeFilterId, onApply, onDelete, currentFilters, onSave }) {
  const [saving, setSaving] = useState(false);
  const [name, setName]     = useState('');

  const hasActiveFilter = Object.values(currentFilters).some(v => v !== '');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {savedFilters.map(f => (
        <span
          key={f.id}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full cursor-pointer transition-all"
          style={{
            background: activeFilterId === f.id ? 'var(--gold-500)' : 'var(--bg-surface)',
            color:      activeFilterId === f.id ? '#000' : 'var(--text-secondary)',
            border:     `1px solid ${activeFilterId === f.id ? 'var(--gold-500)' : 'var(--border-default)'}`,
          }}
          onClick={() => onApply(f)}
        >
          {f.name}
          <button
            className="ml-1 opacity-50 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
          >
            ×
          </button>
        </span>
      ))}

      {/* Save current filter */}
      {hasActiveFilter && !saving && (
        <button
          className="text-xs px-2.5 py-1 rounded-full transition-colors"
          style={{ color: 'var(--gold-400)', border: '1px dashed var(--gold-500)' }}
          onClick={() => setSaving(true)}
        >
          + Salvar filtro
        </button>
      )}
      {saving && (
        <div className="flex items-center gap-1">
          <input
            className="input text-xs py-1 px-2"
            placeholder="Nome do filtro…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) { onSave(name.trim()); setSaving(false); setName(''); }
              if (e.key === 'Escape') { setSaving(false); setName(''); }
            }}
            autoFocus
            style={{ width: 140 }}
          />
          <button
            className="btn-primary text-xs py-1 px-2"
            disabled={!name.trim()}
            onClick={() => { onSave(name.trim()); setSaving(false); setName(''); }}
          >
            OK
          </button>
          <button className="text-xs px-2" style={{ color: 'var(--text-muted)' }} onClick={() => { setSaving(false); setName(''); }}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ── WIP limit editor ─────────────────────────────────────── */
function WipModal({ open, onClose, stages, wipLimits, onSave }) {
  const [local, setLocal] = useState({ ...wipLimits });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="rounded-2xl p-5 w-80 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }} onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base mb-4" style={{ color: 'var(--text-primary)' }}>🔢 WIP Limits</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Defina o número máximo de leads por estágio. Exceder acende um alerta âmbar na coluna.</p>
        <div className="space-y-2">
          {stages.filter(s => !['fechado','perdido'].includes(s.id)).map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
              <input
                type="number"
                className="input w-20 text-sm py-1"
                value={local[s.id] || ''}
                placeholder="—"
                min={1}
                onChange={e => setLocal(prev => ({ ...prev, [s.id]: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm" onClick={() => { onSave(local); onClose(); }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Board ───────────────────────────────────────────── */
export default function KanbanBoard() {
  const [board, setBoard] = useState(() => Object.fromEntries(STAGES.map(s => [s.id, []])));
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debouncedSearch = useDebounce(filters.search, 250);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [pendingLoss, setPendingLoss] = useState(null);
  const [showNewLead, setShowNewLead] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectionMode = selectedIds.size > 0;

  // Keyboard focus
  const [focusedLeadId, setFocusedLeadId] = useState(null);

  // Density
  const [density, setDensity] = useState(() => localStorage.getItem('kanban_density') || 'comfortable');

  // Saved filters
  const [savedFilters, setSavedFilters]     = useState([]);
  const [activeFilterId, setActiveFilterId] = useState(null);

  // WIP limits
  const [wipLimits, setWipLimits]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('kanban_wip') || '{}'); } catch { return {}; }
  });
  const [wipModalOpen, setWipModalOpen] = useState(false);

  // Bulk action helpers
  const [tags, setTags]         = useState([]);
  const [cadences, setCadences] = useState([]);
  const [users, setUsers]       = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const load = useCallback(async () => {
    try {
      const data = await api.get('/crm/leads/kanban');
      const full = Object.fromEntries(STAGES.map(s => [s.id, data[s.id] || []]));
      setBoard(full);
    } catch (err) {
      toast.error('Erro ao carregar funil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load supplementary data for bulk actions
  useEffect(() => {
    Promise.all([
      api.get('/crm/tags').catch(() => []),
      api.get('/crm/cadences').catch(() => []),
      api.get('/crm/leads/users').catch(() => []),
      api.get('/crm/leads/filters/saved').catch(() => []),
    ]).then(([t, c, u, sf]) => {
      setTags(t);
      setCadences(Array.isArray(c) ? c : c.cadences || []);
      setUsers(u);
      setSavedFilters(sf);
    });
  }, []);

  useEffect(() => {
    const refresh = () => load();
    socket.on('crm:lead_created', refresh);
    socket.on('crm:lead_updated', refresh);
    return () => {
      socket.off('crm:lead_created', refresh);
      socket.off('crm:lead_updated', refresh);
    };
  }, [load]);

  // Save density to localStorage
  useEffect(() => {
    localStorage.setItem('kanban_density', density);
  }, [density]);

  function filtered(leads) {
    const term = debouncedSearch.trim().toLowerCase();
    return leads.filter(l => {
      if (filters.temperature && l.temperature !== filters.temperature) return false;
      if (filters.source && l.source !== filters.source) return false;
      if (filters.responsible_user_id && String(l.responsible_user_id) !== String(filters.responsible_user_id)) return false;
      if (filters.value_min && (l.potential_value || 0) < Number(filters.value_min)) return false;
      if (filters.value_max && (l.potential_value || 0) > Number(filters.value_max)) return false;
      if (filters.stale_days) {
        const days = staleDaysFor(l.last_interaction_at);
        if (days < Number(filters.stale_days)) return false;
      }
      if (!term) return true;
      return (l.name?.toLowerCase().includes(term) || l.phone.includes(term) || l.event_name?.toLowerCase().includes(term));
    });
  }

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      // Ignore when inside an input
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

      const all = STAGES.flatMap(s => filtered(board[s.id] || []));

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusedLeadId(prev => {
          const idx = all.findIndex(l => l.id === prev);
          const next = all[idx + 1] || all[0];
          return next?.id ?? null;
        });
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusedLeadId(prev => {
          const idx = all.findIndex(l => l.id === prev);
          const prev2 = idx <= 0 ? all[all.length - 1] : all[idx - 1];
          return prev2?.id ?? null;
        });
      } else if (e.key === 'e' || e.key === 'E') {
        if (focusedLeadId) setSelectedLeadId(focusedLeadId);
      } else if (e.key === 'm' || e.key === 'M') {
        if (focusedLeadId) {
          // Cycle to next stage
          const lead = all.find(l => l.id === focusedLeadId);
          if (lead) {
            const stageIds = STAGES.map(s => s.id).filter(s => !['fechado','perdido'].includes(s));
            const idx = stageIds.indexOf(lead.stage);
            const nextStage = stageIds[(idx + 1) % stageIds.length];
            api.put(`/crm/leads/${focusedLeadId}/stage`, { stage: nextStage })
              .then(() => { toast.success(`Movido → ${STAGE_BY_ID[nextStage].label}`); load(); })
              .catch(() => toast.error('Erro ao mover'));
          }
        }
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setFocusedLeadId(null);
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNewLead(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [board, focusedLeadId, debouncedSearch, filters, load]);

  // Scroll focused card into view
  useEffect(() => {
    if (!focusedLeadId) return;
    const el = document.querySelector(`[data-lead-id="${focusedLeadId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedLeadId]);

  /* ── Selection helpers ── */
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  /* ── Bulk actions ── */
  const bulkMove = async (stage) => {
    try {
      const res = await api.post('/crm/leads/bulk/move', { lead_ids: [...selectedIds], stage });
      toast.success(`${res.updated} leads movidos para "${STAGE_BY_ID[stage].label}"`);
      clearSelection(); load();
    } catch { toast.error('Erro ao mover leads'); }
  };

  const bulkTag = async (tag_id) => {
    try {
      await api.post('/crm/leads/bulk/tag', { lead_ids: [...selectedIds], tag_id });
      const tag = tags.find(t => t.id === tag_id);
      toast.success(`Tag "${tag?.name}" aplicada a ${selectedIds.size} lead${selectedIds.size !== 1 ? 's' : ''}`);
      clearSelection(); load();
    } catch { toast.error('Erro ao aplicar tag'); }
  };

  const bulkCadence = async (cadence_id) => {
    try {
      const res = await api.post('/crm/leads/bulk/cadence', { lead_ids: [...selectedIds], cadence_id });
      const cad = cadences.find(c => c.id === cadence_id);
      toast.success(`${res.enrolled} leads enrollados em "${cad?.name}"`);
      clearSelection(); load();
    } catch { toast.error('Erro ao enroll em cadência'); }
  };

  const bulkAssign = async (assignee_user_id) => {
    try {
      await api.post('/crm/leads/bulk/assign', { lead_ids: [...selectedIds], assignee_user_id });
      const user = users.find(u => String(u.id) === String(assignee_user_id));
      toast.success(`${selectedIds.size} leads atribuídos a "${user?.name || user?.username}"`);
      clearSelection(); load();
    } catch { toast.error('Erro ao atribuir'); }
  };

  /* ── Saved filters ── */
  const applyFilter = (f) => {
    setFilters({ ...EMPTY_FILTERS, ...f.filters });
    setActiveFilterId(f.id);
  };

  const deleteFilter = async (id) => {
    try {
      await api.delete(`/crm/leads/filters/saved/${id}`);
      setSavedFilters(prev => prev.filter(f => f.id !== id));
      if (activeFilterId === id) { setActiveFilterId(null); setFilters(EMPTY_FILTERS); }
    } catch { toast.error('Erro ao deletar filtro'); }
  };

  const saveFilter = async (name) => {
    try {
      const f = await api.post('/crm/leads/filters/saved', { name, filters });
      setSavedFilters(prev => [f, ...prev]);
      setActiveFilterId(f.id);
      toast.success(`Filtro "${name}" salvo`);
    } catch { toast.error('Erro ao salvar filtro'); }
  };

  /* ── WIP limits ── */
  const saveWipLimits = (limits) => {
    setWipLimits(limits);
    localStorage.setItem('kanban_wip', JSON.stringify(limits));
    toast.success('WIP limits salvos');
  };

  /* ── DnD handlers ── */
  const findContainer = (id) => {
    if (STAGE_BY_ID[id]) return id;
    for (const [stage, leads] of Object.entries(board)) {
      if (leads.some(l => String(l.id) === String(id))) return stage;
    }
    return null;
  };

  const handleDragStart = (event) => { if (!selectionMode) setActiveId(event.active.id); };

  const handleDragOver = (event) => {
    if (selectionMode) return;
    const { active, over } = event;
    if (!over) return;
    const fromStage = findContainer(active.id);
    const toStage   = findContainer(over.id);
    if (!fromStage || !toStage || fromStage === toStage) return;
    setBoard(prev => {
      const fromList = prev[fromStage].filter(l => String(l.id) !== String(active.id));
      const movedLead = prev[fromStage].find(l => String(l.id) === String(active.id));
      if (!movedLead) return prev;
      return { ...prev, [fromStage]: fromList, [toStage]: [...prev[toStage], { ...movedLead, stage: toStage }] };
    });
  };

  const handleDragEnd = async (event) => {
    if (selectionMode) return;
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const toStage = findContainer(over.id);
    if (!toStage) return;
    const lead = board[toStage].find(l => String(l.id) === String(active.id));
    if (!lead) return;

    let newPosition = board[toStage].findIndex(l => String(l.id) === String(active.id));
    if (over.id !== toStage) {
      const overIdx = board[toStage].findIndex(l => String(l.id) === String(over.id));
      if (overIdx >= 0) {
        setBoard(prev => ({
          ...prev,
          [toStage]: arrayMove(prev[toStage],
            prev[toStage].findIndex(l => String(l.id) === String(active.id)),
            overIdx)
        }));
        newPosition = overIdx;
      }
    }

    if (toStage === 'perdido' && lead.stage !== 'perdido') {
      setPendingLoss({ leadId: lead.id, previousStage: lead.stage });
      return;
    }

    try {
      await api.put(`/crm/leads/${lead.id}/stage`, { stage: toStage, position: newPosition });
      toast.success(`Movido para "${STAGE_BY_ID[toStage].label}"`);
    } catch (err) {
      toast.error('Erro ao mover lead');
      load();
    }
  };

  const handleLossSave = async ({ reason, detail }) => {
    if (!pendingLoss) return;
    try {
      await api.post(`/crm/leads/${pendingLoss.leadId}/lose`, { reason, detail });
      toast.success('Lead marcado como perdido');
      setPendingLoss(null); load();
    } catch { toast.error('Erro ao registrar perda'); }
  };

  const activeLead = activeId
    ? Object.values(board).flat().find(l => String(l.id) === String(activeId))
    : null;

  // Enrich stages with accent colors
  const enrichedStages = STAGES.map(s => ({ ...s, accentColor: STAGE_ACCENT[s.id] || 'var(--gold-500)' }));

  return (
    <div className="h-full flex flex-col gap-3">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h1 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
          🗂️ Funil de Leads
        </h1>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Keyboard hint */}
          <span className="hidden md:flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-surface-2)' }}>J/K</kbd> nav
            <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-surface-2)' }}>E</kbd> edit
            <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-surface-2)' }}>M</kbd> mover
            <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-surface-2)' }}>N</kbd> novo
          </span>

          {/* Density */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
            {DENSITY_OPTIONS.map(d => (
              <button
                key={d.id}
                onClick={() => setDensity(d.id)}
                title={d.label}
                className="px-2 py-1.5 text-xs transition-colors"
                style={{
                  background: density === d.id ? 'var(--gold-500)' : 'transparent',
                  color: density === d.id ? '#000' : 'var(--text-muted)',
                }}
              >
                {d.label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* WIP limits */}
          <button
            className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            onClick={() => setWipModalOpen(true)}
            title="Configurar WIP limits"
          >
            🔢 WIP
          </button>

          <button
            onClick={() => setShowNewLead(true)}
            className="btn-primary text-sm"
          >
            + Novo Lead
          </button>
        </div>
      </div>

      {/* ── Saved filter chips ── */}
      {(savedFilters.length > 0 || Object.values(filters).some(v => v !== '')) && (
        <div className="shrink-0">
          <SavedFilters
            savedFilters={savedFilters}
            activeFilterId={activeFilterId}
            onApply={applyFilter}
            onDelete={deleteFilter}
            currentFilters={filters}
            onSave={saveFilter}
          />
        </div>
      )}

      {/* ── Filter panel ── */}
      <div className="shrink-0">
        <FilterPanel
          filters={filters}
          onChange={(f) => { setFilters(f); setActiveFilterId(null); }}
          showStage={false}
          showSort={false}
        />
      </div>

      {/* ── Board ── */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          Carregando funil…
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
            {enrichedStages.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={filtered(board[stage.id] || [])}
                onCardClick={(l) => setSelectedLeadId(l.id)}
                selectedIds={selectedIds}
                onSelect={toggleSelect}
                selectionMode={selectionMode}
                wipLimit={wipLimits[stage.id]}
                density={density}
                focusedLeadId={focusedLeadId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead && (
              <div className="w-72">
                <LeadCard lead={activeLead} density={density} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Bulk action bar ── */}
      {selectionMode && (
        <BulkActionBar
          count={selectedIds.size}
          stages={STAGES}
          tags={tags}
          cadences={cadences}
          users={users}
          onMove={bulkMove}
          onTag={bulkTag}
          onCadence={bulkCadence}
          onAssign={bulkAssign}
          onClear={clearSelection}
        />
      )}

      {/* ── Modals ── */}
      {selectedLeadId && (
        <LeadDrawer
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUpdate={load}
        />
      )}

      {pendingLoss && (
        <LossReasonModal
          onConfirm={handleLossSave}
          onCancel={() => { setPendingLoss(null); load(); }}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onCreated={() => { setShowNewLead(false); load(); }}
        />
      )}

      <WipModal
        open={wipModalOpen}
        onClose={() => setWipModalOpen(false)}
        stages={STAGES}
        wipLimits={wipLimits}
        onSave={saveWipLimits}
      />
    </div>
  );
}
