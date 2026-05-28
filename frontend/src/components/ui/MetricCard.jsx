import React from 'react';

/**
 * MetricCard — KPI card with large gold value, optional trend indicator and sparkline.
 *
 * Props:
 *  label       {string}  — small uppercase label above the value
 *  value       {*}       — main display value (string or number)
 *  sub         {string}  — optional subtitle below value
 *  icon        {string}  — emoji icon (top-right)
 *  trend       {number}  — % change vs previous period (positive = up, negative = down)
 *  trendLabel  {string}  — label after the trend badge ("vs mês anterior")
 *  color       {string}  — override value color (default: gold-400)
 *  onClick     {fn}      — optional click handler
 */
export function MetricCard({ label, value, sub, icon, trend, trendLabel, color, onClick }) {
  const isUp = trend > 0;
  const isDown = trend < 0;

  return (
    <div
      className="card flex flex-col gap-1 select-none"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </p>
        {icon && <span className="text-xl shrink-0 leading-none">{icon}</span>}
      </div>

      {/* Main value */}
      <p
        className="text-3xl font-bold font-display leading-none mt-1"
        style={{ color: color || 'var(--gold-400)' }}
      >
        {value ?? '—'}
      </p>

      {/* Subtitle */}
      {sub && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {sub}
        </p>
      )}

      {/* Trend */}
      {trend !== undefined && trend !== null && (
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className="text-xs font-semibold"
            style={{ color: isUp ? '#10B981' : isDown ? '#EF4444' : 'var(--text-muted)' }}
          >
            {isUp ? '▲' : isDown ? '▼' : '●'} {Math.abs(trend)}%
          </span>
          {trendLabel && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {trendLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
