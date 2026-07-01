import React, { useState, useMemo } from 'react'
import { EmptyState } from './primitives'

export default function ResidentsTab({ residents, onAdd, onImport, onDelete, onViewViolations }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return residents
    const q = query.toLowerCase()
    return residents.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        String(r.unit || '').toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q)
    )
  }, [residents, query])

  return (
    <div className="vt-card overflow-hidden anim-rise">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search residents…"
            className="vt-input pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onImport} className="px-3 py-2 text-xs text-slate-400 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors">
            Import CSV
          </button>
          <button onClick={onAdd} className="btn-primary btn-sheen px-3 py-2 text-xs">
            + Add Resident
          </button>
        </div>
      </div>

      <div className="divide-y divide-white/[0.05] max-h-[calc(100vh-20rem)] overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            title={query ? 'No residents match your search.' : 'No residents yet.'}
            hint={query ? 'Try a different search.' : 'Add a resident or import a CSV to get started.'}
          />
        ) : (
          filtered.map((r) => {
            const repeat = (r.violation_count || 0) >= 3
            return (
              <div key={r.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] group transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700/60 to-slate-800/60 ring-1 ring-white/[0.06] flex items-center justify-center text-xs font-semibold text-slate-400 shrink-0">
                    {(r.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-100 truncate">{r.name}</p>
                    {repeat && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 font-medium shrink-0">
                        Repeat offender
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <svg className="w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      {r.unit}
                    </span>
                    {r.email ? (
                      <span className="text-xs text-slate-500 truncate">{r.email}</span>
                    ) : (
                      <span className="text-xs text-amber-400/90">No email</span>
                    )}
                    {r.phone && <span className="text-xs text-slate-500">{r.phone}</span>}
                  </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {(r.violation_count || 0) > 0 && (
                    <button
                      onClick={() => onViewViolations(r)}
                      className="flex items-center gap-1.5 text-xs"
                      title="View this resident's violations"
                    >
                      {r.open_count > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-[#3b82f6]/12 text-[#60a5fa] border border-[#3b82f6]/25">{r.open_count} active</span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">{r.violation_count} total</span>
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(r.id, r.name)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-all"
                    title="Delete resident"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
