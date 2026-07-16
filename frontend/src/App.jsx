import React, { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import ResidentPortal from './pages/ResidentPortal'
import HOASetup from './pages/HOASetup'
import Dashboard from './pages/Dashboard'
import PortfolioOverview from './components/PortfolioOverview'
import { AddClientModal, EditHOAModal } from './components/modals'
import { ConfirmDialog, Spinner } from './components/primitives'
import { hoaAPI, authAPI } from './api'

const ACTIVE_KEY = 'active_hoa_id'

function DashboardRoute({ hoas, me, onSwitchHoa, onShowPortfolio, onAddClient, onEditClient, onSignOut, setToken }) {
  const { hoaId } = useParams()
  const hoa = hoas.find((h) => h.id === parseInt(hoaId, 10))
  if (!hoa) return <Navigate to="/portfolio" replace />
  localStorage.setItem(ACTIVE_KEY, String(hoa.id))
  return (
    <Dashboard
      key={hoa.id}
      hoa={hoa}
      hoas={hoas}
      me={me}
      onSwitchHoa={onSwitchHoa}
      onShowPortfolio={onShowPortfolio}
      onAddClient={onAddClient}
      onEditClient={onEditClient}
      onSignOut={onSignOut}
      setToken={setToken}
    />
  )
}

function AuthedApp({ setToken }) {
  const navigate = useNavigate()
  const [hoas, setHoas] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [showAddClient, setShowAddClient] = useState(false)
  const [editClientId, setEditClientId] = useState(null)
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false)
  const [me, setMe] = useState(null)

  useEffect(() => {
    let cancelled = false
    authAPI.me().then((res) => { if (!cancelled) setMe(res.data) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const refreshPortfolio = useCallback(async () => {
    const res = await hoaAPI.list()
    setHoas(res.data)
    return res.data
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    hoaAPI.list()
      .then((res) => { if (!cancelled) setHoas(res.data) })
      .catch((err) => { if (!cancelled && err.response?.status !== 401) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSignOut = () => {
    localStorage.removeItem('access_token')
    setToken(null)
    setHoas([])
    navigate('/login', { replace: true })
  }

  const handleClientCreated = async (newHoa) => {
    setShowAddClient(false)
    await refreshPortfolio()
    navigate(`/c/${newHoa.id}`)
  }

  const handleClientUpdated = async () => {
    setEditClientId(null)
    await refreshPortfolio()
  }

  const editHoa = hoas.find((h) => h.id === editClientId) || null

  const handleDeleteClient = async () => {
    const id = editClientId
    setConfirmDeleteClient(false)
    setEditClientId(null)
    try {
      await hoaAPI.delete(id)
      const remaining = await refreshPortfolio()
      navigate(remaining.length > 0 ? `/c/${remaining[0].id}` : '/', { replace: true })
    } catch {
      /* portfolio refresh will reflect reality */
    }
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
          <p className="text-slate-400 text-sm">Couldn't reach the server.</p>
          <p className="text-slate-500 text-xs mt-1">It may still be deploying — wait a moment and retry.</p>
          <button onClick={() => window.location.reload()} className="btn-primary btn-sheen mt-4 px-4 py-2 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  if (hoas.length === 0) {
    return <HOASetup onComplete={handleClientCreated} onSignOut={handleSignOut} />
  }

  const storedId = parseInt(localStorage.getItem(ACTIVE_KEY) || '', 10)
  const defaultHoa = hoas.find((h) => h.id === storedId) || hoas[0]

  return (
    <>
      <Routes>
        <Route
          path="/portfolio"
          element={
            <PortfolioOverview
              hoas={hoas}
              onOpen={(h) => navigate(`/c/${h.id}`)}
              onEditClient={(h) => setEditClientId(h.id)}
              onAddClient={() => setShowAddClient(true)}
              onSignOut={handleSignOut}
            />
          }
        />
        <Route
          path="/c/:hoaId"
          element={
            <DashboardRoute
              hoas={hoas}
              me={me}
              onSwitchHoa={(h) => navigate(`/c/${h.id}`)}
              onShowPortfolio={() => { refreshPortfolio(); navigate('/portfolio') }}
              onAddClient={() => setShowAddClient(true)}
              onEditClient={(hoaId) => setEditClientId(hoaId)}
              onSignOut={handleSignOut}
              setToken={setToken}
            />
          }
        />
        <Route path="*" element={<Navigate to={`/c/${defaultHoa.id}`} replace />} />
      </Routes>

      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)} onCreated={handleClientCreated} />
      )}

      {editHoa && (
        <EditHOAModal
          hoa={editHoa}
          onClose={() => setEditClientId(null)}
          onUpdated={handleClientUpdated}
          onDelete={() => setConfirmDeleteClient(true)}
        />
      )}

      {confirmDeleteClient && editHoa && (
        <ConfirmDialog
          message={`Remove ${editHoa.name} and ALL its residents and violations? This cannot be undone.`}
          confirmLabel="Delete Client"
          onConfirm={handleDeleteClient}
          onCancel={() => setConfirmDeleteClient(false)}
        />
      )}
    </>
  )
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'))

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login setToken={setToken} />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/v/:token" element={<ResidentPortal />} />
      <Route path="/*" element={token ? <AuthedApp setToken={setToken} /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
