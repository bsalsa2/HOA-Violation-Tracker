import React, { useState, useEffect, useCallback, useRef } from 'react'
import emailjs from '@emailjs/browser'
import { residentAPI, violationAPI, hoaAPI } from '../api'
import OverviewTab from '../components/OverviewTab'
import ViolationsTab from '../components/ViolationsTab'
import ResidentsTab from '../components/ResidentsTab'
import ViolationDrawer from '../components/ViolationDrawer'
import CommandPalette from '../components/CommandPalette'
import HoaSwitcher from '../components/HoaSwitcher'
import { AddResidentModal, AddViolationModal, ImportCSVModal } from '../components/modals'
import { Modal, ConfirmDialog, ToastStack, Spinner } from '../components/primitives'
import { openBoardReport } from '../lib/boardReport'
import { downloadViolationsCsv, downloadLetterPdf } from '../lib/export'

function getEmailJSConfig() {
  return {
    service: import.meta.env.VITE_EJS_SERVICE || import.meta.env.VITE_EMAILJS_SERVICE_ID,
    template: import.meta.env.VITE_EJS_TEMPLATE || import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    key: import.meta.env.VITE_EJS_KEY || import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
  }
}

export default function Dashboard({ hoa, hoas, hoaEmail, onSaveHoaEmail, onSwitchHoa, onShowPortfolio, onAddClient, onEditClient, setToken }) {
  const hoaId = hoa.id

  const [residents, setResidents] = useState([])
  const [violations, setViolations] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)

  const [tab, setTab] = useState('overview')
  const [violationQuery, setViolationQuery] = useState('')

  const [toasts, setToasts] = useState([])
  const toastCounter = useRef(0)

  const [selectedId, setSelectedId] = useState(null)
  const [sendingEmail, setSendingEmail] = useState({})
  const [letterModal, setLetterModal] = useState(null)
  const letterCache = useRef({})

  const [showAddResident, setShowAddResident] = useState(false)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [showAddViolation, setShowAddViolation] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastCounter.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])
  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  // ---- Data loading (scoped to active HOA) ----
  const loadResidents = useCallback(async () => {
    try {
      const res = await residentAPI.getAll(hoaId)
      setResidents(res.data)
    } catch {}
  }, [hoaId])

  const loadViolations = useCallback(async () => {
    try {
      const res = await violationAPI.getAll(hoaId)
      setViolations(res.data)
    } catch {}
  }, [hoaId])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const res = await hoaAPI.getAnalytics(hoaId)
      setAnalytics(res.data)
    } catch {} finally {
      setAnalyticsLoading(false)
    }
  }, [hoaId])

  useEffect(() => {
    let cancelled = false
    setDataLoading(true)
    setSelectedId(null)
    setViolationQuery('')
    letterCache.current = {}
    Promise.all([
      residentAPI.getAll(hoaId).then((r) => !cancelled && setResidents(r.data)).catch(() => {}),
      violationAPI.getAll(hoaId).then((r) => !cancelled && setViolations(r.data)).catch(() => {}),
      hoaAPI.getAnalytics(hoaId).then((r) => !cancelled && setAnalytics(r.data)).catch(() => {}),
    ]).finally(() => { if (!cancelled) { setDataLoading(false); setAnalyticsLoading(false) } })
    return () => { cancelled = true }
  }, [hoaId])

  // ---- ⌘K ----
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setToken(null)
  }

  // ---- Violation handlers ----
  const handleUpdateViolation = useCallback(async (violationId, fields) => {
    try {
      const res = await violationAPI.update(violationId, fields)
      setViolations((prev) => prev.map((v) => (v.id === violationId ? { ...v, ...res.data } : v)))
      loadAnalytics()
      return res.data
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update violation.', 'error')
      throw err
    }
  }, [addToast, loadAnalytics])

  const handleEscalate = useCallback(async (violationId) => {
    try {
      const res = await violationAPI.escalate(violationId)
      setViolations((prev) => prev.map((v) => (v.id === violationId ? { ...v, ...res.data } : v)))
      loadAnalytics()
      addToast(`Escalated to ${res.data.notice_label}.`)
      return res.data
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to escalate.', 'error')
      throw err
    }
  }, [addToast, loadAnalytics])

  const handleSendEmail = useCallback(async (violationId) => {
    const cfg = getEmailJSConfig()
    if (!cfg.service || !cfg.template || !cfg.key) {
      addToast('EmailJS is not configured. Check your Vercel environment variables.', 'error')
      return
    }
    if (!hoaEmail) {
      addToast('Please configure your HOA email address in settings before sending letters.', 'error')
      return
    }
    const violation = violations.find((v) => v.id === violationId)
    if (!violation?.resident_email) {
      addToast('Resident has no email address.', 'error')
      return
    }
    setSendingEmail((prev) => ({ ...prev, [violationId]: true }))
    try {
      const letterRes = await violationAPI.getLetter(violationId)
      await emailjs.send(
        cfg.service, cfg.template,
        {
          to_email: violation.resident_email,
          to_name: violation.resident_name,
          hoa_name: hoa?.name || 'HOA',
          hoa_email: hoaEmail,
          violation_type: violation.violation_type,
          violation_letter: letterRes.data.letter,
          from_name: hoa?.name || 'ViolationTrack',
          from_email: hoaEmail,
          reply_to: hoaEmail,
        },
        cfg.key
      )
      const markRes = await violationAPI.markSent(violationId)
      const updated = markRes.data.violation
      setViolations((prev) => prev.map((v) => (v.id === violationId ? { ...v, ...updated } : v)))
      loadAnalytics()
      addToast(`Letter sent to ${violation.resident_email}.`)
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : (detail || err.text || err.message || 'Failed to send email.')
      addToast(msg, 'error')
    } finally {
      setSendingEmail((prev) => ({ ...prev, [violationId]: false }))
    }
  }, [violations, hoaEmail, addToast, loadAnalytics])

  const handleViewLetter = useCallback(async (violation) => {
    if (letterCache.current[violation.id]) {
      setLetterModal({ violation, text: letterCache.current[violation.id] })
      return
    }
    try {
      const res = await violationAPI.getLetter(violation.id)
      letterCache.current[violation.id] = res.data.letter
      setLetterModal({ violation, text: res.data.letter })
    } catch {
      addToast('Failed to generate letter.', 'error')
    }
  }, [addToast])

  const handleDownloadPdf = useCallback(async (violation) => {
    try {
      const res = await violationAPI.getLetterPdf(violation.id)
      downloadLetterPdf(res.data, violation.resident_name)
      addToast('Letter PDF downloaded — ready to print for certified mail.')
    } catch {
      addToast('Failed to generate the PDF.', 'error')
    }
  }, [addToast])

  const handleExportCsv = useCallback(() => {
    if (!violations.length) {
      addToast('No violations to export yet.', 'error')
      return
    }
    downloadViolationsCsv(violations, hoa?.name)
    addToast(`Exported ${violations.length} violations to CSV.`)
  }, [violations, hoa, addToast])

  const handleDeleteViolation = useCallback((violationId) => {
    setConfirmDelete({
      message: 'Delete this violation? This cannot be undone.',
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          await violationAPI.delete(violationId)
          setViolations((prev) => prev.filter((v) => v.id !== violationId))
          setSelectedId((id) => (id === violationId ? null : id))
          loadAnalytics()
          addToast('Violation deleted.')
        } catch {
          addToast('Failed to delete violation.', 'error')
        }
      },
    })
  }, [addToast, loadAnalytics])

  const handleDeleteResident = useCallback((residentId, residentName) => {
    setConfirmDelete({
      message: `Delete ${residentName}? All their violations will also be deleted.`,
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          await residentAPI.delete(residentId)
          setResidents((prev) => prev.filter((r) => r.id !== residentId))
          loadViolations()
          loadAnalytics()
          addToast('Resident deleted.')
        } catch {
          addToast('Failed to delete resident.', 'error')
        }
      },
    })
  }, [addToast, loadViolations, loadAnalytics])

  const goToResidentViolations = useCallback((resident) => {
    setViolationQuery(resident.name)
    setTab('violations')
  }, [])

  const goToResidentById = useCallback((residentId) => {
    const r = residents.find((x) => x.id === residentId)
    if (r) goToResidentViolations(r)
  }, [residents, goToResidentViolations])

  // ---- Board report (open window in-gesture, then fetch fresh analytics) ----
  const handleBoardReport = useCallback(() => {
    const win = window.open('', '_blank')
    if (!win) {
      addToast('Allow pop-ups to generate the report.', 'error')
      return
    }
    try {
      win.document.write('<p style="font-family:system-ui,sans-serif;padding:24px;color:#475569">Generating report…</p>')
    } catch {}
    hoaAPI.getAnalytics(hoaId)
      .then((res) => { setAnalytics(res.data); openBoardReport(hoa, res.data, violations, win) })
      .catch(() => openBoardReport(hoa, analytics, violations, win))
  }, [hoa, hoaId, violations, analytics, addToast])

  const selectedViolation = violations.find((v) => v.id === selectedId) || null
  const canAdd = residents.length > 0
  const overdueCount = analytics?.kpis?.overdue_violations || 0

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'violations', label: 'Violations', badge: violations.filter((v) => v.status !== 'resolved').length },
    { key: 'residents', label: 'Residents', badge: residents.length },
  ]

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <header className="relative bg-[#0b0e14]/85 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-30">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/50 to-transparent" />
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] rounded-xl flex items-center justify-center shrink-0 ring-1 ring-white/15" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 0 rgba(255,255,255,0.3)' }}>
                <svg className="w-4 h-4 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <HoaSwitcher hoas={hoas} activeHoa={hoa} onSwitch={onSwitchHoa} onShowPortfolio={onShowPortfolio} onAddClient={onAddClient} />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setPaletteOpen(true)} className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 bg-white/[0.05] hover:bg-white/[0.07] border border-white/10 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Search <kbd className="text-[10px] border border-white/10 rounded px-1 ml-0.5">⌘K</kbd>
              </button>
              <button onClick={handleBoardReport} className="px-3 py-1.5 text-xs text-slate-400 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors">Board Report</button>
              <button onClick={onEditClient} className="hidden md:block px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors">Edit</button>
              <button onClick={handleLogout} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors">Sign Out</button>
            </div>
          </div>

          <div className="flex items-center gap-1 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key ? 'text-slate-100' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${tab === t.key ? 'bg-[#3b82f6]/15 text-[#60a5fa]' : 'bg-white/[0.06] text-slate-400'}`}>{t.badge}</span>
                )}
                {t.key === 'violations' && overdueCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">{overdueCount} overdue</span>
                )}
                {tab === t.key && (
                  <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#2563eb]" style={{ boxShadow: '0 0 10px rgba(59,130,246,0.6)' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'overview' && <OverviewTab analytics={analytics} loading={analyticsLoading} onOpenResident={goToResidentById} />}
        {tab === 'violations' && (
          <ViolationsTab
            violations={violations}
            query={violationQuery}
            setQuery={setViolationQuery}
            onOpen={(v) => setSelectedId(v.id)}
            onNew={() => setShowAddViolation(true)}
            onExport={handleExportCsv}
            canAdd={canAdd}
          />
        )}
        {tab === 'residents' && (
          <ResidentsTab
            residents={residents}
            onAdd={() => setShowAddResident(true)}
            onImport={() => setShowImportCSV(true)}
            onDelete={handleDeleteResident}
            onViewViolations={goToResidentViolations}
          />
        )}
      </main>

      {selectedViolation && (
        <ViolationDrawer
          violation={selectedViolation}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdateViolation}
          onEscalate={handleEscalate}
          onSendEmail={handleSendEmail}
          onViewLetter={handleViewLetter}
          onDelete={handleDeleteViolation}
          onDownloadPdf={handleDownloadPdf}
          sending={!!sendingEmail[selectedViolation.id]}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        residents={residents}
        violations={violations}
        onSelectViolation={(v) => setSelectedId(v.id)}
        onSelectResident={goToResidentViolations}
        actions={[
          { id: 'new-violation', label: 'New violation', run: () => { if (canAdd) setShowAddViolation(true); else addToast('Add a resident first.', 'error') } },
          { id: 'new-resident', label: 'New resident', run: () => setShowAddResident(true) },
          { id: 'import-csv', label: 'Import residents from CSV', run: () => setShowImportCSV(true) },
          { id: 'board-report', label: 'Generate board report', run: handleBoardReport },
          { id: 'export-csv', label: 'Export violations to CSV', run: handleExportCsv },
          { id: 'switch-portfolio', label: 'View all clients (portfolio)', run: onShowPortfolio },
        ]}
      />

      {showAddResident && (
        <AddResidentModal
          hoaId={hoaId}
          onClose={() => setShowAddResident(false)}
          onAdded={(r) => { setResidents((prev) => [...prev, r].sort((a, b) => (a.name || '').localeCompare(b.name || ''))); setShowAddResident(false); loadAnalytics(); addToast(`${r.name} added.`) }}
        />
      )}

      {showImportCSV && (
        <ImportCSVModal
          hoaId={hoaId}
          onClose={() => setShowImportCSV(false)}
          addToast={addToast}
          onDone={(added, errors) => {
            setShowImportCSV(false)
            loadResidents()
            loadAnalytics()
            if (errors.length > 0) addToast(`Imported ${added} residents. ${errors.length} rows skipped.`, added === 0 ? 'error' : 'success')
            else addToast(`Imported ${added} residents.`)
          }}
        />
      )}

      {showAddViolation && (
        <AddViolationModal
          hoaId={hoaId}
          residents={residents}
          onClose={() => setShowAddViolation(false)}
          onAdded={() => { setShowAddViolation(false); loadViolations(); loadAnalytics(); addToast('Violation created.') }}
        />
      )}

      {letterModal && (
        <Modal title={`Violation Letter — ${letterModal.violation.violation_type}`} subtitle={`${letterModal.violation.resident_name} · ${letterModal.violation.resident_unit}`} onClose={() => setLetterModal(null)}>
          <div className="bg-white/[0.04] ring-1 ring-white/[0.06] rounded-xl p-5">
            <pre className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed font-sans">{letterModal.text}</pre>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => { navigator.clipboard?.writeText(letterModal.text); addToast('Letter copied to clipboard.') }}
              className="flex-1 py-2 text-sm border border-white/10 text-slate-400 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              Copy to Clipboard
            </button>
            <button
              onClick={() => handleDownloadPdf(letterModal.violation)}
              className="flex-1 py-2 text-sm border border-white/10 text-slate-400 hover:bg-white/[0.06] rounded-lg transition-colors"
              title="Print-ready PDF for certified mail"
            >
              Download PDF
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog message={confirmDelete.message} onConfirm={confirmDelete.onConfirm} onCancel={() => setConfirmDelete(null)} />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
