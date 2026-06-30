import React, { useState, useEffect, useMemo, useRef } from 'react'
import { STATUS_CONFIG } from '../lib/constants'

export default function CommandPalette({ open, onClose, residents, violations, onSelectViolation, onSelectResident, actions }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = []

    // Actions always available (filtered by query)
    actions.forEach((a) => {
      if (!q || a.label.toLowerCase().includes(q)) {
        items.push({ type: 'action', id: `action-${a.id}`, label: a.label, hint: 'Action', run: a.run })
      }
    })

    if (q) {
      residents
        .filter((r) => r.name?.toLowerCase().includes(q) || String(r.unit || '').toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((r) =>
          items.push({
            type: 'resident',
            id: `resident-${r.id}`,
            label: r.name,
            hint: `${r.unit}${r.violation_count ? ` · ${r.violation_count} violations` : ''}`,
            run: () => onSelectResident(r),
          })
        )

      violations
        .filter((v) => v.violation_type?.toLowerCase().includes(q) || v.resident_name?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q) || String(v.resident_unit || '').toLowerCase().includes(q))
        .slice(0, 8)
        .forEach((v) =>
          items.push({
            type: 'violation',
            id: `violation-${v.id}`,
            label: v.violation_type,
            hint: `${v.resident_name} · ${v.resident_unit}`,
            status: v.status,
            run: () => onSelectViolation(v),
          })
        )
    }
    return items
  }, [query, residents, violations, actions, onSelectResident, onSelectViolation])

  useEffect(() => {
    if (activeIdx >= results.length) setActiveIdx(0)
  }, [results, activeIdx])

  if (!open) return null

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[activeIdx]?.run()
      onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm anim-fade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="anim-scale-in w-full max-w-lg vt-card overflow-hidden" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), var(--shadow-xl)' }}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search residents, violations, or run an action…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No matches.</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => { item.run(); onClose() }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeIdx ? 'bg-white/[0.06]' : ''}`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                  item.type === 'action' ? 'bg-[#4f46e5]/12 text-[#4f46e5] ring-[#4f46e5]/25' : item.type === 'resident' ? 'bg-[#8fae8b]/12 text-[#8fae8b] ring-[#8fae8b]/25' : 'bg-[#c17b6a]/12 text-[#c17b6a] ring-[#c17b6a]/25'
                }`}>
                  {item.type === 'action' ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  ) : item.type === 'resident' ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200 truncate">{item.label}</p>
                  <p className="text-xs text-slate-500 truncate">{item.hint}</p>
                </div>
                {item.status && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${STATUS_CONFIG[item.status]?.badge}`}>
                    {STATUS_CONFIG[item.status]?.label}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
