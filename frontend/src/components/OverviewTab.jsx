import React from 'react'
import { DonutChart, BarList, TrendChart } from './charts'
import { CountUp, Sparkline, Skeleton } from './primitives'
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../lib/constants'
import { currency } from '../lib/format'

const TONES = {
  gold: { text: 'text-[#e0c78f]', rail: 'from-[#e3c98e] to-[#b08d57]', chip: 'bg-[#caa96b]/12 text-[#dcc08a] ring-[#caa96b]/25', spark: '#caa96b' },
  clay: { text: 'text-[#d4988a]', rail: 'from-[#d4988a] to-[#a5604f]', chip: 'bg-[#c17b6a]/12 text-[#d4988a] ring-[#c17b6a]/25', spark: '#c17b6a' },
  sage: { text: 'text-[#a8c3a3]', rail: 'from-[#a8c3a3] to-[#6f9069]', chip: 'bg-[#8fae8b]/12 text-[#a8c3a3] ring-[#8fae8b]/25', spark: '#8fae8b' },
  stone: { text: 'text-[#c4bdb0]', rail: 'from-[#c4bdb0] to-[#7c766a]', chip: 'bg-[#9a948a]/12 text-[#c4bdb0] ring-[#9a948a]/25', spark: '#a8a194' },
  // legacy aliases → mapped to the luxe set
  amber: { text: 'text-[#e0c78f]', rail: 'from-[#e3c98e] to-[#b08d57]', chip: 'bg-[#caa96b]/12 text-[#dcc08a] ring-[#caa96b]/25', spark: '#caa96b' },
  red: { text: 'text-[#d4988a]', rail: 'from-[#d4988a] to-[#a5604f]', chip: 'bg-[#c17b6a]/12 text-[#d4988a] ring-[#c17b6a]/25', spark: '#c17b6a' },
  green: { text: 'text-[#a8c3a3]', rail: 'from-[#a8c3a3] to-[#6f9069]', chip: 'bg-[#8fae8b]/12 text-[#a8c3a3] ring-[#8fae8b]/25', spark: '#8fae8b' },
  blue: { text: 'text-[#c4bdb0]', rail: 'from-[#c4bdb0] to-[#7c766a]', chip: 'bg-[#9a948a]/12 text-[#c4bdb0] ring-[#9a948a]/25', spark: '#a8a194' },
  rose: { text: 'text-[#d4988a]', rail: 'from-[#d4988a] to-[#a5604f]', chip: 'bg-[#c17b6a]/12 text-[#d4988a] ring-[#c17b6a]/25', spark: '#c17b6a' },
  slate: { text: 'text-[#c4bdb0]', rail: 'from-[#c4bdb0] to-[#7c766a]', chip: 'bg-[#9a948a]/12 text-[#c4bdb0] ring-[#9a948a]/25', spark: '#a8a194' },
}

const ICONS = {
  open: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  overdue: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  rate: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  fineDue: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  fineGot: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
}

function KpiCard({ label, value, tone = 'slate', iconKey, sub, trend, delay = '' }) {
  const t = TONES[tone] || TONES.slate
  return (
    <div className={`vt-card vt-card-interactive overflow-hidden p-4 anim-rise ${delay}`}>
      {/* accent rail */}
      <div className={`absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b ${t.rail} opacity-80`} />
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ring-1 ${t.chip}`}>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS[iconKey] || ICONS.open} />
          </svg>
        </div>
        {trend && trend.length > 1 && <Sparkline data={trend} color={t.spark} className="opacity-90" />}
      </div>
      <p className={`text-[26px] leading-none font-bold tracking-tight mt-3 ${t.text}`}>
        <CountUp value={value} />
      </p>
      <p className="text-slate-400 text-xs mt-1.5 font-medium">{label}</p>
      {sub && <p className="text-slate-600 text-[11px] mt-0.5">{sub}</p>}
    </div>
  )
}

function Panel({ title, children, action, className = '' }) {
  return (
    <div className={`vt-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200 tracking-tight">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="vt-card p-4">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <Skeleton className="w-16 h-7 mt-3" />
            <Skeleton className="w-20 h-3 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="vt-card p-5">
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-full h-36 mt-4 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OverviewTab({ analytics, loading, onOpenResident }) {
  if (loading && !analytics) return <OverviewSkeleton />
  if (!analytics) return null

  const k = analytics.kpis
  const timeline = analytics.timeline || []
  const newTrend = timeline.map((d) => d.new || 0)
  const resolvedTrend = timeline.map((d) => d.resolved || 0)

  const statusData = (analytics.by_status || []).map((s) => ({
    label: STATUS_CONFIG[s.label]?.label || s.label,
    value: s.value,
    color: STATUS_CONFIG[s.label]?.dot || '#64748b',
  }))
  const priorityData = (analytics.by_priority || []).map((p) => ({
    label: PRIORITY_CONFIG[p.label]?.label || p.label,
    value: p.value,
    color: PRIORITY_CONFIG[p.label]?.dot || '#64748b',
  }))

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard label="Open Cases" value={k.open_violations} tone="gold" iconKey="open" trend={newTrend} delay="stagger-1" />
        <KpiCard label="Overdue" value={k.overdue_violations} tone={k.overdue_violations > 0 ? 'clay' : 'stone'} iconKey="overdue" delay="stagger-2" />
        <KpiCard label="Resolution Rate" value={`${k.resolution_rate}%`} tone="sage" iconKey="rate" trend={resolvedTrend} delay="stagger-3" />
        <KpiCard label="Avg. Days to Resolve" value={k.avg_days_to_resolve} tone="stone" iconKey="clock" sub="open → resolved" delay="stagger-4" />
        <KpiCard label="Outstanding Fines" value={currency(k.outstanding_fines)} tone="clay" iconKey="fineDue" delay="stagger-5" />
        <KpiCard label="Collected Fines" value={currency(k.collected_fines)} tone="sage" iconKey="fineGot" delay="stagger-6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Violation Trend · 6 months" className="anim-rise stagger-2">
          <TrendChart data={timeline} />
        </Panel>

        <Panel title="By Status" className="anim-rise stagger-3">
          <DonutChart data={statusData} centerValue={k.total_violations} centerLabel="total" />
        </Panel>

        <Panel title="By Priority" className="anim-rise stagger-4">
          <DonutChart data={priorityData} centerValue={k.open_violations} centerLabel="active" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Most Common Violation Types" className="anim-rise stagger-3">
          <BarList data={analytics.by_type || []} color="#caa96b" />
        </Panel>

        <Panel title="Repeat Offenders" className="anim-rise stagger-4">
          {(analytics.top_offenders || []).length === 0 ? (
            <p className="text-xs text-slate-600 py-4">No violations recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {analytics.top_offenders.map((o, i) => (
                <button
                  key={o.resident_id}
                  onClick={() => onOpenResident?.(o.resident_id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center text-[11px] font-semibold text-slate-400 shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate group-hover:text-white transition-colors">{o.name}</p>
                      <p className="text-xs text-slate-500">{o.unit}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {o.open > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#caa96b]/12 text-[#d8be86] border border-[#caa96b]/25">
                        {o.open} active
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                      {o.total} total
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
