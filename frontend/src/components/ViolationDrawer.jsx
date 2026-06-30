import React, { useState, useEffect, useCallback } from 'react'
import { violationAPI } from '../api'
import { Badge, Spinner } from './primitives'
import { STATUS_CONFIG, PRIORITY_CONFIG, NOTICE_LEVELS } from '../lib/constants'
import { formatDate, formatDateTime, relativeTime, currency, dueLabel, isOverdue } from '../lib/format'

const inputCls = 'px-2.5 py-1.5 bg-slate-900/60 text-gray-900 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-[#374151]'

export default function ViolationDrawer({ violation, onClose, onUpdate, onEscalate, onSendEmail, onViewLetter, onDelete, sending }) {
  const [notes, setNotes] = useState([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [fineInput, setFineInput] = useState(String(violation.fine_amount || ''))
  const [editingFine, setEditingFine] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')

  const loadNotes = useCallback(async () => {
    setNotesLoading(true)
    try {
      const res = await violationAPI.getNotes(violation.id)
      setNotes(res.data)
    } catch {
      /* ignore */
    } finally {
      setNotesLoading(false)
    }
  }, [violation.id])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const runUpdate = async (fields) => {
    setBusy(true)
    try {
      await onUpdate(violation.id, fields)
      await loadNotes()
    } finally {
      setBusy(false)
    }
  }

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await violationAPI.addNote(violation.id, newNote.trim())
      setNewNote('')
      await loadNotes()
    } finally {
      setSavingNote(false)
    }
  }

  const handleSaveFine = async () => {
    const amount = parseFloat(fineInput) || 0
    setEditingFine(false)
    await runUpdate({ fine_amount: amount })
  }

  const handleEscalate = async () => {
    setBusy(true)
    try {
      await onEscalate(violation.id)
      await loadNotes()
    } finally {
      setBusy(false)
    }
  }

  const handleStatusSelect = (value) => {
    if (value === 'resolved' && violation.status !== 'resolved') {
      setResolveNote('')
      setResolveOpen(true)
      return
    }
    runUpdate({ status: value })
  }

  const confirmResolve = async () => {
    const note = resolveNote.trim()
    setResolveOpen(false)
    await runUpdate(note ? { status: 'resolved', note: `Resolution: ${note}` } : { status: 'resolved' })
  }

  const overdue = isOverdue(violation)
  const due = dueLabel(violation)
  const dueDateValue = violation.due_date ? new Date(violation.due_date).toISOString().split('T')[0] : ''
  const atMaxNotice = (violation.notice_level || 0) >= NOTICE_LEVELS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm anim-fade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="anim-slide-right relative w-full max-w-md bg-[#0b1020] border-l border-gray-200 h-full overflow-y-auto shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="sticky top-0 bg-[#0b1020]/90 backdrop-blur-xl border-b border-gray-100 px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-gray-900 font-semibold truncate">{violation.violation_type}</h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {violation.resident_name} · {violation.resident_unit}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-900 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 shrink-0">×</button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge config={STATUS_CONFIG[violation.status]} />
            <Badge config={PRIORITY_CONFIG[violation.priority]}>{PRIORITY_CONFIG[violation.priority]?.label} priority</Badge>
            {violation.notice_level > 0 && (
              <Badge className="bg-[#b89b8e]/12 text-[#cdb6aa] border-[#b89b8e]/25">{violation.notice_label}</Badge>
            )}
            {overdue && <Badge className="bg-[#c17b6a]/12 text-[#d4988a] border-[#c17b6a]/25">Overdue</Badge>}
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Description */}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">Description</p>
            <p className="text-sm text-gray-600 leading-relaxed">{violation.description}</p>
            <p className="text-xs text-slate-600 mt-2">Opened {formatDate(violation.created_at)}</p>
          </div>

          {/* Quick controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500 mb-1.5 block">Status</label>
              <select className={`${inputCls} w-full`} value={violation.status} disabled={busy} onChange={(e) => handleStatusSelect(e.target.value)}>
                <option value="open">Open</option>
                <option value="noticed">Noticed</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500 mb-1.5 block">Priority</label>
              <select className={`${inputCls} w-full`} value={violation.priority} disabled={busy} onChange={(e) => runUpdate({ priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Cure deadline */}
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-500 mb-1.5 block">Cure Deadline</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={`${inputCls} flex-1`}
                value={dueDateValue}
                disabled={busy}
                onChange={(e) => e.target.value && runUpdate({ due_date: e.target.value })}
              />
              {due && (
                <span className={`text-xs font-medium ${due.tone === 'overdue' ? 'text-[#d4988a]' : due.tone === 'soon' ? 'text-[#6b7280]' : 'text-gray-600'}`}>
                  {due.text}
                </span>
              )}
            </div>
          </div>

          {/* Fine ledger */}
          <div className="vt-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-gray-500">Fine</p>
              {violation.fine_amount > 0 && (
                <button
                  onClick={() => runUpdate({ fine_paid: !violation.fine_paid })}
                  disabled={busy}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    violation.fine_paid
                      ? 'bg-[#8fae8b]/12 text-[#a8c3a3] border-[#8fae8b]/25'
                      : 'bg-[#374151]/12 text-[#6b7280] border-[#374151]/25 hover:bg-[#374151]/18'
                  }`}
                >
                  {violation.fine_paid ? '✓ Paid' : 'Mark paid'}
                </button>
              )}
            </div>
            {editingFine ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-600">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  className={`${inputCls} flex-1`}
                  value={fineInput}
                  onChange={(e) => setFineInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveFine()}
                />
                <button onClick={handleSaveFine} className="text-xs px-3 py-1.5 bg-gradient-to-b from-[#6b7280] to-[#374151] hover:from-[#9ca3af] hover:to-[#4b5563] shadow-lg shadow-[#374151]/30 active:scale-[.98] text-[#064e3b] font-semibold rounded-lg">Save</button>
                <button onClick={() => { setEditingFine(false); setFineInput(String(violation.fine_amount || '')) }} className="text-xs px-2 py-1.5 text-gray-600 hover:text-gray-900">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setEditingFine(true)} className="flex items-baseline gap-2 mt-1 group">
                <span className="text-2xl font-bold text-gray-900">{currency(violation.fine_amount)}</span>
                <span className="text-xs text-[#5bba99] opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
              </button>
            )}
          </div>

          {/* Enforcement actions */}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Enforcement</p>
            <div className="grid grid-cols-2 gap-2">
              {violation.resident_email ? (
                <button
                  onClick={() => onSendEmail(violation.id)}
                  disabled={sending}
                  className="flex items-center justify-center gap-1.5 py-2 text-sm bg-[#6f9069] hover:bg-[#7da37a] disabled:opacity-60 text-gray-900 rounded-lg transition-colors"
                >
                  {sending ? <Spinner className="w-3.5 h-3.5" /> : null}
                  {violation.email_sent_at ? 'Resend Letter' : 'Email Letter'}
                </button>
              ) : (
                <button disabled className="py-2 text-sm bg-slate-800 text-slate-600 rounded-lg cursor-not-allowed" title="Resident has no email">No email on file</button>
              )}
              <button onClick={() => onViewLetter(violation)} className="py-2 text-sm border border-slate-700 text-gray-600 hover:bg-slate-800 rounded-lg transition-colors">
                View Letter
              </button>
              <button
                onClick={handleEscalate}
                disabled={busy || atMaxNotice}
                className="col-span-2 py-2 text-sm bg-[#a5604f]/90 hover:bg-[#b06d5b] disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 rounded-lg transition-colors"
                title={atMaxNotice ? 'Already at highest level' : ''}
              >
                {atMaxNotice ? 'Max escalation reached' : `Escalate → ${NOTICE_LEVELS[(violation.notice_level || 0) + 1]}`}
              </button>
            </div>
            {violation.email_sent_at && (
              <p className="text-xs text-[#374151]/80 mt-2">Last letter emailed {formatDate(violation.email_sent_at)}</p>
            )}
          </div>

          {/* Activity timeline */}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Activity Log</p>
            <form onSubmit={handleAddNote} className="flex items-center gap-2 mb-4">
              <input
                className={`${inputCls} flex-1`}
                placeholder="Add a note (e.g. spoke with resident)…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button type="submit" disabled={savingNote || !newNote.trim()} className="text-sm px-3 py-1.5 bg-gradient-to-b from-[#6b7280] to-[#374151] hover:from-[#9ca3af] hover:to-[#4b5563] shadow-lg shadow-[#374151]/30 active:scale-[.98] disabled:opacity-50 text-[#064e3b] font-semibold rounded-lg shrink-0">
                {savingNote ? <Spinner className="w-3.5 h-3.5" /> : 'Add'}
              </button>
            </form>

            {notesLoading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-2"><Spinner className="w-4 h-4" /> Loading…</div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-slate-600">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {[...notes].reverse().map((n) => (
                  <div key={n.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className={`w-2 h-2 rounded-full ${n.kind === 'system' ? 'bg-slate-500' : 'bg-[#374151]'}`} />
                      <span className="w-px flex-1 bg-slate-800 mt-1" />
                    </div>
                    <div className="pb-1 min-w-0">
                      <p className={`text-sm ${n.kind === 'system' ? 'text-gray-600 italic' : 'text-gray-700'}`}>{n.body}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5" title={formatDateTime(n.created_at)}>{relativeTime(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="pt-2 border-t border-slate-800">
            <button onClick={() => onDelete(violation.id)} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
              Delete this violation
            </button>
          </div>
        </div>
      </div>

      {/* Resolve confirmation */}
      {resolveOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={(e) => { if (e.target === e.currentTarget) setResolveOpen(false) }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[#8fae8b]/12 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#a8c3a3]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">Mark violation resolved?</p>
                <p className="text-xs text-gray-500">This records the resolution in the audit log.</p>
              </div>
            </div>
            <label className="block text-xs text-gray-600 mb-1.5">How was it resolved? <span className="text-slate-600">(optional)</span></label>
            <textarea
              autoFocus
              className={`${inputCls} w-full resize-none`}
              rows={3}
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="e.g. Resident corrected the violation; verified on site."
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setResolveOpen(false)} className="flex-1 py-2 text-sm border border-slate-600 text-gray-600 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={confirmResolve} className="flex-1 py-2 text-sm bg-[#6f9069] hover:bg-[#7da37a] text-gray-900 rounded-lg transition-colors font-medium">Mark Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
