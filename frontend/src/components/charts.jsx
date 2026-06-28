import React from 'react'

/** Donut chart. data: [{ label, value, color }] */
export function DonutChart({ data = [], size = 160, thickness = 22, centerLabel, centerValue }) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0)
  const radius = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const segments = total > 0
    ? data.filter((d) => d.value > 0).map((d) => {
        const fraction = d.value / total
        const seg = { ...d, dash: fraction * circumference, offset }
        offset += fraction * circumference
        return seg
      })
    : []

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1e293b" strokeWidth={thickness} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
        {centerValue !== undefined && (
          <g className="rotate-90" style={{ transformOrigin: 'center' }}>
            <text x={cx} y={cy - 2} textAnchor="middle" className="fill-white" style={{ fontSize: 24, fontWeight: 700 }}>
              {centerValue}
            </text>
            {centerLabel && (
              <text x={cx} y={cy + 16} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
                {centerLabel}
              </text>
            )}
          </g>
        )}
      </svg>
      <div className="space-y-1.5 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-slate-400 capitalize truncate">{d.label}</span>
            <span className="text-slate-200 font-medium ml-auto">{d.value}</span>
          </div>
        ))}
        {total === 0 && <p className="text-xs text-slate-600">No data yet</p>}
      </div>
    </div>
  )
}

/** Horizontal bar list. data: [{ label, value }] */
export function BarList({ data = [], color = '#3b82f6', maxRows = 8 }) {
  const rows = data.slice(0, maxRows)
  const max = Math.max(1, ...rows.map((d) => d.value || 0))
  if (rows.length === 0) return <p className="text-xs text-slate-600 py-4">No data yet</p>
  return (
    <div className="space-y-2.5">
      {rows.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-300 truncate pr-2">{d.label}</span>
            <span className="text-slate-500 shrink-0">{d.value}</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Grouped monthly bars. data: [{ month, new, resolved }] */
export function TrendChart({ data = [], height = 140 }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.new || 0, d.resolved || 0]))
  const barAreaH = height - 24
  return (
    <div>
      <div className="flex items-end justify-between gap-3" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
            <div className="flex items-end gap-1 h-full w-full justify-center">
              <div
                className="w-2.5 rounded-t bg-blue-500 transition-all"
                style={{ height: `${((d.new || 0) / max) * barAreaH}px`, minHeight: d.new ? 3 : 0 }}
                title={`${d.new} new`}
              />
              <div
                className="w-2.5 rounded-t bg-green-500 transition-all"
                style={{ height: `${((d.resolved || 0) / max) * barAreaH}px`, minHeight: d.resolved ? 3 : 0 }}
                title={`${d.resolved} resolved`}
              />
            </div>
            <span className="text-[10px] text-slate-500">{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 justify-center">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> New
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Resolved
        </span>
      </div>
    </div>
  )
}
