import React from 'react'
import { DonutChart, BarList, TrendChart } from './charts'
import { Spinner } from './primitives'
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../lib/constants'
import { currency } from '../lib/format'

function KpiCard({ label, value, accent = 'text-white', sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-slate-500 text-xs mt-1">{label}</p>
      {sub && <p className="text-slate-600 text-[11px] mt-0.5">{sub}</p>}
    </div>
  )
}

function Panel({ title, children, action }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function OverviewTab({ analytics, loading, onOpenResident }) {
  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Spinner className="w-5 h-5" />
        <span className="ml-2 text-sm">Loading analytics…</span>
      </div>
    )
  }
  if (!analytics) return null

  const k = analytics.kpis
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
        <KpiCard label="Open Cases" value={k.open_violations} accent="text-amber-400" />
        <KpiCard label="Overdue" value={k.overdue_violations} accent={k.overdue_violations > 0 ? 'text-red-400' : 'text-slate-300'} />
        <KpiCard label="Resolution Rate" value={`${k.resolution_rate}%`} accent="text-green-400" />
        <KpiCard label="Avg. Days to Resolve" value={k.avg_days_to_resolve} accent="text-blue-400" sub="from open to resolved" />
        <KpiCard label="Outstanding Fines" value={currency(k.outstanding_fines)} accent="text-rose-400" />
        <KpiCard label="Collected Fines" value={currency(k.collected_fines)} accent="text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Violation Trend (6 mo)">
          <TrendChart data={analytics.timeline || []} />
        </Panel>

        <Panel title="By Status">
          <DonutChart
            data={statusData}
            centerValue={k.total_violations}
            centerLabel="total"
          />
        </Panel>

        <Panel title="By Priority">
          <DonutChart data={priorityData} centerValue={k.open_violations} centerLabel="active" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Most Common Violation Types">
          <BarList data={analytics.by_type || []} color="#3b82f6" />
        </Panel>

        <Panel title="Repeat Offenders">
          {(analytics.top_offenders || []).length === 0 ? (
            <p className="text-xs text-slate-600 py-4">No violations recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {analytics.top_offenders.map((o) => (
                <button
                  key={o.resident_id}
                  onClick={() => onOpenResident?.(o.resident_id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{o.name}</p>
                    <p className="text-xs text-slate-500">{o.unit}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {o.open > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {o.open} active
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">
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
