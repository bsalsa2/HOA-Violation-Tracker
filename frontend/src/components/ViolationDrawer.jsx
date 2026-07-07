import React, { useState, useEffect, useCallback, useRef } from 'react'
import { violationAPI } from '../api'
import { Badge, Spinner } from './primitives'
import { STATUS_CONFIG, PRIORITY_CONFIG, NOTICE_LEVELS } from '../lib/constants'
import { formatDate, formatDateTime, relativeTime, currency, dueLabel, isOverdue } from '../lib/format'

const inputCls = 'px-2.5 py-1.5 bg-slate-900/60 text-slate-100 text-sm rounded-lg border border-white/10 focus:outline-none focus:border-[#3b82f6]'

export default function ViolationDrawer({ violation, onClose, onUpdate, onEscalate, onSendEmail, onViewLetter, onDelete, onDownloadPdf, onFine, onCopyPortalLink, onCaseFile, sending }) {
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [notes, setNotes] = useState([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [fineForm, setFineForm] = useState(null)   // { kind: 'assessment'|'payment' }
  const [fineAmount, setFineAmount] = useState('')
  const [fineNote, setFineNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)
  const [photos, setPhotos] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const fileInputRef = useRef(null)

  const loadPhotos = useCallback(async () => {
    try {
      const res = await violationAPI.getPhotos(violation.id)
      setPhotos(res.data)
    } catch {
      /* ignore */
    }
  }, [violation.id])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    if (file.size > 4 * 1024 * 1024) {
      setPhotoError('Photo too large (max 4 MB).')
      return
    }
    setUploadingPhoto(true)
    try {
      await violationAPI.addPhoto(violation.id, file)
      await Promise.all([loadPhotos(), loadNotes()])
    } catch (err) {
      setPhotoError(err.response?.data?.detail || 'Upload failed.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleDeletePhoto = async (photoId) => {
    setLightbox(null)
    try {
      await violationAPI.deletePhoto(violation.id, photoId)
      await Promise.all([loadPhotos(), loadNotes()])
    } catch {
      /* ignore */
    }
  }

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
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // Close the topmost layer first, not the whole drawer
      if (lightbox) setLightbox(null)
      else if (sendConfirmOpen) setSendConfirmOpen(false)
      else if (resolveOpen) setResolveOpen(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lightbox, sendConfirmOpen, resolveOpen])

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

  const submitFine = async (e) => {
    e.preventDefault()
    const amount = parseFloat(fineAmount)
    if (!amount || amount <= 0) return
    setBusy(true)
    try {
      await onFine(violation.id, amount, fineForm.kind, fineNote.trim() || null)
      setFineForm(null)
      setFineAmount('')
      setFineNote('')
      await loadNotes()
    } catch {
      /* toast handled upstream */
    } finally {
      setBusy(false)
    }
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
  // Slice the ISO string directly — round-tripping through Date shifts the
  // day for users east of UTC (naive timestamp parsed as local, re-emitted as UTC).
  const dueDateValue = violation.due_date ? violation.due_date.split('T')[0] : ''
  const atMaxNotice = (violation.notice_level || 0) >= NOTICE_LEVELS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm anim-fade" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="anim-slide-right relative w-full max-w-md bg-[#0b1020] border-l border-white/10 h-full overflow-y-auto shadow-2xl shadow-black/60">
        {/* Status accent rail */}
        <span className={`absolute inset-y-0 left-0 w-[2px] z-20 ${
          isOverdue(violation) || violation.status === 'escalated' ? 'bg-gradient-to-b from-red-500/80 via-red-500/30 to-transparent'
          : violation.status === 'resolved' ? 'bg-gradient-to-b from-emerald-500/80 via-emerald-500/30 to-transparent'
          : violation.status === 'noticed' ? 'bg-gradient-to-b from-amber-500/80 via-amber-500/30 to-transparent'
          : 'bg-gradient-to-b from-blue-500/80 via-blue-500/30 to-transparent'
        }`} />
        {/* Header */}
        <div className="sticky top-0 bg-[#0b1020]/90 backdrop-blur-xl border-b border-white/[0.06] px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-slate-100 font-semibold truncate">{violation.violation_type}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {violation.resident_name} · {violation.resident_unit}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close case details" className="text-slate-400 hover:text-slate-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 shrink-0">×</button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge config={STATUS_CONFIG[violation.status]} />
            <Badge config={PRIORITY_CONFIG[violation.priority]}>{PRIORITY_CONFIG[violation.priority]?.label} priority</Badge>
            {violation.notice_level > 0 && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/25">{violation.notice_label}</Badge>
            )}
            {overdue && <Badge className="bg-red-500/10 text-red-400 border-red-500/25">Overdue</Badge>}
            {violation.repeat_count > 0 && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/25" title="Same violation type for this resident within 12 months">Repeat offense</Badge>
            )}
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Description */}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Description</p>
            <p className="text-sm text-slate-400 leading-relaxed">{violation.description}</p>
            <p className="text-xs text-slate-600 mt-2">Opened {formatDate(violation.created_at)}</p>
          </div>

          {/* Quick controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Status</label>
              <select className={`${inputCls} w-full`} value={violation.status} disabled={busy} onChange={(e) => handleStatusSelect(e.target.value)}>
                <option value="open">Open</option>
                <option value="noticed">Noticed</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Priority</label>
              <select className={`${inputCls} w-full`} value={violation.priority} disabled={busy} onChange={(e) => runUpdate({ priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Cure deadline */}
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 block">Cure Deadline</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={`${inputCls} flex-1`}
                value={dueDateValue}
                disabled={busy}
                onChange={(e) => e.target.value && runUpdate({ due_date: e.target.value })}
              />
              {due && (
                <span className={`text-xs font-medium ${due.tone === 'overdue' ? 'text-red-400' : due.tone === 'soon' ? 'text-amber-400' : 'text-slate-400'}`}>
                  {due.text}
                </span>
              )}
            </div>
          </div>

          {/* Photo evidence */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Photo Evidence</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto || photos.length >= 8}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-white/10 text-slate-400 hover:bg-white/[0.06] hover:border-white/20 disabled:opacity-50 transition-colors"
                title={photos.length >= 8 ? 'Photo limit reached (8)' : 'Attach an inspection photo'}
              >
                {uploadingPhoto ? <Spinner className="w-3 h-3" /> : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
                Add photo
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoUpload} />
            </div>
            {photoError && <p className="text-xs text-red-400 mb-2">{photoError}</p>}
            {photos.length === 0 ? (
              <p className="text-xs text-slate-600">No photos yet. Photos strengthen enforcement and are cited in the violation letter.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <button key={p.id} onClick={() => setLightbox(p)} aria-label="View evidence photo" className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-[#3b82f6]/60 transition-all group">
                    <img src={p.data} alt={p.caption || 'Violation evidence'} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fine ledger */}
          <div className="vt-card p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">Fines</p>
              {violation.fine_amount > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  violation.fine_paid
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                }`}>
                  {violation.fine_paid ? '✓ Settled' : `${currency(violation.fine_balance ?? violation.fine_amount)} due`}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-slate-100">{currency(violation.fine_amount)}</span>
              <span className="text-xs text-slate-500">assessed</span>
              {violation.fine_paid_total > 0 && (
                <span className="text-xs text-emerald-400">{currency(violation.fine_paid_total)} paid</span>
              )}
            </div>

            {fineForm ? (
              <form onSubmit={submitFine} className="mt-3 space-y-2">
                <p className="text-xs text-slate-400">{fineForm.kind === 'assessment' ? 'Assess a fine' : 'Record a payment'}</p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">$</span>
                  <input
                    type="number" step="0.01" min="0.01" autoFocus required
                    className={`${inputCls} flex-1`}
                    placeholder="0.00"
                    value={fineAmount}
                    onChange={(e) => setFineAmount(e.target.value)}
                  />
                </div>
                <input
                  className={`${inputCls} w-full`}
                  placeholder={fineForm.kind === 'assessment' ? 'Reason (e.g. second offense)' : 'Reference (e.g. check #1042)'}
                  value={fineNote}
                  onChange={(e) => setFineNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="flex-1 py-1.5 text-xs bg-gradient-to-b from-[#3b82f6] to-[#2563eb] hover:from-[#60a5fa] hover:to-[#3b82f6] disabled:opacity-60 text-white font-semibold rounded-lg">
                    {fineForm.kind === 'assessment' ? 'Assess' : 'Record'}
                  </button>
                  <button type="button" onClick={() => setFineForm(null)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="flex gap-2 mt-3">
                <button onClick={() => setFineForm({ kind: 'assessment' })} disabled={busy} className="flex-1 py-1.5 text-xs border border-white/10 text-slate-400 hover:bg-white/[0.06] hover:border-white/20 rounded-lg transition-colors">
                  + Assess fine
                </button>
                <button
                  onClick={() => setFineForm({ kind: 'payment' })}
                  disabled={busy || (violation.fine_balance ?? 0) <= 0}
                  className="flex-1 py-1.5 text-xs border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                  title={(violation.fine_balance ?? 0) <= 0 ? 'Nothing outstanding' : ''}
                >
                  Record payment
                </button>
              </div>
            )}
          </div>

          {/* Enforcement actions */}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Enforcement</p>
            <div className="grid grid-cols-2 gap-2">
              {violation.resident_email ? (
                <button
                  onClick={() => setSendConfirmOpen(true)}
                  disabled={sending}
                  className="flex items-center justify-center gap-1.5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-slate-100 rounded-lg transition-colors"
                >
                  {sending ? <Spinner className="w-3.5 h-3.5" /> : null}
                  {violation.email_sent_at ? 'Resend Letter' : 'Email Letter'}
                </button>
              ) : (
                <button disabled className="py-2 text-sm bg-slate-800 text-slate-600 rounded-lg cursor-not-allowed" title="Resident has no email">No email on file</button>
              )}
              <button onClick={() => onViewLetter(violation)} className="py-2 text-sm border border-slate-700 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors">
                View Letter
              </button>
              <button
                onClick={async () => { setDownloadingPdf(true); try { await onDownloadPdf(violation) } finally { setDownloadingPdf(false) } }}
                disabled={downloadingPdf}
                className="col-span-2 flex items-center justify-center gap-1.5 py-2 text-sm border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
                title="Print-ready PDF for certified mail or hand delivery"
              >
                {downloadingPdf ? <Spinner className="w-3.5 h-3.5" /> : null}
                Download Letter PDF
              </button>
              <button
                onClick={() => onCopyPortalLink(violation)}
                className="flex items-center justify-center gap-1.5 py-2 text-sm border border-[#3b82f6]/25 text-[#60a5fa] hover:bg-[#3b82f6]/10 rounded-lg transition-colors"
                title="Copy a secure link where the resident can view this case and respond — no account needed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                Resident link
              </button>
              <button
                onClick={() => onCaseFile(violation)}
                className="flex items-center justify-center gap-1.5 py-2 text-sm border border-slate-700 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors"
                title="Export the complete case: summary, audit timeline, fine ledger, sent letter, and photo evidence"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Case file
              </button>
              <button
                onClick={handleEscalate}
                disabled={busy || atMaxNotice}
                className="col-span-2 py-2 text-sm bg-red-600/90 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-100 rounded-lg transition-colors"
                title={atMaxNotice ? 'Already at highest level' : ''}
              >
                {atMaxNotice ? 'Max escalation reached' : `Escalate → ${NOTICE_LEVELS[(violation.notice_level || 0) + 1]}`}
              </button>
            </div>
            {violation.email_sent_at && (
              <p className="text-xs text-[#3b82f6]/80 mt-2">Last letter emailed {formatDate(violation.email_sent_at)}</p>
            )}
          </div>

          {/* Activity timeline */}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Activity Log</p>
            <form onSubmit={handleAddNote} className="flex items-center gap-2 mb-4">
              <input
                className={`${inputCls} flex-1`}
                placeholder="Add a note (e.g. spoke with resident)…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button type="submit" disabled={savingNote || !newNote.trim()} className="text-sm px-3 py-1.5 bg-gradient-to-b from-[#3b82f6] to-[#2563eb] hover:from-[#60a5fa] hover:to-[#3b82f6] shadow-lg shadow-[#2563eb]/40 active:scale-[.98] disabled:opacity-50 text-white font-semibold rounded-lg shrink-0">
                {savingNote ? <Spinner className="w-3.5 h-3.5" /> : 'Add'}
              </button>
            </form>

            {notesLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm py-2"><Spinner className="w-4 h-4" /> Loading…</div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-slate-600">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {[...notes].reverse().map((n) => (
                  <div key={n.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className={`w-2 h-2 rounded-full ${n.kind === 'system' ? 'bg-slate-500' : n.kind === 'resident' ? 'bg-emerald-400' : 'bg-[#3b82f6]'}`} />
                      <span className="w-px flex-1 bg-slate-800 mt-1" />
                    </div>
                    <div className="pb-1 min-w-0">
                      {n.kind === 'resident' && (
                        <span className="inline-block text-[10px] px-1.5 py-0.5 mb-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium">Resident response</span>
                      )}
                      <p className={`text-sm ${n.kind === 'system' ? 'text-slate-400 italic' : n.kind === 'resident' ? 'text-emerald-100/90' : 'text-slate-300'}`}>{n.body}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5" title={formatDateTime(n.created_at)}>{relativeTime(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="pt-2 border-t border-slate-800">
            <button onClick={() => onDelete(violation.id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
              Delete this violation
            </button>
          </div>
        </div>
      </div>

      {/* Send-letter confirmation — misfired notices are a real liability */}
      {sendConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={(e) => { if (e.target === e.currentTarget) setSendConfirmOpen(false) }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-slate-100 text-sm font-medium">Send this violation notice?</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {violation.notice_label !== 'None' ? violation.notice_label : 'Notice'} → <span className="text-slate-300">{violation.resident_email}</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">The letter is generated from the current violation details{photos.length > 0 ? ` and cites the ${photos.length} photo${photos.length !== 1 ? 's' : ''} on file` : ''}. Sending records the notice in the audit log.</p>
            <div className="flex gap-3">
              <button onClick={() => setSendConfirmOpen(false)} className="flex-1 py-2 text-sm border border-slate-600 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => { setSendConfirmOpen(false); onSendEmail(violation.id) }} className="flex-1 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-slate-100 rounded-lg transition-colors font-medium">Send Notice</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/85 anim-fade" onClick={(e) => { if (e.target === e.currentTarget) setLightbox(null) }}>
          <div className="max-w-3xl w-full">
            <img src={lightbox.data} alt={lightbox.caption || 'Violation evidence'} className="w-full max-h-[75vh] object-contain rounded-xl" />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-slate-400">{lightbox.caption || `Added ${formatDate(lightbox.created_at)}`}</p>
              <div className="flex gap-2">
                <button onClick={() => handleDeletePhoto(lightbox.id)} className="px-3 py-1.5 text-xs text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors">Delete photo</button>
                <button onClick={() => setLightbox(null)} className="px-3 py-1.5 text-xs text-slate-300 border border-white/15 hover:bg-white/[0.06] rounded-lg transition-colors">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve confirmation */}
      {resolveOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={(e) => { if (e.target === e.currentTarget) setResolveOpen(false) }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-slate-100 text-sm font-medium">Mark violation resolved?</p>
                <p className="text-xs text-slate-500">This records the resolution in the audit log.</p>
              </div>
            </div>
            <label className="block text-xs text-slate-400 mb-1.5">How was it resolved? <span className="text-slate-600">(optional)</span></label>
            <textarea
              autoFocus
              className={`${inputCls} w-full resize-none`}
              rows={3}
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="e.g. Resident corrected the violation; verified on site."
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setResolveOpen(false)} className="flex-1 py-2 text-sm border border-slate-600 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={confirmResolve} className="flex-1 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-slate-100 rounded-lg transition-colors font-medium">Mark Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
