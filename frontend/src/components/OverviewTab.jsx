import React, { useState, useEffect, useMemo } from 'react'
import { CountUp, Skeleton, Spinner } from './primitives'
import { currency, dueLabel, isOverdue, relativeTime } from '../lib/format'
import { hoaAPI } from '../api'

const KPI_ICONS = {
  open: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
  ),
  overdue: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  fines: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  rate: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  ),
}

function KpiCard({ icon, label, value, tone = '', chip, rail, delay = '', onClick, title }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`vt-card vt-card-interactive vt-spotlight overflow-hidden p-5 anim-rise text-left ${delay}`}
    >
      <span className={`absolute inset-x-0 top-0 h-[2px] rounded-t-[inherit] bg-gradient-to-r ${rail}`} />
      <div className="flex items-center gap-2.5 mb-4">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${chip}`}>{KPI_ICONS[icon]}</span>
        <p className="text-slate-400 text-xs font-medium tracking-wide uppercase">{label}</p>
      </div>
      <p className={`text-[2rem] leading-none font-bold tracking-tight ${tone || 'stat-number'}`}>
        <CountUp value={value} />
      </p>
    </Tag>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
  return [...overdue, ...dueSoon].slice(0, 5)
}

/** First-run home: a guided checklist instead of four zero stat cards. */
function GettingStarted({ hoa, residentCount, onAddResident, onImportResidents, onNewViolation, onEditClient, onSeedDemo, seeding }) {
  const steps = [
    {
      title: 'Add your residents',
      hint: 'Enter them one at a time, or import your whole roster from a CSV.',
      done: residentCount > 0,
      actions: [
        { label: '+ Add resident', onClick: onAddResident, primary: true },
        { label: 'Import CSV', onClick: onImportResidents },
      ],
    },
    {
      title: 'Set your association details',
      hint: 'Your contact info appears on every violation notice as the reply-to.',
      done: !!(hoa?.email && hoa?.contact_person_name),
      actions: [{ label: 'Edit settings', onClick: onEditClient }],
    },
    {
      title: 'Log your first violation',
      hint: 'Generate the letter, set the cure deadline, and track it to resolution.',
      done: false,
      disabled: residentCount === 0,
      disabledHint: 'Add a resident first',
      actions: [{ label: '+ New violation', onClick: onNewViolation, primary: true }],
    },
  ]

  return (
    <div className="max-w-2xl mx-auto anim-rise">
      <div className="vt-card vt-spotlight overflow-hidden p-6 sm:p-8">
        <span className="absolute inset-x-0 top-0 h-[2px] rounded-t-[inherit] bg-gradient-to-r from-blue-500/70 via-blue-400/25 to-transparent" />
        <h2 className="text-lg font-bold text-slate-100 tracking-tight">Set up {hoa?.name || 'your community'}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">Three steps to your first enforcement letter.</p>

        <div className="space-y-5">
          {steps.map((step, i) => (
            <div key={step.title} className={`flex items-start gap-4 ${step.disabled ? 'opacity-50' : ''}`}>
              {step.done ? (
                <span className="w-7 h-7 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" /></svg>
                </span>
              ) : (
                <span className="w-7 h-7 rounded-full bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center text-xs font-semibold text-slate-400 shrink-0">{i + 1}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.done ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-200'}`}>{step.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{step.hint}</p>
                {!step.done && (
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {step.actions.map((a) => (
                      <button
                        key={a.label}
                        onClick={a.onClick}
                        disabled={step.disabled}
                        title={step.disabled ? step.disabledHint : undefined}
                        className={a.primary
                          ? 'btn-primary btn-sheen px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed'
                          : 'px-3 py-1.5 text-xs text-slate-400 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors'}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {residentCount === 0 && onSeedDemo && (
          <>
            <div className="vt-hairline my-6" />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-500">Just exploring? Try it with realistic sample data — you can delete the client later.</p>
              <button
                onClick={onSeedDemo}
                disabled={seeding}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 border border-white/15 hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-60 rounded-lg transition-colors shrink-0"
              >
                {seeding && <Spinner className="w-3 h-3" />}
                {seeding ? 'Loading…' : 'Load sample community'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function OverviewTab({ analytics, loading, violations = [], hoaId, onOpenViolation, onShowOverdue, hoa, residentCount, onAddResident, onImportResidents, onNewViolation, onEditClient, onSeedDemo, seeding }) {
  const [activity, setActivity] = useState(null)
  const hasViolations = violations.length > 0

  useEffect(() => {
    if (!hoaId || !hasViolations) return
    let cancelled = false
    hoaAPI.getActivity(hoaId, 6)
      .then((res) => { if (!cancelled) setActivity(res.data) })
      .catch(() => { if (!cancelled) setActivity([]) })
    return () => { cancelled = true }
  }, [hoaId, hasViolations, violations])

  const attention = useMemo(() => needsAttention(violations), [violations])

  // Nothing on the books yet — zero stat cards and an empty feed would just
  // be noise. Walk the manager through setup instead. (Hold the skeleton
  // until the first load settles so the checklist never flashes.)
  if (!hasViolations) {
    if (loading) return <OverviewSkeleton />
    return (
      <GettingStarted
        hoa={hoa}
        residentCount={residentCount}
        onAddResident={onAddResident}
        onImportResidents={onImportResidents}
        onNewViolation={onNewViolation}
        onEditClient={onEditClient}
        onSeedDemo={onSeedDemo}
        seeding={seeding}
      />
    )
  }

  if (loading && !analytics) return <OverviewSkeleton />
  if (!analytics) return null

  const k = analytics.kpis

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon="open" label="Open Cases" value={k.open_violations} delay="stagger-1"
          chip="bg-blue-500/10 ring-blue-500/25 text-blue-400" rail="from-blue-500/70 via-blue-400/25 to-transparent"
        />
        <KpiCard
          icon="overdue" label="Overdue" value={k.overdue_violations} delay="stagger-2"
          tone={k.overdue_violations > 0 ? 'text-red-400' : ''}
          chip={k.overdue_violations > 0 ? 'bg-red-500/10 ring-red-500/25 text-red-400' : 'bg-slate-500/10 ring-slate-500/25 text-slate-400'}
          rail={k.overdue_violations > 0 ? 'from-red-500/70 via-red-400/25 to-transparent' : 'from-slate-500/50 via-slate-500/15 to-transparent'}
          onClick={k.overdue_violations > 0 ? onShowOverdue : undefined}
          title={k.overdue_violations > 0 ? 'View the overdue violations' : undefined}
        />
        <KpiCard
          icon="fines" label="Outstanding Fines" value={currency(k.outstanding_fines)} delay="stagger-3"
          tone={k.outstanding_fines > 0 ? 'text-amber-400' : ''}
          chip={k.outstanding_fines > 0 ? 'bg-amber-500/10 ring-amber-500/25 text-amber-400' : 'bg-slate-500/10 ring-slate-500/25 text-slate-400'}
          rail={k.outstanding_fines > 0 ? 'from-amber-500/70 via-amber-400/25 to-transparent' : 'from-slate-500/50 via-slate-500/15 to-transparent'}
        />
        <KpiCard
          icon="rate" label="Resolution Rate" value={`${k.resolution_rate}%`} delay="stagger-4"
          chip="bg-emerald-500/10 ring-emerald-500/25 text-emerald-400" rail="from-emerald-500/70 via-emerald-400/25 to-transparent"
        />
      </div>

      {/* Needs Attention — the triage queue */}
      {attention.length > 0 && (
        <div className="vt-card !border-red-500/25 overflow-hidden p-5 anim-rise stagger-1" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 10px 40px -14px rgba(239,68,68,0.25), var(--shadow-md)' }}>
          <span className="absolute inset-x-0 top-0 h-[2px] rounded-t-[inherit] bg-gradient-to-r from-red-500/80 via-red-400/30 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-red-400 opacity-60 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-red-400" />
            </span>
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
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${due?.tone === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}>{due?.text}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="vt-card vt-spotlight p-5 anim-rise stagger-2">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Recent Activity</h3>
        {activity === null ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="w-full h-4" />)}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-xs text-slate-600">Activity will appear here as violations are worked.</p>
        ) : (
          <div className="space-y-2.5">
            {activity.map((a) => (
              <div key={a.id} className="flex gap-3 text-left">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${a.kind === 'system' ? 'bg-slate-600' : 'bg-[#3b82f6]'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs text-slate-400 leading-relaxed truncate">
                      <span className="text-slate-300">{a.resident_name} · {a.resident_unit}</span>
                      <span className="text-slate-600"> — {a.violation_type}</span>
                    </p>
                    <span className="text-[11px] text-slate-600 shrink-0">{relativeTime(a.created_at)}</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${a.kind === 'system' ? 'text-slate-500 italic' : 'text-slate-400'}`}>{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
