import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { residentAPI, violationAPI, hoaAPI } from '../api'
import OverviewTab from '../components/OverviewTab'
import ViolationsTab from '../components/ViolationsTab'
import ResidentsTab from '../components/ResidentsTab'
import ViolationDrawer from '../components/ViolationDrawer'
import CommandPalette from '../components/CommandPalette'
import HoaSwitcher from '../components/HoaSwitcher'
import { AddResidentModal, AddViolationModal, ImportCSVModal, ImportViolationsCSVModal } from '../components/modals'
import { Modal, ConfirmDialog, ToastStack, Spinner } from '../components/primitives'
import { openBoardReport } from '../lib/boardReport'
import { downloadViolationsCsv, downloadLetterPdf } from '../lib/export'
import useDocumentTitle from '../lib/useDocumentTitle'

const currencyFmt = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const TABS = ['overview', 'violations', 'residents']
const VIOLATION_FILTERS = ['open', 'noticed', 'escalated', 'resolved', 'overdue']

export default function Dashboard({ hoa, hoas, onSwitchHoa, onShowPortfolio, onAddClient, onEditClient, setToken }) {
  const hoaId = hoa.id
  useDocumentTitle(`${hoa.name} — ViolationTrack`)

  const [residents, setResidents] = useState([])
  const [violations, setViolations] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)

  // Tab, open violation, and list filter live in the URL — refresh-safe and deep-linkable
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview'
  const setTab = useCallback((t) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (t === 'overview') next.delete('tab')
      else next.set('tab', t)
      next.delete('f') // filters belong to the view they were set in
      return next
    })
  }, [setSearchParams])
  const violationFilter = VIOLATION_FILTERS.includes(searchParams.get('f')) ? searchParams.get('f') : ''
  const setViolationFilter = useCallback((f) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (f) next.set('f', f)
      else next.delete('f')
      return next
    })
  }, [setSearchParams])
  const openOverdue = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'violations')
      next.set('f', 'overdue')
      return next
    })
  }, [setSearchParams])
  const [violationQuery, setViolationQuery] = useState('')

  const [toasts, setToasts] = useState([])
  const toastCounter = useRef(0)

  const selectedId = parseInt(searchParams.get('v'), 10) || null
  const setSelectedId = useCallback((id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('v', String(id))
      else next.delete('v')
      return next
    })
  }, [setSearchParams])
  const [sendingEmail, setSendingEmail] = useState({})
  const [letterModal, setLetterModal] = useState(null)
  const letterCache = useRef({})

  const [showAddResident, setShowAddResident] = useState(false)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [showImportViolations, setShowImportViolations] = useState(false)
  const [seedingDemo, setSeedingDemo] = useState(false)
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
  // Archived residents are included so history and the archive view work;
  // pickers and counts use the active subset.
  const loadResidents = useCallback(async () => {
    try {
      const res = await residentAPI.getAll(hoaId, true)
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
    setViolationQuery('')
    letterCache.current = {}
    Promise.all([
      residentAPI.getAll(hoaId, true).then((r) => !cancelled && setResidents(r.data)).catch(() => {}),
      violationAPI.getAll(hoaId).then((r) => !cancelled && setViolations(r.data)).catch(() => {}),
      hoaAPI.getAnalytics(hoaId).then((r) => !cancelled && setAnalytics(r.data)).catch(() => {}),
    ]).finally(() => { if (!cancelled) { setDataLoading(false); setAnalyticsLoading(false) } })
    return () => { cancelled = true }
  }, [hoaId])

  const activeResidents = useMemo(() => residents.filter((r) => !r.archived_at), [residents])

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

  const applySentViolation = useCallback((violationId, updated) => {
    setViolations((prev) => prev.map((v) => (v.id === violationId ? { ...v, ...updated } : v)))
    delete letterCache.current[violationId]
    loadAnalytics()
  }, [loadAnalytics])

  const handleSendEmail = useCallback(async (violationId) => {
    const violation = violations.find((v) => v.id === violationId)
    if (!violation?.resident_email) {
      addToast('Resident has no email address.', 'error')
      return
    }
    setSendingEmail((prev) => ({ ...prev, [violationId]: true }))

    // The server generates the letter, sends it through the configured email
    // provider (Brevo API / SMTP), and archives the exact copy in one
    // transaction — so the audit record is authoritative. 501 means no
    // provider is set up on the server yet.
    try {
      const res = await violationAPI.sendNotice(violationId)
      applySentViolation(violationId, res.data.violation)
      addToast(`Letter sent to ${violation.resident_email}.`)
    } catch (err) {
      const msg = err.response?.status === 501
        ? 'Email isn’t set up yet. Add an email provider key (BREVO_API_KEY) on the server to start sending notices.'
        : (err.response?.data?.detail || 'Failed to send email.')
      addToast(msg, 'error')
    } finally {
      setSendingEmail((prev) => ({ ...prev, [violationId]: false }))
    }
  }, [violations, addToast, applySentViolation])

  const handleViewLetter = useCallback(async (violation) => {
    const open = (data) => setLetterModal({ violation, data, view: data.sent_letter ? 'sent' : 'draft' })
    if (letterCache.current[violation.id]) {
      open(letterCache.current[violation.id])
      return
    }
    try {
      const res = await violationAPI.getLetter(violation.id)
      letterCache.current[violation.id] = res.data
      open(res.data)
    } catch {
      addToast('Failed to generate letter.', 'error')
    }
  }, [addToast])

  const handleFine = useCallback(async (violationId, amount, kind, note) => {
    try {
      const res = await violationAPI.addFine(violationId, amount, kind, note)
      setViolations((prev) => prev.map((v) => (v.id === violationId ? { ...v, ...res.data } : v)))
      delete letterCache.current[violationId]
      loadAnalytics()
      addToast(kind === 'assessment' ? `Fine of ${currencyFmt(amount)} assessed.` : `Payment of ${currencyFmt(amount)} recorded.`)
      return res.data
    } catch (err) {
      addToast(err.response?.data?.detail || 'Fine update failed.', 'error')
      throw err
    }
  }, [addToast, loadAnalytics])

  const handleCopyPortalLink = useCallback(async (violation) => {
    try {
      const res = await violationAPI.getPortalLink(violation.id)
      const url = res.data.url || `${window.location.origin}/v/${res.data.token}`
      await navigator.clipboard?.writeText(url)
      addToast(`Resident link copied — valid ${res.data.expires_days} days. Share it with ${violation.resident_name}.`)
    } catch {
      addToast('Could not create the resident link.', 'error')
    }
  }, [addToast])

  const handleCaseFile = useCallback(async (violation) => {
    try {
      const res = await violationAPI.getCaseFile(violation.id)
      downloadLetterPdf(res.data, `case_file_${violation.resident_name}`)
      addToast('Case file exported — summary, timeline, letter, and evidence in one PDF.')
    } catch {
      addToast('Case file export failed.', 'error')
    }
  }, [addToast])

  const handleRestoreResident = useCallback(async (resident) => {
    try {
      await residentAPI.restore(resident.id)
      await loadResidents()
      loadAnalytics()
      addToast(`${resident.name} restored.`)
    } catch (err) {
      addToast(err.response?.data?.detail || 'Restore failed.', 'error')
    }
  }, [loadResidents, loadAnalytics, addToast])

  const handleDownloadPdf = useCallback(async (violation, version = 'draft') => {
    try {
      const res = await violationAPI.getLetterPdf(violation.id, version)
      downloadLetterPdf(res.data, violation.resident_name)
      addToast(version === 'sent' ? 'Sent letter PDF downloaded (archived copy).' : 'Letter PDF downloaded — ready to print for certified mail.')
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

  const handleSeedDemo = useCallback(async () => {
    setSeedingDemo(true)
    try {
      const res = await hoaAPI.seedDemo(hoaId)
      await Promise.all([loadResidents(), loadViolations(), loadAnalytics()])
      addToast(res.data.message)
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load demo data.', 'error')
    } finally {
      setSeedingDemo(false)
    }
  }, [hoaId, loadResidents, loadViolations, loadAnalytics, addToast])

  const handleDeleteViolation = useCallback((violationId) => {
    setConfirmDelete({
      message: 'Delete this violation? This cannot be undone.',
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          await violationAPI.delete(violationId)
          setViolations((prev) => prev.filter((v) => v.id !== violationId))
          setSelectedId(null)
          loadAnalytics()
          addToast('Violation deleted.')
        } catch {
          addToast('Failed to delete violation.', 'error')
        }
      },
    })
  }, [addToast, loadAnalytics, setSelectedId])

  const handleDeleteResident = useCallback((residentId, residentName, violationCount = 0) => {
    setConfirmDelete({
      message: violationCount > 0
        ? `Archive ${residentName}? Their ${violationCount} violation record${violationCount !== 1 ? 's' : ''} will be preserved for the association's history.`
        : `Delete ${residentName}? They have no violation history.`,
      confirmLabel: violationCount > 0 ? 'Archive' : 'Delete',
      onConfirm: async () => {
        setConfirmDelete(null)
        try {
          const res = await residentAPI.delete(residentId)
          await loadResidents()
          loadViolations()
          loadAnalytics()
          addToast(res.data.message || 'Resident removed.')
        } catch {
          addToast('Failed to remove resident.', 'error')
        }
      },
    })
  }, [addToast, loadResidents, loadViolations, loadAnalytics])

  const goToResidentViolations = useCallback((resident) => {
    setViolationQuery(resident.name)
    setTab('violations')
  }, [])

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
  const canAdd = activeResidents.length > 0
  const overdueCount = analytics?.kpis?.overdue_violations || 0

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'violations', label: 'Violations', badge: violations.filter((v) => v.status !== 'resolved').length },
    { key: 'residents', label: 'Residents', badge: activeResidents.length },
  ]

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <header className="relative bg-[#0b0e14]/85 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-30 shadow-[0_10px_36px_-18px_rgba(0,0,0,0.7)]">
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

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setPaletteOpen(true)} aria-label="Search" className="sm:hidden p-2 text-slate-400 bg-white/[0.05] hover:bg-white/[0.07] border border-white/10 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
              <button onClick={() => setPaletteOpen(true)} className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 bg-white/[0.05] hover:bg-white/[0.07] border border-white/10 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Search <kbd className="text-[10px] border border-white/10 rounded px-1 ml-0.5">⌘K</kbd>
              </button>
              <button onClick={handleBoardReport} className="px-3 py-1.5 text-xs text-slate-400 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors whitespace-nowrap">
                <span className="sm:hidden">Report</span>
                <span className="hidden sm:inline">Board Report</span>
              </button>
              <button onClick={() => onEditClient(hoaId)} className="hidden md:block px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors">Edit</button>
              <button onClick={handleLogout} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors whitespace-nowrap">Sign Out</button>
            </div>
          </div>

          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tab === t.key ? 'text-slate-100' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${tab === t.key ? 'bg-[#3b82f6]/15 text-[#60a5fa]' : 'bg-white/[0.06] text-slate-400'}`}>{t.badge}</span>
                )}
                {t.key === 'violations' && overdueCount > 0 && (
                  <span
                    role="button"
                    aria-label={`Show ${overdueCount} overdue violations`}
                    onClick={(e) => { e.stopPropagation(); openOverdue() }}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors"
                  >{overdueCount} overdue</span>
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
        {tab === 'overview' && (
          <OverviewTab
            analytics={analytics}
            loading={analyticsLoading || dataLoading}
            violations={violations}
            hoaId={hoaId}
            onOpenViolation={(v) => setSelectedId(v.id)}
            onShowOverdue={openOverdue}
            hoa={hoa}
            residentCount={activeResidents.length}
            onAddResident={() => setShowAddResident(true)}
            onImportResidents={() => setShowImportCSV(true)}
            onNewViolation={() => setShowAddViolation(true)}
            onEditClient={() => onEditClient(hoaId)}
            onSeedDemo={handleSeedDemo}
            seeding={seedingDemo}
          />
        )}
        {tab === 'violations' && (
          <ViolationsTab
            violations={violations}
            query={violationQuery}
            setQuery={setViolationQuery}
            statusFilter={violationFilter}
            setStatusFilter={setViolationFilter}
            onOpen={(v) => setSelectedId(v.id)}
            onNew={() => setShowAddViolation(true)}
            onExport={handleExportCsv}
            onImport={() => setShowImportViolations(true)}
            canAdd={canAdd}
          />
        )}
        {tab === 'residents' && (
          <ResidentsTab
            residents={residents}
            onAdd={() => setShowAddResident(true)}
            onImport={() => setShowImportCSV(true)}
            onDelete={handleDeleteResident}
            onRestore={handleRestoreResident}
            onViewViolations={goToResidentViolations}
            onSeedDemo={handleSeedDemo}
            seeding={seedingDemo}
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
          onFine={handleFine}
          onCopyPortalLink={handleCopyPortalLink}
          onCaseFile={handleCaseFile}
          sending={!!sendingEmail[selectedViolation.id]}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        residents={activeResidents}
        violations={violations}
        onSelectViolation={(v) => setSelectedId(v.id)}
        onSelectResident={goToResidentViolations}
        actions={[
          { id: 'new-violation', label: 'New violation', run: () => { if (canAdd) setShowAddViolation(true); else addToast('Add a resident first.', 'error') } },
          { id: 'new-resident', label: 'New resident', run: () => setShowAddResident(true) },
          { id: 'import-csv', label: 'Import residents from CSV', run: () => setShowImportCSV(true) },
          { id: 'import-violations-csv', label: 'Import violations from CSV', run: () => { if (canAdd) setShowImportViolations(true); else addToast('Add residents first.', 'error') } },
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

      {showImportViolations && (
        <ImportViolationsCSVModal
          hoaId={hoaId}
          onClose={() => setShowImportViolations(false)}
          addToast={addToast}
          onDone={(added, errors) => {
            setShowImportViolations(false)
            loadViolations()
            loadAnalytics()
            if (errors.length > 0) addToast(`Imported ${added} violations. ${errors.length} rows skipped.`, added === 0 ? 'error' : 'success')
            else addToast(`Imported ${added} violations.`)
          }}
        />
      )}

      {showAddViolation && (
        <AddViolationModal
          hoaId={hoaId}
          residents={activeResidents}
          onClose={() => setShowAddViolation(false)}
          onAdded={() => { setShowAddViolation(false); loadViolations(); loadAnalytics(); addToast('Violation created.') }}
        />
      )}

      {letterModal && (() => {
        const { violation, data, view } = letterModal
        const showingSent = view === 'sent' && data.sent_letter
        const text = showingSent ? data.sent_letter : data.letter
        return (
          <Modal title={`Violation Letter — ${violation.violation_type}`} subtitle={`${violation.resident_name} · ${violation.resident_unit}`} onClose={() => setLetterModal(null)}>
            {data.sent_letter && (
              <div className="flex items-center gap-1.5 mb-4">
                <button
                  onClick={() => setLetterModal({ ...letterModal, view: 'sent' })}
                  className={`vt-chip ${showingSent ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-slate-400 border-white/10 hover:border-white/20'}`}
                >
                  As sent {data.sent_at ? `· ${new Date(data.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                </button>
                <button
                  onClick={() => setLetterModal({ ...letterModal, view: 'draft' })}
                  className={`vt-chip ${!showingSent ? 'bg-[#3b82f6]/15 text-[#60a5fa] border-[#3b82f6]/30' : 'text-slate-400 border-white/10 hover:border-white/20'}`}
                >
                  Current draft
                </button>
                {showingSent && <span className="text-[11px] text-slate-500 ml-1">archived copy — never changes</span>}
              </div>
            )}
            <div className="bg-white/[0.04] ring-1 ring-white/[0.06] rounded-xl p-5">
              <pre className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { navigator.clipboard?.writeText(text); addToast('Letter copied to clipboard.') }}
                className="flex-1 py-2 text-sm border border-white/10 text-slate-400 hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => handleDownloadPdf(violation, showingSent ? 'sent' : 'draft')}
                className="flex-1 py-2 text-sm border border-white/10 text-slate-400 hover:bg-white/[0.06] rounded-lg transition-colors"
                title="Print-ready PDF for certified mail"
              >
                Download PDF
              </button>
            </div>
          </Modal>
        )
      })()}

      {confirmDelete && (
        <ConfirmDialog message={confirmDelete.message} confirmLabel={confirmDelete.confirmLabel || 'Delete'} onConfirm={confirmDelete.onConfirm} onCancel={() => setConfirmDelete(null)} />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
