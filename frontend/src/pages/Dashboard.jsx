import React, { useState, useEffect, useCallback, useRef } from 'react'
import { hoaAPI, residentAPI, violationAPI } from '../api'
import HOASetup from './HOASetup'

const VIOLATION_TYPES = [
  'Landscaping / Lawn Care',
  'Parking Violation',
  'Noise Complaint',
  'Trash / Debris',
  'Exterior Maintenance',
  'Pet Violation',
  'Architectural Modification',
  'Pool / Amenity Misuse',
  'Commercial Vehicle',
  'Other',
]

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  noticed: { label: 'Noticed', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  escalated: { label: 'Escalated', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function Toast({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border max-w-sm text-sm ${
            t.type === 'error'
              ? 'bg-red-950 border-red-800 text-red-200'
              : 'bg-slate-800 border-slate-700 text-slate-100'
          }`}
        >
          {t.type === 'error' ? (
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-50 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-white text-sm">{message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm border border-slate-600 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h3 className="text-white font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function Dashboard({ setToken }) {
  const [hoa, setHoa] = useState(null)
  const [hoaLoading, setHoaLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [stats, setStats] = useState(null)
  const [residents, setResidents] = useState([])
  const [violations, setViolations] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [toasts, setToasts] = useState([])
  const toastCounter = useRef(0)

  const [showAddResident, setShowAddResident] = useState(false)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [showAddViolation, setShowAddViolation] = useState(false)
  const [letterModal, setLetterModal] = useState(null)
  const [editHOAModal, setEditHOAModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [sendingEmail, setSendingEmail] = useState({})
  const [letters, setLetters] = useState({})
  const [letterLoading, setLetterLoading] = useState({})

  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastCounter.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setHoaLoading(true)
    try {
      const hoaRes = await hoaAPI.getMe()
      setHoa(hoaRes.data)
      setNeedsSetup(false)
      await Promise.all([loadResidents(), loadViolations(), loadStats()])
    } catch (err) {
      if (err.response?.status === 404) {
        setNeedsSetup(true)
      }
    } finally {
      setHoaLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const res = await hoaAPI.getStats()
      setStats(res.data)
    } catch {}
  }

  const loadResidents = async () => {
    try {
      const res = await residentAPI.getAll()
      setResidents(res.data)
    } catch {}
  }

  const loadViolations = async () => {
    try {
      const res = await violationAPI.getAll(statusFilter || undefined)
      setViolations(res.data)
    } catch {}
  }

  useEffect(() => {
    if (hoa) loadViolations()
  }, [statusFilter])

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setToken(null)
  }

  const handleHOASetupComplete = (hoaData) => {
    setHoa(hoaData)
    setNeedsSetup(false)
    loadStats()
  }

  const handleSendEmail = async (violationId) => {
    setSendingEmail((prev) => ({ ...prev, [violationId]: true }))
    try {
      const res = await violationAPI.sendLetter(violationId)
      addToast('Violation letter sent successfully.')
      setViolations((prev) =>
        prev.map((v) =>
          v.id === violationId
            ? { ...v, status: 'noticed', email_sent_at: res.data.email_sent_at }
            : v
        )
      )
      loadStats()
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg).join(', ')
        : (detail || err.message || 'Failed to send email. Check that RESEND_API_KEY is configured in Railway.')
      addToast(msg, 'error')
    } finally {
      setSendingEmail((prev) => ({ ...prev, [violationId]: false }))
    }
  }

  const handleViewLetter = async (violation) => {
    if (letters[violation.id]) {
      setLetterModal({ violation, text: letters[violation.id] })
      return
    }
    setLetterLoading((prev) => ({ ...prev, [violation.id]: true }))
    try {
      const res = await violationAPI.getLetter(violation.id)
      setLetters((prev) => ({ ...prev, [violation.id]: res.data.letter }))
      setLetterModal({ violation, text: res.data.letter })
    } catch {
      addToast('Failed to generate letter.', 'error')
    } finally {
      setLetterLoading((prev) => ({ ...prev, [violation.id]: false }))
    }
  }

  const handleStatusChange = async (violationId, status) => {
    try {
      await violationAPI.updateStatus(violationId, status)
      setViolations((prev) => prev.map((v) => (v.id === violationId ? { ...v, status } : v)))
      loadStats()
    } catch {
      addToast('Failed to update status.', 'error')
    }
  }

  const handleDeleteViolation = (violationId) => {
    setConfirmDelete({
      message: 'Delete this violation? This cannot be undone.',
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          await violationAPI.delete(violationId)
          setViolations((prev) => prev.filter((v) => v.id !== violationId))
          loadStats()
          addToast('Violation deleted.')
        } catch {
          addToast('Failed to delete violation.', 'error')
        }
      },
    })
  }

  const handleDeleteResident = (residentId, residentName) => {
    setConfirmDelete({
      message: `Delete ${residentName}? All their violations will also be deleted.`,
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          await residentAPI.delete(residentId)
          setResidents((prev) => prev.filter((r) => r.id !== residentId))
          loadViolations()
          loadStats()
          addToast('Resident deleted.')
        } catch {
          addToast('Failed to delete resident.', 'error')
        }
      },
    })
  }

  if (hoaLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return (
      <HOASetup
        onComplete={handleHOASetupComplete}
        onSkip={() => setNeedsSetup(false)}
      />
    )
  }

  const filteredViolations = statusFilter
    ? violations.filter((v) => v.status === statusFilter)
    : violations

  const residentMap = Object.fromEntries(residents.map((r) => [r.id, r]))

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div>
              <h1 className="font-semibold text-sm text-white leading-none">
                {hoa ? hoa.name : 'ViolationTrack'}
              </h1>
              {hoa && <p className="text-xs text-slate-500 mt-0.5">{hoa.address}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hoa && (
              <button
                onClick={() => setEditHOAModal(true)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
              >
                Edit HOA
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Residents', value: stats.total_residents, color: 'text-white' },
              { label: 'Total Violations', value: stats.total_violations, color: 'text-white' },
              { label: 'Open', value: stats.open_violations, color: 'text-amber-400' },
              { label: 'Noticed', value: stats.noticed_violations, color: 'text-blue-400' },
              { label: 'Resolved', value: stats.resolved_violations, color: 'text-green-400' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-slate-500 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {!hoa && (
          <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-200 text-sm font-medium">HOA not configured</p>
              <p className="text-blue-300/70 text-xs mt-0.5">
                <button onClick={() => setNeedsSetup(true)} className="underline hover:no-underline">
                  Set up your HOA
                </button>{' '}
                to unlock all features.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Residents Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="font-semibold text-slate-100">Residents</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportCSV(true)}
                  className="px-3 py-1.5 text-xs text-slate-300 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
                >
                  Import CSV
                </button>
                <button
                  onClick={() => setShowAddResident(true)}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                >
                  + Add
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-800 overflow-y-auto max-h-96 flex-1">
              {residents.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No residents yet. Add one or import a CSV.
                </div>
              ) : (
                residents.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/50 group transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{r.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">Unit {r.unit}</span>
                        {r.email ? (
                          <span className="text-xs text-slate-500 truncate">{r.email}</span>
                        ) : (
                          <span className="text-xs text-amber-500/70">No email</span>
                        )}
                        {r.phone && <span className="text-xs text-slate-500">{r.phone}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteResident(r.id, r.name)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-all"
                      title="Delete resident"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Violations Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-slate-100">Violations</h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All</option>
                  <option value="open">Open</option>
                  <option value="noticed">Noticed</option>
                  <option value="resolved">Resolved</option>
                  <option value="escalated">Escalated</option>
                </select>
              </div>
              <button
                onClick={() => setShowAddViolation(true)}
                disabled={residents.length === 0}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                title={residents.length === 0 ? 'Add residents first' : ''}
              >
                + Add
              </button>
            </div>

            <div className="divide-y divide-slate-800 overflow-y-auto max-h-[36rem] flex-1">
              {filteredViolations.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  {statusFilter ? `No ${statusFilter} violations.` : 'No violations yet.'}
                </div>
              ) : (
                filteredViolations.map((v) => {
                  const resident = residentMap[v.resident_id]
                  const isSending = sendingEmail[v.id]
                  const isLoadingLetter = letterLoading[v.id]
                  const hasEmail = resident?.email

                  return (
                    <div key={v.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-100">{v.violation_type}</span>
                            <StatusBadge status={v.status} />
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{resident?.name} · Unit {resident?.unit}</p>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{v.description}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            {new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          {v.email_sent_at && (
                            <p className="text-xs text-blue-400/70 mt-1">
                              Letter sent {new Date(v.email_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <select
                            value={v.status}
                            onChange={(e) => handleStatusChange(v.id, e.target.value)}
                            className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
                          >
                            <option value="open">Open</option>
                            <option value="noticed">Noticed</option>
                            <option value="resolved">Resolved</option>
                            <option value="escalated">Escalated</option>
                          </select>

                          <button
                            onClick={() => handleViewLetter(v)}
                            disabled={isLoadingLetter}
                            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                          >
                            {isLoadingLetter ? 'Loading...' : 'View Letter'}
                          </button>

                          {hasEmail ? (
                            <button
                              onClick={() => handleSendEmail(v.id)}
                              disabled={isSending}
                              className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              {isSending ? (
                                <>
                                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Sending...
                                </>
                              ) : v.email_sent_at ? 'Resend Email' : 'Send Email'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600" title="Resident has no email address">No email</span>
                          )}

                          <button
                            onClick={() => handleDeleteViolation(v.id)}
                            className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showAddResident && (
        <AddResidentModal
          onClose={() => setShowAddResident(false)}
          onAdded={(r) => {
            setResidents((prev) => [...prev, r])
            setShowAddResident(false)
            loadStats()
            addToast(`${r.name} added successfully.`)
          }}
        />
      )}

      {showImportCSV && (
        <ImportCSVModal
          onClose={() => setShowImportCSV(false)}
          onDone={(added, errors) => {
            setShowImportCSV(false)
            loadResidents()
            loadStats()
            if (errors.length > 0) {
              addToast(`Imported ${added} residents. ${errors.length} rows skipped.`, errors.length > 0 && added === 0 ? 'error' : 'success')
            } else {
              addToast(`Successfully imported ${added} residents.`)
            }
          }}
          addToast={addToast}
        />
      )}

      {showAddViolation && (
        <AddViolationModal
          residents={residents}
          onClose={() => setShowAddViolation(false)}
          onAdded={() => {
            setShowAddViolation(false)
            loadViolations()
            loadStats()
            addToast('Violation created.')
          }}
        />
      )}

      {letterModal && (
        <Modal title={`Violation Letter — ${letterModal.violation.violation_type}`} onClose={() => setLetterModal(null)}>
          <div className="bg-slate-800 rounded-xl p-4">
            <pre className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{letterModal.text}</pre>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(letterModal.text)
              addToast('Letter copied to clipboard.')
            }}
            className="mt-4 w-full py-2 text-sm border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Copy to Clipboard
          </button>
        </Modal>
      )}

      {editHOAModal && hoa && (
        <EditHOAModal
          hoa={hoa}
          onClose={() => setEditHOAModal(false)}
          onUpdated={(updated) => {
            setHoa(updated)
            setEditHOAModal(false)
            addToast('HOA updated.')
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.message}
          onConfirm={confirmDelete.onConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function AddResidentModal({ onClose, onAdded }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await residentAPI.create(name, unit, email || null, phone || null)
      onAdded(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add resident.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Add Resident" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            placeholder="Jane Smith"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Number</label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            placeholder="101"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Email <span className="text-slate-500 font-normal">(required for sending letters)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone <span className="text-slate-500 font-normal">(optional)</span></label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            placeholder="555-555-5555"
          />
        </div>
        {error && (
          <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">{error}</div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Adding...' : 'Add Resident'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ImportCSVModal({ onClose, onDone, addToast }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    try {
      const res = await residentAPI.importCSV(file)
      setResult(res.data)
    } catch (err) {
      addToast(err.response?.data?.detail || 'Import failed.', 'error')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <Modal title="Import Results" onClose={() => onDone(result.added, result.errors || [])}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-green-950 border border-green-800 rounded-xl p-4">
            <svg className="w-5 h-5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-green-200 text-sm">{result.message}</p>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Rows with issues:</p>
              <div className="bg-slate-800 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-300">{err}</p>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => onDone(result.added, result.errors || [])}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Import Residents from CSV" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-300">Required CSV format:</p>
          <p className="font-mono">name,unit,email,phone</p>
          <p className="font-mono text-slate-500">Jane Smith,101,jane@example.com,555-1234</p>
          <p className="mt-2">Columns <span className="text-slate-300">email</span> and <span className="text-slate-300">phone</span> are optional.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Select CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 file:cursor-pointer"
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !file}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Importing...' : 'Import'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

function AddViolationModal({ residents, onClose, onAdded }) {
  const [residentId, setResidentId] = useState(residents[0]?.id || '')
  const [violationType, setViolationType] = useState('')
  const [customType, setCustomType] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedResident = residents.find((r) => r.id === parseInt(residentId))
  const finalType = violationType === 'Other' ? customType : violationType

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!finalType.trim()) {
      setError('Please enter a violation type.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await violationAPI.create(parseInt(residentId, 10), finalType, description)
      onAdded()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : (detail || 'Failed to create violation.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Add Violation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Resident</label>
          <select
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            required
          >
            <option value="">Select a resident</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — Unit {r.unit}
              </option>
            ))}
          </select>
          {selectedResident && !selectedResident.email && (
            <p className="mt-1.5 text-xs text-amber-400">
              ⚠ This resident has no email. You won't be able to send them a letter.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Violation Type</label>
          <select
            value={violationType}
            onChange={(e) => setViolationType(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            required
          >
            <option value="">Select a type</option>
            {VIOLATION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {violationType === 'Other' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Custom Type</label>
            <input
              type="text"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
              placeholder="Describe the violation type"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500 resize-none"
            placeholder="Describe the specific violation in detail..."
            rows={3}
            required
          />
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create Violation'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditHOAModal({ hoa, onClose, onUpdated }) {
  const [name, setName] = useState(hoa.name)
  const [address, setAddress] = useState(hoa.address)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await hoaAPI.update(name, address)
      onUpdated(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update HOA.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Edit HOA" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">HOA Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
            required
          />
        </div>
        {error && (
          <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">{error}</div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default Dashboard
