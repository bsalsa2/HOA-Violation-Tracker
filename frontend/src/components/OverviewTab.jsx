import React, { useState, useEffect, useMemo } from 'react'
import { CountUp, Skeleton, Badge } from './primitives'
import { STATUS_CONFIG } from '../lib/constants'
import { currency, dueLabel, isOverdue, relativeTime } from '../lib/format'
import { hoaAPI } from '../api'

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

/** Overdue first (most overdue at top), then due within 3 days. */
function needsAttention(violations) {
  const active = violations.filter((v) => v.status !== 'resolved' && v.due_date)
  const overdue = active.filter(isOverdue)
  const dueSoon = active.filter((v) => {
    if (isOverdue(v)) return false
    const label = dueLabel(v)
    return label?.tone === 'soon'
  })
  overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
  dueSoon.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
  return [...overdue, ...dueSoon].slice(0, 6)
}

export default function OverviewTab({ analytics, loading, violations = [], hoaId, onOpenResident, onOpenViolation }) {
  const [activity, setActivity] = useState(null)

  useEffect(() => {
    if (!hoaId) return
    let cancelled = false
    hoaAPI.getActivity(hoaId, 10)
      .then((res) => { if (!cancelled) setActivity(res.data) })
      .catch(() => { if (!cancelled) setActivity([]) })
    return () => { cancelled = true }
  }, [hoaId, violations])

  const attention = useMemo(() => needsAttention(violations), [violations])

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

      {/* Needs Attention — the triage queue */}
      {attention.length > 0 && (
        <div className="border border-red-500/20 bg-red-500/[0.03] rounded-lg p-5 anim-rise stagger-1">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h3 className="text-sm font-semibold text-slate-200">Needs Attention</h3>
            <span className="text-xs text-slate-500">past-due and due-soon cure deadlines</span>
          </div>
          <div className="space-y-1">
            {attention.map((v) => {
              const due = dueLabel(v)
              return (
                <button
                  key={v.id}
                  onClick={() => onOpenViolation?.(v)}
                  className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${due?.tone === 'overdue' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <span className="text-sm text-slate-200 truncate">{v.violation_type}</span>
                    <span className="text-xs text-slate-500 truncate shrink-0">{v.resident_name} · {v.resident_unit}</span>
                    <Badge config={STATUS_CONFIG[v.status]} />
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${due?.tone === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}>{due?.text}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Offenders */}
        {(analytics.top_offenders || []).length > 0 && (
          <div className="border border-white/10 rounded-lg p-5 anim-rise stagger-2">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Top Residents</h3>
            <div className="space-y-2">
              {analytics.top_offenders.slice(0, 5).map((o) => (
                <button
                  key={o.resident_id}
                  onClick={() => onOpenResident?.(o.resident_id)}
                  className="w-full flex items-center justify-between p-2.5 rounded hover:bg-white/[0.06] transition-colors text-left text-sm"
                >
                  <span className="text-slate-300">{o.name} <span className="text-slate-600">· {o.unit}</span></span>
                  <span className="text-slate-400">
                    {o.open > 0 && <span className="text-amber-400 mr-2">{o.open} open</span>}
                    {o.total} total
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="border border-white/10 rounded-lg p-5 anim-rise stagger-3">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Recent Activity</h3>
          {activity === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="w-full h-4" />)}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-xs text-slate-600">Activity will appear here as violations are worked.</p>
          ) : (
            <div className="space-y-3">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-3 text-left">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${a.kind === 'system' ? 'bg-slate-600' : 'bg-[#3b82f6]'}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      <span className="text-slate-300">{a.resident_name} · {a.resident_unit}</span>
                      <span className="text-slate-600"> — {a.violation_type}</span>
                    </p>
                    <p className={`text-xs mt-0.5 ${a.kind === 'system' ? 'text-slate-500 italic' : 'text-slate-400'}`}>{a.body}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">{relativeTime(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
