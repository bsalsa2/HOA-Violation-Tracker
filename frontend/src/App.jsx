import React, { useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'))

  if (!token) {
    return <Login setToken={setToken} />
  }

  return <Dashboard setToken={setToken} />
}

export default App
