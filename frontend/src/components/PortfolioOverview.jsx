import React, { useMemo } from 'react'
import { currency } from '../lib/format'

function ClientCard({ hoa, onOpen }) {
  const hasOverdue = hoa.overdue_violations > 0
  return (
    <button
      onClick={() => onOpen(hoa)}
      className={`text-left bg-slate-900 border rounded-2xl p-5 hover:border-slate-600 transition-colors ${
        hasOverdue ? 'border-red-500/30' : 'border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-white font-semibold truncate">{hoa.name}</h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">{hoa.address}</p>
        </div>
        {hasOverdue && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 shrink-0 font-medium">
            {hoa.overdue_violations} overdue
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <p className="text-lg font-bold text-white leading-none">{hoa.total_residents}</p>
          <p className="text-[10px] text-slate-500 mt-1">Residents</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <p className="text-lg font-bold text-amber-400 leading-none">{hoa.open_violations}</p>
          <p className="text-[10px] text-slate-500 mt-1">Open Cases</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <p className="text-lg font-bold text-rose-400 leading-none">{currency(hoa.outstanding_fines)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Fines Due</p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-4 text-xs text-blue-400">
        Open dashboard
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </div>
    </button>
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
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </div>
            <h1 className="font-semibold text-sm text-white">ViolationTrack <span className="text-slate-500 font-normal">· Portfolio</span></h1>
          </div>
          <button onClick={onSignOut} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Your Clients</h2>
            <p className="text-sm text-slate-500 mt-0.5">{totals.clients} {totals.clients === 1 ? 'community' : 'communities'} under management</p>
          </div>
          <button onClick={onAddClient} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium">+ Add Client</button>
        </div>

        {/* Portfolio totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{totals.residents}</p>
            <p className="text-xs text-slate-500 mt-1">Total Residents</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-400">{totals.open}</p>
            <p className="text-xs text-slate-500 mt-1">Open Cases</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className={`text-2xl font-bold ${totals.overdue > 0 ? 'text-red-400' : 'text-slate-300'}`}>{totals.overdue}</p>
            <p className="text-xs text-slate-500 mt-1">Overdue</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-rose-400">{currency(totals.fines)}</p>
            <p className="text-xs text-slate-500 mt-1">Outstanding Fines</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hoas.map((h) => (<ClientCard key={h.id} hoa={h} onOpen={onOpen} />))}
          <button
            onClick={onAddClient}
            className="border-2 border-dashed border-slate-800 hover:border-slate-600 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-slate-300 transition-colors min-h-[180px]"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
            <span className="text-sm font-medium">Add another client</span>
          </button>
        </div>
      </main>
    </div>
  )
}
