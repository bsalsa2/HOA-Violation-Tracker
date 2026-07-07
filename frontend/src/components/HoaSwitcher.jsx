import React, { useState, useRef, useEffect } from 'react'

export default function HoaSwitcher({ hoas, activeHoa, onSwitch, onShowPortfolio, onAddClient }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] transition-colors min-w-0 max-w-full sm:max-w-[220px]"
      >
        <div className="min-w-0 text-left">
          <p className="text-sm font-semibold text-slate-100 leading-none truncate">{activeHoa?.name}</p>
          {activeHoa?.address && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{activeHoa.address}</p>}
        </div>
        <svg className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="anim-scale-in absolute left-0 top-full mt-2 w-72 vt-card py-1.5 z-50 max-h-[70vh] overflow-y-auto" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), var(--shadow-xl)' }}>
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">Switch client</p>
          {hoas.map((h) => (
            <button
              key={h.id}
              onClick={() => { onSwitch(h); setOpen(false) }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.05] transition-colors ${h.id === activeHoa?.id ? 'bg-white/[0.05]' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-100 truncate">{h.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{h.total_residents} residents · {h.open_violations} open</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {h.overdue_violations > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">{h.overdue_violations}</span>
                )}
                {h.id === activeHoa?.id && (
                  <svg className="w-4 h-4 text-[#3b82f6]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                )}
              </div>
            </button>
          ))}
          <div className="vt-hairline my-1.5" />
          <div className="pt-0.5">
            <button onClick={() => { onShowPortfolio(); setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/[0.05] transition-colors">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              View all clients
            </button>
            <button onClick={() => { onAddClient(); setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/[0.05] transition-colors">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add client
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
