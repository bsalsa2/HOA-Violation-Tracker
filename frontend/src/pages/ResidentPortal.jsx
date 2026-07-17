import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { portalAPI } from '../api'
import { Spinner } from '../components/primitives'
import { formatDate, currency, daysUntil } from '../lib/format'

const STATUS_STYLE = {
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  noticed: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  escalated: 'bg-red-500/10 text-red-400 border-red-500/25',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
}

const RESPONSE_KINDS = [
  { key: 'fixed', label: "I've corrected it", hint: 'Tell the association the issue is resolved' },
  { key: 'dispute', label: 'I dispute this', hint: 'Explain why you believe this notice is in error' },
  { key: 'question', label: 'I have a question', hint: 'Ask the association about this notice' },
]

export default function ResidentPortal() {
  const { token } = useParams()
  const [caseData, setCaseData] = useState(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('fixed')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    portalAPI.getCase(token)
      .then((res) => setCaseData(res.data))
      .catch(() => setError('This link is invalid or has expired. Contact your association for a new one.'))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    try {
      await portalAPI.respond(token, kind, message.trim())
      setSent(true)
      const res = await portalAPI.getCase(token)
      setCaseData(res.data)
      setMessage('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send your response. Try again shortly.')
    } finally {
      setSending(false)
    }
  }

  if (error && !caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="vt-card p-8 max-w-md text-center">
          <p className="text-slate-200 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400"><Spinner className="w-5 h-5" /> Loading your case…</div>
      </div>
    )
  }

  const days = caseData.due_date ? daysUntil(caseData.due_date) : null
  const overdue = days !== null && days < 0 && caseData.status !== 'resolved'

  return (
    <div className="relative min-h-screen bg-transparent py-10 px-4 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0d1017] via-[#0b0e14] to-black" />
      <div className="vt-orb vt-orb-a -z-10 w-[30rem] h-[30rem] -top-32 left-1/2 -translate-x-1/2" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)' }} />

      <div className="max-w-2xl mx-auto space-y-5 anim-rise">
        {/* Header */}
        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Violation Notice</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{caseData.violation_type}</h1>
          <p className="text-sm text-slate-400 mt-2">{caseData.hoa.name}</p>
        </div>

        {/* Summary card */}
        <div className="vt-card p-6">
          <div className="space-y-4">
            {/* Violation details */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Property</p>
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${STATUS_STYLE[caseData.status] || STATUS_STYLE.open}`}>
                  {caseData.status === 'resolved' ? 'Resolved' : caseData.notice_label !== 'None' ? caseData.notice_label : 'Open'}
                </span>
              </div>
              <p className="text-sm text-slate-200">{caseData.property}</p>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Details</p>
              <p className="text-sm text-slate-300 leading-relaxed">{caseData.description}</p>
            </div>

            {/* Timeline: Deadline and fine */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className={`rounded-lg p-3 ring-1 ${overdue ? 'bg-red-500/[0.06] ring-red-500/25' : 'bg-white/[0.03] ring-white/[0.06]'}`}>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Correct By</p>
                <p className={`text-sm font-medium mt-1 ${overdue ? 'text-red-400' : 'text-slate-200'}`}>
                  {caseData.due_date ? formatDate(caseData.due_date) : '—'}
                </p>
                {caseData.status !== 'resolved' && days !== null && (
                  <p className={`text-[11px] mt-1 ${overdue ? 'text-red-400/80' : 'text-slate-500'}`}>
                    {overdue ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `${days} days left`}
                  </p>
                )}
              </div>
              {caseData.fine_balance > 0 && (
                <div className="rounded-lg p-3 ring-1 bg-amber-500/[0.06] ring-amber-500/25">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Amount Due</p>
                  <p className="text-sm font-medium text-amber-400 mt-1">{currency(caseData.fine_balance)}</p>
                </div>
              )}
            </div>

            {/* Photos */}
            {caseData.photos.length > 0 && (
              <div className="pt-2">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Evidence</p>
                <div className="grid grid-cols-3 gap-2">
                  {caseData.photos.map((p, i) => (
                    <button key={i} onClick={() => setLightbox(p.data)} className="aspect-square rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-[#3b82f6]/60 transition-all">
                      <img src={p.data} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Respond */}
        {caseData.status !== 'resolved' ? (
          <div className="vt-card p-6">
            <h3 className="text-sm font-semibold text-slate-200 mb-0.5">Submit Your Response</h3>
            <p className="text-xs text-slate-500 mb-4">Let the association know your status</p>
            {sent && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-sm rounded-lg p-3 mb-4 anim-fade">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Response recorded
              </div>
            )}
            <form onSubmit={submit} className="space-y-3">
              <div className="grid sm:grid-cols-3 gap-2">
                {RESPONSE_KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setKind(k.key)}
                    className={`text-left p-3 rounded-lg border transition-all ${kind === k.key ? 'border-[#3b82f6]/50 bg-[#3b82f6]/10' : 'border-white/10 hover:border-white/20'}`}
                  >
                    <p className={`text-sm font-medium ${kind === k.key ? 'text-[#60a5fa]' : 'text-slate-300'}`}>{k.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{k.hint}</p>
                  </button>
                ))}
              </div>
              <textarea
                className="vt-input px-3.5 py-3 resize-none"
                rows={4}
                maxLength={2000}
                placeholder="Write your message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={sending || !message.trim()} className="btn-primary btn-sheen w-full py-3">
                {sending ? 'Sending…' : 'Send Response'}
              </button>
            </form>
          </div>
        ) : (
          <div className="vt-card p-6 text-center">
            <p className="text-sm text-emerald-400 font-medium">Resolved</p>
            <p className="text-xs text-slate-500 mt-1">No further action needed.</p>
          </div>
        )}

        {/* Previous responses — simplified */}
        {caseData.responses.length > 0 && (
          <div className="vt-card p-6">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Your responses</h3>
            <div className="space-y-2.5">
              {caseData.responses.map((r, i) => (
                <div key={i} className="text-sm text-slate-400 pb-2.5 border-b border-white/5 last:border-0">
                  <p>{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact footer */}
        {(caseData.hoa.email || caseData.hoa.phone) && (
          <p className="text-center text-xs text-slate-600">
            Contact:
            {caseData.hoa.email && <> <a className="text-slate-400 hover:text-slate-300" href={`mailto:${caseData.hoa.email}`}>{caseData.hoa.email}</a></>}
            {caseData.hoa.email && caseData.hoa.phone && <> · </>}
            {caseData.hoa.phone && <>{caseData.hoa.phone}</>}
          </p>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 anim-fade" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Evidence" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
        </div>
      )}
    </div>
  )
}
