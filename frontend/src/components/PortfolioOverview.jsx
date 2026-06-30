import React, { useMemo } from 'react'
import { currency } from '../lib/format'
import { CountUp } from './primitives'

function ClientCard({ hoa, onOpen, onSettings }) {
  const hasOverdue = hoa.overdue_violations > 0
  const isConfigured = hoa.email && hoa.contact_person_name
  return (
    <div
      className={`group vt-card vt-card-interactive vt-spotlight p-5 ${hasOverdue ? '!border-[#c17b6a]/30' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => onOpen(hoa)}
          className="flex items-center gap-3 flex-1 text-left min-w-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#818cf8]/90 to-[#3730a3]/90 ring-1 ring-white/15 flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.25)' }}>
            {(hoa.name || '?').replace(/[^a-zA-Z ]/g, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-semibold truncate group-hover:text-white">{hoa.name}</h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">{hoa.address}</p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {hasOverdue && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#c17b6a]/15 text-[#d4988a] border border-[#c17b6a]/25 font-medium">
              {hoa.overdue_violations} overdue
            </span>
          )}
          {!isConfigured && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4f46e5]/12 text-[#818cf8] border border-[#4f46e5]/25 font-medium">
              Setup needed
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSettings(hoa) }}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-white/[0.03] ring-1 ring-white/[0.05] rounded-xl p-2.5">
          <p className="text-lg font-bold text-white leading-none"><CountUp value={hoa.total_residents} /></p>
          <p className="text-[10px] text-slate-500 mt-1">Residents</p>
        </div>
        <div className="bg-white/[0.03] ring-1 ring-white/[0.05] rounded-xl p-2.5">
          <p className="text-lg font-bold text-[#818cf8] leading-none"><CountUp value={hoa.open_violations} /></p>
          <p className="text-[10px] text-slate-500 mt-1">Open Cases</p>
        </div>
        <div className="bg-white/[0.03] ring-1 ring-white/[0.05] rounded-xl p-2.5">
          <p className="text-lg font-bold text-[#d4988a] leading-none tabular">{currency(hoa.outstanding_fines)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Fines Due</p>
        </div>
      </div>
      <button onClick={() => onOpen(hoa)} className="flex items-center gap-1 mt-4 text-xs text-[#5bba99] hover:text-[#818cf8] transition-colors">
        Open dashboard
        <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  )
}

export default function PortfolioOverview({ hoas, onOpen, onAddClient, onSignOut }) {
  const totals = useMemo(() => {
    return hoas.reduce(
      (acc, h) => ({
        clients: acc.clients + 1,
        residents: acc.residents + (h.total_residents || 0),
        open: acc.open + (h.open_violations || 0),
        overdue: acc.overdue + (h.overdue_violations || 0),
        fines: acc.fines + (h.outstanding_fines || 0),
      }),
      { clients: 0, residents: 0, open: 0, overdue: 0, fines: 0 }
    )
  }, [hoas])

  return (
    <div className="min-h-screen bg-transparent text-white">
      <header className="relative bg-[#0d0b08]/85 backdrop-blur-xl border-b border-white/[0.06] px-6 py-3 sticky top-0 z-20">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#4f46e5]/50 to-transparent" />
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#e0e7ff] to-[#3730a3] rounded-xl flex items-center justify-center ring-1 ring-white/25" style={{ boxShadow: '0 6px 20px -4px rgba(99,102,241,0.55), inset 0 1px 0 0 rgba(255,255,255,0.4)' }}>
              <svg className="w-4 h-4 text-[#064e3b]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </div>
            <h1 className="font-semibold text-sm text-white tracking-tight">ViolationTrack <span className="text-slate-500 font-normal">· Portfolio</span></h1>
          </div>
          <button onClick={onSignOut} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/[0.04] rounded-lg transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 anim-rise">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Your Clients</h2>
            <p className="text-sm text-slate-500 mt-0.5">{totals.clients} {totals.clients === 1 ? 'community' : 'communities'} under management</p>
          </div>
          <button onClick={onAddClient} className="btn-primary btn-sheen px-4 py-2 text-sm">+ Add Client</button>
        </div>

        {/* Portfolio totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="vt-card p-4 anim-rise stagger-1">
            <p className="text-2xl font-bold text-white"><CountUp value={totals.residents} /></p>
            <p className="text-xs text-slate-500 mt-1">Total Residents</p>
          </div>
          <div className="vt-card p-4 anim-rise stagger-2">
            <p className="text-2xl font-bold text-[#818cf8]"><CountUp value={totals.open} /></p>
            <p className="text-xs text-slate-500 mt-1">Open Cases</p>
          </div>
          <div className="vt-card p-4 anim-rise stagger-3">
            <p className={`text-2xl font-bold ${totals.overdue > 0 ? 'text-red-400' : 'text-slate-300'}`}><CountUp value={totals.overdue} /></p>
            <p className="text-xs text-slate-500 mt-1">Overdue</p>
          </div>
          <div className="vt-card p-4 anim-rise stagger-4">
            <p className="text-2xl font-bold text-[#d4988a] tabular">{currency(totals.fines)}</p>
            <p className="text-xs text-slate-500 mt-1">Outstanding Fines</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hoas.map((h) => (<ClientCard key={h.id} hoa={h} onOpen={onOpen} onSettings={onOpen} />))}
          <button
            onClick={onAddClient}
            className="border-2 border-dashed border-white/10 hover:border-[#4f46e5]/40 hover:bg-[#4f46e5]/[0.04] rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-[#818cf8] transition-all min-h-[180px] group"
          >
            <div className="w-11 h-11 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] flex items-center justify-center group-hover:ring-[#4f46e5]/40 transition-all">
              <svg className="w-6 h-6 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
            </div>
            <span className="text-sm font-medium">Add another client</span>
          </button>
        </div>
      </main>
    </div>
  )
}
