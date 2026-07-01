import React, { useState } from 'react'
import { authAPI } from '../api'

const HIGHLIGHTS = [
  { label: 'AI violation letters' },
  { label: 'Cure-date tracking' },
  { label: 'Board-ready reports' },
]

function Login({ setToken }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const fn = mode === 'login' ? authAPI.login : authAPI.register
      const response = await fn(email, password)
      localStorage.setItem('access_token', response.data.access_token)
      setToken(response.data.access_token)
    } catch (err) {
      const detail = err.response?.data?.detail
      const status = err.response?.status
      if (mode === 'login' && status === 401) setError('Invalid email or password.')
      else if (mode === 'register' && status === 400) setError('An account with this email already exists.')
      else if (!err.response) setError('Cannot reach the server. It may still be deploying — wait a moment and try again.')
      else setError(`Error ${status}: ${Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : (detail || err.message || 'Unknown error')}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-transparent flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0d1017] via-[#0b0e14] to-black" />
      <div className="w-full max-w-md anim-rise">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#60a5fa] to-[#2563eb] mb-5 ring-1 ring-white/15" style={{ boxShadow: '0 16px 50px -10px rgba(37,99,235,0.5), inset 0 1px 0 0 rgba(255,255,255,0.2)' }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight brand-gradient">ViolationTrack</h1>
          <p className="text-slate-400 text-sm mt-2">Modern violation management for property managers</p>
        </div>

        {/* Auth card */}
        <div className="vt-card p-7" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), var(--shadow-xl)' }}>
          <div className="flex bg-black/30 ring-1 ring-white/[0.06] rounded-lg p-1 mb-6">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  mode === m ? 'bg-white/[0.07] text-white ring-1 ring-[#3b82f6]/25 shadow-lg shadow-black/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="vt-input px-3.5 py-3 focus:ring-2 focus:ring-[#3b82f6]/20"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="vt-input px-3.5 py-3 focus:ring-2 focus:ring-[#3b82f6]/20"
                placeholder={mode === 'register' ? 'Choose a password' : 'Your password'}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-900/30 border border-red-800/50 text-red-200 text-sm rounded-lg p-3 anim-fade">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary btn-sheen w-full py-3 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Trust row */}
        <div className="flex items-center justify-center gap-x-5 gap-y-2 mt-6 flex-wrap">
          {HIGHLIGHTS.map((h) => (
            <span key={h.label} className="flex items-center gap-1.5 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5 text-[#3b82f6]/80" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {h.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Login
