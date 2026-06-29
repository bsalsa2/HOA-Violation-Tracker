import React, { useState, useEffect, useCallback } from 'react'
import Login from './pages/Login'
import HOASetup from './pages/HOASetup'
import Dashboard from './pages/Dashboard'
import PortfolioOverview from './components/PortfolioOverview'
import { AddClientModal, EditHOAModal } from './components/modals'
import { ConfirmDialog, Spinner } from './components/primitives'
import { hoaAPI } from './api'

const ACTIVE_KEY = 'active_hoa_id'
const HOA_EMAIL_KEY = (hoaId) => `hoa_email_${hoaId}`

function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'))
  const [hoas, setHoas] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeHoaId, setActiveHoaId] = useState(() => {
    const v = localStorage.getItem(ACTIVE_KEY)
    return v ? parseInt(v, 10) : null
  })
  const [hoaEmails, setHoaEmails] = useState({})
  const [view, setView] = useState('dashboard')

  const [showAddClient, setShowAddClient] = useState(false)
  const [showEditClient, setShowEditClient] = useState(false)
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false)

  const setActive = useCallback((id) => {
    setActiveHoaId(id)
    if (id) localStorage.setItem(ACTIVE_KEY, String(id))
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

  const saveHoaEmail = useCallback((hoaId, email) => {
    if (email) {
      localStorage.setItem(HOA_EMAIL_KEY(hoaId), email)
      setHoaEmails(prev => ({ ...prev, [hoaId]: email }))
    }
  }, [])

  const getHoaEmail = useCallback((hoaId) => {
    return hoaEmails[hoaId] || localStorage.getItem(HOA_EMAIL_KEY(hoaId))
  }, [hoaEmails])

  const refreshPortfolio = useCallback(async () => {
    const res = await hoaAPI.list()
    setHoas(res.data)
    return res.data
  }, [])

  useEffect(() => {
    if (!token) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    hoaAPI.list()
      .then((res) => { if (!cancelled) setHoas(res.data) })
      .catch((err) => { if (!cancelled && err.response?.status !== 401) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  // Keep active selection valid as the portfolio changes
  useEffect(() => {
    if (hoas.length === 0) return
    if (!activeHoaId || !hoas.some((h) => h.id === activeHoaId)) {
      setActive(hoas[0].id)
    }
  }, [hoas, activeHoaId, setActive])

  const handleSignOut = () => {
    localStorage.removeItem('access_token')
    setToken(null)
    setHoas([])
  }

  const handleClientCreated = async (newHoa) => {
    setShowAddClient(false)
    await refreshPortfolio()
    setActive(newHoa.id)
    setView('dashboard')
  }

  const handleClientUpdated = async () => {
    setShowEditClient(false)
    await refreshPortfolio()
  }

  const handleDeleteClient = async () => {
    setConfirmDeleteClient(false)
    setShowEditClient(false)
    try {
      await hoaAPI.delete(activeHoaId)
      const remaining = await refreshPortfolio()
      if (remaining.length > 0) setActive(remaining[0].id)
      else setActive(null)
      setView('dashboard')
    } catch {
      /* ignore; portfolio refresh will reflect reality */
    }
  }

  if (!token) {
    return <Login setToken={setToken} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400"><Spinner className="w-5 h-5" /> Loading your portfolio…</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-300 text-sm">Couldn't reach the server.</p>
          <p className="text-slate-500 text-xs mt-1">It may still be deploying — wait a moment and retry.</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 text-sm bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] text-white rounded-lg">Retry</button>
        </div>
      </div>
    )
  }

  // No clients yet → onboarding
  if (hoas.length === 0) {
    return <HOASetup onComplete={handleClientCreated} onSignOut={handleSignOut} />
  }

  const activeHoa = hoas.find((h) => h.id === activeHoaId) || hoas[0]

  return (
    <>
      {view === 'portfolio' ? (
        <PortfolioOverview
          hoas={hoas}
          onOpen={(h) => { setActive(h.id); setView('dashboard') }}
          onAddClient={() => setShowAddClient(true)}
          onSignOut={handleSignOut}
        />
      ) : (
        <Dashboard
          key={activeHoa.id}
          hoa={activeHoa}
          hoas={hoas}
          hoaEmail={getHoaEmail(activeHoa.id)}
          onSaveHoaEmail={saveHoaEmail}
          onSwitchHoa={(h) => { setActive(h.id); setView('dashboard') }}
          onShowPortfolio={() => { refreshPortfolio(); setView('portfolio') }}
          onAddClient={() => setShowAddClient(true)}
          onEditClient={() => setShowEditClient(true)}
          setToken={setToken}
        />
      )}

      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)} onCreated={handleClientCreated} />
      )}

      {showEditClient && activeHoa && (
        <EditHOAModal
          hoa={activeHoa}
          onClose={() => setShowEditClient(false)}
          onUpdated={handleClientUpdated}
          onDelete={() => setConfirmDeleteClient(true)}
          onSaveHoaEmail={saveHoaEmail}
        />
      )}

      {confirmDeleteClient && (
        <ConfirmDialog
          message={`Remove ${activeHoa?.name} and ALL its residents and violations? This cannot be undone.`}
          confirmLabel="Delete Client"
          onConfirm={handleDeleteClient}
          onCancel={() => setConfirmDeleteClient(false)}
        />
      )}
    </>
  )
}

export default App
