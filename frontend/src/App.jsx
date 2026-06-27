import React, { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import HOASetup from './pages/HOASetup'
import { hoaAPI } from './api'

function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'))
  const [hoaSetup, setHoaSetup] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      checkHOASetup()
    } else {
      setLoading(false)
    }
  }, [token])

  const checkHOASetup = async () => {
    try {
      await hoaAPI.getMe()
      setHoaSetup(true)
    } catch (err) {
      if (err.response?.status === 404) {
        setHoaSetup(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setToken(null)
    setHoaSetup(null)
  }

  const handleSetupComplete = () => {
    setHoaSetup(true)
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-white">Loading...</div>

  if (!token) {
    return <Login setToken={setToken} />
  }

  if (hoaSetup === false) {
    return <HOASetup onSetupComplete={handleSetupComplete} />
  }

  if (hoaSetup === true) {
    return <Dashboard token={token} onLogout={handleLogout} />
  }

  return <div className="flex items-center justify-center h-screen text-white">Loading...</div>
}

export default App
