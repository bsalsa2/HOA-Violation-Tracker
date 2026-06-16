import React, { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>

  if (!token) {
    return <Login setToken={setToken} />
  }

  return <Dashboard setToken={setToken} />
}

export default App
