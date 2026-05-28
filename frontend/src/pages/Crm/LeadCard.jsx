import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { TEMPERATURE } from './stages';
import { calcScore, scoreColor } from './scoreUtils';

function timeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatNextFollowup(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function staleDays(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function LeadCard({ lead, onClick, selected, onSelect, selectionMode, density = 'comfortable', focused }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(lead.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const temp = TEMPERATURE[lead.temperature] || TEMPERATURE.morno;
  const nextFu = formatNextFollowup(lead.next_followup_at);
  const isActive = lead.stage !== 'fechado' && lead.stage !== 'perdido';
  const days = isActive ? staleDays(lead.last_interaction_at) : 0;

  const borderColor = selected
    ? 'var(--gold-500)'
    : focused
    ? 'var(--gold-400)'
    : days >= 7
    ? 'rgba(239,68,68,0.6)'
    : days >= 3
    ? 'rgba(245,158,11,0.5)'
    : 'var(--border-default)';

  const score = calcScore(lead);
  const sc = scoreColor(score);
  const isCompact = density === 'compact';

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(lead.id);
  };

  const handleCardClick = (e) => {
    if (isDragging) return;
    e.stopPropagation();
    if (selectionMode) {
      onSelect?.(lead.id);
    } else {
      onClick?.(lead);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: `1px solid ${borderColor}`,
        boxShadow: focused ? `0 0 0 2px var(--gold-400)` : selected ? `0 0 0 2px var(--gold-500)` : undefined,
        background: selected ? 'var(--gold-500)18' : 'var(--bg-surface)',
        borderRadius: 8,
        padding: isCompact ? '6px 8px' : '10px 12px',
        cursor: 'grab',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        position: 'relative',
      }}
      {...attributes}
      {...(selectionMode ? {} : listeners)}
      onClick={handleCardClick}
      data-lead-id={lead.id}
      className="group"
    >
      {/* Checkbox — visible on hover or in selection mode */}
      <div
        className={`absolute top-2 left-2 z-10 transition-opacity ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ pointerEvents: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleCheckboxClick}
      >
        <div
          style={{
            width: 16, height: 16,
            borderRadius: 4,
            border: `2px solid ${selected ? 'var(--gold-500)' : 'var(--border-strong)'}`,
            background: selected ? 'var(--gold-500)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {selected && <span style={{ color: '#000', fontSize: 10, lineHeight: 1, fontWeight: 'bold' }}>✓</span>}
        </div>
      </div>

      {/* Card content — shifted right when checkbox could appear */}
      <div style={{ paddingLeft: selectionMode ? 20 : 0 }}>
        {/* Row 1: name + badges */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <p
            className="text-sm font-semibold truncate flex-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {lead.name || lead.phone}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {days >= 7 && <span title={`Parado há ${days}d`} className="text-[10px]">🔴</span>}
            {days >= 3 && days < 7 && <span title={`Parado há ${days}d`} className="text-[10px]">⚠️</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${temp.chip}`}>{temp.label}</span>
          </div>
        </div>

        {/* Phone (when name shown) */}
        {!isCompact && lead.name && (
          <p className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>📱 {lead.phone}</p>
        )}

        {/* Responsible */}
        {!isCompact && lead.responsible_user_name && (
          <p className="text-[10px] mb-1" style={{ color: '#60A5FA' }}>👤 {lead.responsible_user_name}</p>
        )}

        {/* Event / city */}
        {!isCompact && (lead.event_name || lead.city) && (
          <div className="text-xs mb-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {lead.event_name && <span>🎤 {lead.event_name}</span>}
            {lead.event_name && lead.city && <span> · </span>}
            {lead.city && <span>📍 {lead.city}</span>}
          </div>
        )}

        {/* Tags */}
        {!isCompact && !!(lead.tags?.length) && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {lead.tags.slice(0, 3).map(t => (
              <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded"
                style={{ background: t.color + '33', color: t.color }}>
                {t.name}
              </span>
            ))}
            {lead.tags.length > 3 && (
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                +{lead.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer row */}
        <div
          className="flex items-center justify-between text-[10px] pt-1.5"
          style={{ borderTop: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
        >
          <span title="Última interação">⏱ {timeAgo(lead.last_interaction_at)}</span>
          <div className="flex items-center gap-1.5">
            {lead.potential_value > 0 && (
              <span style={{ color: '#10B981' }}>
                R$ {Number(lead.potential_value).toLocaleString('pt-BR')}
              </span>
            )}
            {lead.ai?.score != null ? (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: lead.ai.score >= 70 ? '#D4AF3733' : lead.ai.score >= 40 ? '#F59E0B22' : '#6B728022',
                  color:      lead.ai.score >= 70 ? '#D4AF37'   : lead.ai.score >= 40 ? '#F59E0B'   : '#9CA3AF',
                }}
                title={`IA: ${lead.ai.score}/100 — ${lead.ai.score_reason || ''}`}
              >
                🤖 {lead.ai.score}
              </span>
            ) : (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sc.text}`}
                style={{ background: 'var(--bg-surface-2)' }}
                title={`Score: ${score}/100`}
              >
                ★ {score}
              </span>
            )}
          </div>
        </div>

        {/* AI next step */}
        {lead.ai?.next_step_text && (
          <div
            className="text-[10px] mt-1.5 px-2 py-1 rounded-md truncate"
            style={{ background: '#D4AF3715', color: '#D4AF37' }}
            title={lead.ai.next_step_text}
          >
            ✨ {lead.ai.next_step_text}
          </div>
        )}

        {/* Next follow-up (only if no AI step) */}
        {!lead.ai?.next_step_text && nextFu && !isCompact && (
          <div className="text-[10px] mt-1" style={{ color: '#F97316' }}>
            📨 {nextFu}
          </div>
        )}

        {/* Link para timeline — aparece no hover */}
        {!isCompact && (
          <button
            onClick={e => { e.stopPropagation(); navigate(`/crm/lead/${lead.id}`); }}
            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded transition-all"
            style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
            title="Ver timeline completa"
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}
