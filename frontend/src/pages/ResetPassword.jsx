import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { authAPI } from '../api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authAPI.reset(token, password)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-transparent flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0d1017] via-[#0b0e14] to-black" />
      <div className="vt-orb vt-orb-a -z-10 w-[30rem] h-[30rem] -top-32 left-1/2 -translate-x-1/2" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.2), transparent 70%)' }} />
      <div className="w-full max-w-md anim-rise">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight brand-gradient">Reset your password</h1>
          <p className="text-slate-400 text-sm mt-2">Choose a new password for your ViolationTrack account.</p>
        </div>

        <div className="vt-card vt-spotlight p-7" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), var(--shadow-xl)' }}>
          {done ? (
            <div className="text-center space-y-4">
              <div className="inline-flex w-12 h-12 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/25 items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-slate-200 text-sm">Password updated.</p>
              <Link to="/login" className="btn-primary btn-sheen inline-block px-6 py-2.5 text-sm">Sign In</Link>
            </div>
          ) : !token ? (
            <div className="text-center space-y-3">
              <p className="text-slate-300 text-sm">This reset link is missing its token.</p>
              <p className="text-slate-500 text-xs">Request a new link from the sign-in page.</p>
              <Link to="/login" className="text-[#60a5fa] text-sm hover:underline">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="vt-input px-3.5 py-3"
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="vt-input px-3.5 py-3"
                  placeholder="Repeat the new password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="bg-red-950/80 border border-red-800/70 text-red-300 text-sm rounded-lg p-3 anim-fade">{error}</div>
              )}
              <button type="submit" disabled={loading} className="btn-primary btn-sheen w-full py-3">
                {loading ? 'Updating…' : 'Update Password'}
              </button>
              <p className="text-center">
                <Link to="/login" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
