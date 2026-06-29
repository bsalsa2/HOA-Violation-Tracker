import React, { useEffect, useRef, useState } from 'react'

/** Donut chart. data: [{ label, value, color }] */
export function DonutChart({ data = [], size = 168, thickness = 20, centerLabel, centerValue }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])

  const total = data.reduce((sum, d) => sum + (d.value || 0), 0)
  const radius = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const gap = total > 0 ? 1.5 : 0 // tiny gap between segments

  let offset = 0
  const segments = total > 0
    ? data.filter((d) => d.value > 0).map((d) => {
        const fraction = d.value / total
        const len = Math.max(0, fraction * circumference - gap)
        const seg = { ...d, dash: len, offset }
        offset += fraction * circumference
        return seg
      })
    : []

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            {segments.map((s, i) => (
              <linearGradient key={i} id={`donut-${i}-${s.color.replace('#', '')}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.85" />
                <stop offset="100%" stopColor={s.color} stopOpacity="1" />
              </linearGradient>
            ))}
          </defs>
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={`url(#donut-${i}-${s.color.replace('#', '')})`}
              strokeWidth={thickness}
              strokeDasharray={`${mounted ? s.dash : 0} ${circumference - (mounted ? s.dash : 0)}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1)', transitionDelay: `${i * 0.08}s`, filter: `drop-shadow(0 0 5px ${s.color}40)` }}
            />
          ))}
        </svg>
        {centerValue !== undefined && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold text-white leading-none tabular tracking-tight">{centerValue}</span>
            {centerLabel && <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{centerLabel}</span>}
          </div>
        )}
      </div>
      <div className="space-y-2 min-w-0 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}66` }} />
            <span className="text-slate-400 capitalize truncate">{d.label}</span>
            <span className="text-slate-100 font-semibold ml-auto tabular">{d.value}</span>
          </div>
        ))}
        {total === 0 && <p className="text-xs text-slate-600">No data yet</p>}
      </div>
    </div>
  )
}

/** Horizontal bar list. data: [{ label, value }] */
export function BarList({ data = [], color = '#3b82f6', maxRows = 8 }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  const rows = data.slice(0, maxRows)
  const max = Math.max(1, ...rows.map((d) => d.value || 0))
  if (rows.length === 0) return <p className="text-xs text-slate-600 py-4">No data yet</p>
  return (
    <div className="space-y-3">
      {rows.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-300 truncate pr-2">{d.label}</span>
            <span className="text-slate-500 shrink-0 tabular">{d.value}</span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: mounted ? `${(d.value / max) * 100}%` : '0%',
                background: `linear-gradient(90deg, ${color}99, ${color})`,
                boxShadow: `0 0 10px ${color}55`,
                transition: 'width 0.9s cubic-bezier(0.16,1,0.3,1)',
                transitionDelay: `${i * 0.05}s`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Build a smooth (Catmull-Rom → bezier) path through points. */
function smoothPath(points) {
  if (points.length < 2) return ''
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** Monthly trend as smooth gradient area lines. data: [{ month, new, resolved }] */
export function TrendChart({ data = [], height = 150 }) {
  const pathRefs = useRef([])
  const W = 320
  const H = height
  const padX = 6
  const padTop = 12
  const padBottom = 26
  const max = Math.max(1, ...data.flatMap((d) => [d.new || 0, d.resolved || 0]))
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW

  const toPoints = (key) => data.map((d, i) => [padX + i * step, padTop + innerH - ((d[key] || 0) / max) * innerH])

  const series = [
    { key: 'new', color: '#60a5fa', label: 'New' },
    { key: 'resolved', color: '#34d399', label: 'Resolved' },
  ]

  useEffect(() => {
    pathRefs.current.forEach((p) => {
      if (!p) return
      const len = p.getTotalLength()
      p.style.transition = 'none'
      p.style.strokeDasharray = `${len}`
      p.style.strokeDashoffset = `${len}`
      // force reflow then animate
      void p.getBoundingClientRect()
      p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)'
      p.style.strokeDashoffset = '0'
    })
  }, [data])

  if (data.length === 0) return <p className="text-xs text-slate-600 py-4">No data yet</p>

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {/* faint baseline */}
        <line x1={padX} y1={padTop + innerH} x2={W - padX} y2={padTop + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {series.map((s, si) => {
          const pts = toPoints(s.key)
          const line = smoothPath(pts)
          const area = `${line} L${pts[pts.length - 1][0]},${padTop + innerH} L${pts[0][0]},${padTop + innerH} Z`
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#area-${s.key})`} />
              <path
                ref={(el) => (pathRefs.current[si] = el)}
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={s.color} opacity={i === pts.length - 1 ? 1 : 0.5} />
              ))}
            </g>
          )
        })}
      </svg>
      <div className="flex items-center justify-between mt-1 px-1">
        {data.map((d, i) => (
          <span key={i} className="text-[10px] text-slate-500">{d.month}</span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 justify-center">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}66` }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
