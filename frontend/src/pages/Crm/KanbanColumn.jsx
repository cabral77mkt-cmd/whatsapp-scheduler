import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import LeadCard from './LeadCard';

export default function KanbanColumn({
  stage, leads, onCardClick,
  selectedIds, onSelect, selectionMode,
  wipLimit, density, focusedLeadId,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const ids = leads.map(l => String(l.id));
  const totalValue = leads.reduce((sum, l) => sum + (Number(l.potential_value) || 0), 0);

  const overWip = wipLimit && leads.length > wipLimit;

  return (
    <div
      className="flex flex-col w-72 shrink-0 rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${overWip ? '#F59E0B' : 'var(--border-default)'}`,
        boxShadow: overWip ? '0 0 0 1px #F59E0B66' : undefined,
      }}
    >
      {/* Column header */}
      <div
        className="p-3 shrink-0"
        style={{
          borderBottom: '1px solid var(--border-default)',
          borderTop: `3px solid ${stage.accentColor || 'var(--gold-500)'}`,
          background: 'var(--bg-surface-2)',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {stage.label}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {overWip && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: '#F59E0B22', color: '#F59E0B' }}
                title={`WIP limit: ${wipLimit}`}
              >
                WIP {leads.length}/{wipLimit}
              </span>
            )}
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
            >
              {leads.length}
            </span>
          </div>
        </div>
        {totalValue > 0 && (
          <p className="text-xs font-medium" style={{ color: '#10B981' }}>
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        )}
      </div>

      {/* Card list */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] ${isOver ? 'bg-[var(--gold-500)]/5' : ''}`}
        style={{ maxHeight: 'calc(100dvh - 220px)' }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={onCardClick}
              selected={selectedIds?.has(String(lead.id))}
              onSelect={onSelect}
              selectionMode={selectionMode}
              density={density}
              focused={focusedLeadId === lead.id}
            />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div
            className="text-center text-xs py-8 italic"
            style={{ color: 'var(--text-disabled)' }}
          >
            vazio
          </div>
        )}
      </div>
    </div>
  );
}
