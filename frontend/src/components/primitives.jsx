import React, { useEffect, useRef, useState } from 'react'

export function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function Badge({ config, children, className = '' }) {
  const cls = config?.badge || 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${cls} ${className}`}>
      {children ?? config?.label}
    </span>
  )
}

/** Shimmering skeleton placeholder. */
export function Skeleton({ className = '' }) {
  return <div className={`vt-skeleton rounded-lg ${className}`} />
}

/** Animated count-up for numbers. Robust to "$1,200.50", "94%", "9.4". */
export function CountUp({ value, duration = 900, className = '' }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef()
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Split into [prefix][number][suffix] — e.g. "$3,150.00" → "$" / "3,150.00" / ""
  const raw = String(value ?? '')
  const m = raw.match(/^([^0-9-]*)(-?[0-9,]*\.?[0-9]+)(.*)$/)
  const hasNumber = !!m
  const prefix = m ? m[1] : ''
  const suffix = m ? m[3] : ''
  const numeric = m ? parseFloat(m[2].replace(/,/g, '')) : 0
  const decimals = m ? (m[2].split('.')[1] || '').length : 0

  useEffect(() => {
    if (!hasNumber) return
    if (reduced) { setDisplay(numeric); return }
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(numeric * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [numeric, duration, hasNumber, reduced])

  if (!hasNumber) return <span className={className}>{value}</span>

  const shown = display.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return <span className={`tabular ${className}`}>{prefix}{shown}{suffix}</span>
}

/** Tiny inline sparkline. data: number[] */
export function Sparkline({ data = [], width = 72, height = 24, color = '#3b82f6', className = '' }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const step = data.length > 1 ? width / (data.length - 1) : width
  const pts = data.map((d, i) => {
    const x = i * step
    const y = height - ((d - min) / range) * (height - 4) - 2
    return [x, y]
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const gid = `spark-${color.replace('#', '')}`
  return (
    <svg width={width} height={height} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  )
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4 anim-fade" style={{ background: 'rgba(2, 6, 15, 0.72)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        className={`anim-scale-in vt-card ${wide ? 'max-w-2xl' : 'max-w-lg'} w-full max-h-[90vh] flex flex-col`}
        style={{ background: '#0d121e', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), var(--shadow-xl)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-white/[0.06]">
          <div>
            <h3 className="text-slate-100 font-semibold tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-100 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors text-lg"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[60] p-4 anim-fade" style={{ background: 'rgba(2, 6, 15, 0.72)' }}>
      <div className="anim-scale-in vt-card p-6 max-w-sm w-full" style={{ background: '#0d121e', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), var(--shadow-xl)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-11 h-11 bg-red-500/10 ring-1 ring-red-500/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-white/10 text-slate-400 hover:bg-white/5 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-slate-100 rounded-lg transition-all active:scale-[.98] font-medium shadow-lg shadow-red-900/40">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 z-[70] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`anim-rise flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl shadow-black/50 border max-w-sm text-sm backdrop-blur-xl ${
            t.type === 'error' ? 'bg-red-950/90 border-red-800/70 text-red-100' : 'bg-slate-900/85 border-white/10 text-slate-100'
          }`}
          style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), var(--shadow-lg)' }}
        >
          {t.type === 'error' ? (
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="ml-2 opacity-50 hover:opacity-100 transition-opacity">×</button>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="py-14 text-center anim-fade">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] flex items-center justify-center text-slate-600">
          {icon || (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </div>
      </div>
      <p className="text-slate-400 text-sm font-medium">{title}</p>
      {hint && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.busy}
          className="mt-4 px-4 py-2 text-xs text-slate-300 border border-white/15 hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-60 rounded-lg transition-colors inline-flex items-center gap-2"
        >
          {action.busy && <Spinner className="w-3.5 h-3.5" />}
          {action.label}
        </button>
      )}
    </div>
  )
}
