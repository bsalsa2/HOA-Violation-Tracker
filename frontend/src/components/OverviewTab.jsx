import React from 'react'
import { CountUp, Skeleton } from './primitives'
import { currency } from '../lib/format'

function KpiCard({ label, value, tone = '', delay = '' }) {
  return (
    <div className={`border border-white/10 rounded-lg p-5 anim-rise ${delay}`}>
      <p className="text-slate-400 text-xs font-medium mb-2">{label}</p>
      <p className={`text-3xl leading-none font-bold ${tone || 'text-slate-100'}`}>
        <CountUp value={value} />
      </p>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-5">
            <Skeleton className="w-24 h-3 mb-3" />
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

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Open Cases" value={k.open_violations} delay="stagger-1" />
        <KpiCard label="Overdue" value={k.overdue_violations} tone={k.overdue_violations > 0 ? 'text-red-400' : ''} delay="stagger-2" />
        <KpiCard label="Resolution Rate" value={`${k.resolution_rate}%`} delay="stagger-3" />
        <KpiCard label="Outstanding Fines" value={currency(k.outstanding_fines)} tone={k.outstanding_fines > 0 ? 'text-amber-400' : ''} delay="stagger-4" />
      </div>

      {/* Top Offenders */}
      {(analytics.top_offenders || []).length > 0 && (
        <div className="border border-white/10 rounded-lg p-5 anim-rise stagger-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Residents</h3>
          <div className="space-y-2">
            {analytics.top_offenders.slice(0, 5).map((o, i) => (
              <button
                key={o.resident_id}
                onClick={() => onOpenResident?.(o.resident_id)}
                className="w-full flex items-center justify-between p-2.5 rounded hover:bg-white/[0.06] transition-colors text-left text-sm"
              >
                <span className="text-slate-300">{o.name}</span>
                <span className="text-slate-400">{o.total} violations</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
