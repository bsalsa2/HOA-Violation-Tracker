import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api'
import useDocumentTitle from '../lib/useDocumentTitle'

export default function InviteSignup({ setToken }) {
  useDocumentTitle('Create Account — ViolationTrack')
  const navigate = useNavigate()
  const inviteCode = useMemo(() => new URLSearchParams(window.location.search).get('invite') || '', [])
  const [step, setStep] = useState('account') // 'account' | 'hoa'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hoaName, setHoaName] = useState('')
  const [hoaAddress, setHoaAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!inviteCode) navigate('/login', { replace: true })
  }, [inviteCode, navigate])

  const handleAccountStep = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setStep('hoa')
  }

  const handleHOAStep = async (e) => {
    e.preventDefault()
    if (!hoaName.trim()) { setError('HOA name is required.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await authAPI.registerWithHOA(email, password, hoaName, hoaAddress, inviteCode)
      localStorage.setItem('access_token', res.data.access_token)
      setToken(res.data.access_token)
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail
      const status = err.response?.status
      if (status === 403) setError('This invite link has already been used or is invalid.')
      else if (status === 400) setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : (detail || 'Could not create account.'))
      else if (!err.response) setError('Cannot reach the server. It may still be deploying — wait a moment and try again.')
      else setError(`Error ${status}: ${detail || err.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const field = 'vt-input px-3.5 py-3 focus:ring-2 focus:ring-[#3b82f6]/20'

  return (
    <div className="relative min-h-screen bg-transparent flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0d1017] via-[#0b0e14] to-black" />
      <div className="vt-orb vt-orb-a -z-10 w-[34rem] h-[34rem] -top-40 left-1/2 -translate-x-[60%]" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.22), transparent 70%)' }} />
      <div className="vt-orb vt-orb-b -z-10 w-[26rem] h-[26rem] top-1/3 -right-24" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)' }} />

      <div className="w-full max-w-md anim-rise">
        <div className="text-center mb-8">
          <div className="vt-ring inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#60a5fa] to-[#2563eb] mb-5 ring-1 ring-white/15" style={{ boxShadow: '0 16px 50px -10px rgba(37,99,235,0.5), inset 0 1px 0 0 rgba(255,255,255,0.2)' }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight brand-gradient">ViolationTrack</h1>
          <p className="text-slate-400 text-sm mt-2">Create your account & set up your HOA</p>
        </div>

        <div className="vt-card vt-spotlight p-7" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), var(--shadow-xl)' }}>
          {step === 'account' ? (
            <form onSubmit={handleAccountStep} className="space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-4">Step 1 of 2: Create your account</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
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
                  className={field}
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
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={field}
                  required
                  autoComplete="new-password"
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
              <button type="submit" className="btn-primary btn-sheen w-full py-3">Next</button>
            </form>
          ) : (
            <form onSubmit={handleHOAStep} className="space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-4">Step 2 of 2: Set up your HOA</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">HOA Name</label>
                <input
                  type="text"
                  value={hoaName}
                  onChange={(e) => setHoaName(e.target.value)}
                  className={field}
                  placeholder="e.g. Sunset Ridge Homeowners"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Address (optional)</label>
                <input
                  type="text"
                  value={hoaAddress}
                  onChange={(e) => setHoaAddress(e.target.value)}
                  className={field}
                  placeholder="HOA office or property address"
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
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setStep('account'); setError('') }} className="flex-1 py-3 text-sm border border-white/10 text-slate-400 hover:bg-white/5 rounded-lg transition-colors">Back</button>
                <button type="submit" disabled={loading} className="btn-primary btn-sheen flex-1 py-3 text-sm flex items-center justify-center gap-2">
                  {loading ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Already have an account? <a href="/login" className="text-slate-400 hover:text-slate-300">Sign in</a>
        </p>
      </div>
    </div>
  )
}
