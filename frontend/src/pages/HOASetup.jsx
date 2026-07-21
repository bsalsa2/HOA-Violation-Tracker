import React, { useState } from 'react'
import { hoaAPI } from '../api'

function HOASetup({ onComplete, onSignOut }) {
  const [step, setStep] = useState('choice') // 'choice', 'setup', 'demo'
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await hoaAPI.create(name, address, email)
      onComplete(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add client. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSkipSetup = async () => {
    setLoading(true)
    try {
      const response = await hoaAPI.create('My Community', '', '')
      onComplete(response.data)
    } catch (err) {
      setError('Could not create community. Please try again.')
      setLoading(false)
    }
  }

  if (step === 'choice') {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-10 anim-rise">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] rounded-2xl mb-4 ring-1 ring-white/15" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 0 rgba(255,255,255,0.3)' }}>
              <svg className="w-8 h-8 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Welcome to ViolationTrack</h1>
            <p className="text-slate-400 mt-3 text-sm leading-relaxed">
              Manage violations, send notices, and track compliance across your communities.
            </p>
          </div>

          <div className="space-y-3 anim-rise stagger-1">
            <button
              onClick={() => setStep('setup')}
              className="w-full p-4 vt-card hover:border-blue-500/30 transition-all text-left group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-100 group-hover:text-blue-300 transition-colors">Add Your Community Now</p>
                  <p className="text-xs text-slate-400 mt-1">Enter community details to get started</p>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button
              onClick={handleSkipSetup}
              disabled={loading}
              className="w-full p-4 vt-card border-slate-700 hover:border-slate-600 transition-all text-left group disabled:opacity-50"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-300 group-hover:text-slate-200 transition-colors">Skip for Now</p>
                  <p className="text-xs text-slate-500 mt-1">Create a demo community to explore the app</p>
                </div>
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {error && (
              <div className="flex items-start gap-2 bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg p-3">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <div className="pt-2">
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full px-5 py-2.5 text-slate-400 hover:text-slate-100 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors text-sm font-medium"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8 anim-rise">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] rounded-2xl mb-4 ring-1 ring-white/15" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 0 rgba(255,255,255,0.3)' }}>
            <svg className="w-7 h-7 text-slate-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Add Your Community</h1>
          <p className="text-slate-400 mt-2 text-sm leading-relaxed">
            Fill in details about your HOA. You can edit these anytime.
          </p>
        </div>

        <div className="vt-card p-8 anim-rise stagger-1">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Community Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="vt-input px-3 py-2.5"
                placeholder="e.g., Sunridge Estates HOA"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="vt-input px-3 py-2.5"
                placeholder="e.g., 123 Main St, Anytown, CA 90210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Email <span className="text-slate-500 font-normal">(for violation notices)</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="vt-input px-3 py-2.5"
                placeholder="board@yourhoa.com"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg p-3">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-gradient-to-b from-[#3b82f6] to-[#2563eb] hover:from-[#60a5fa] hover:to-[#3b82f6] shadow-lg shadow-[#2563eb]/40 active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </span>
                ) : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setStep('choice')}
                className="px-5 py-2.5 text-slate-400 hover:text-slate-100 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors text-sm font-medium"
              >
                Back
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Only the community name is required. Add details later.
        </p>
      </div>
    </div>
  )
}

export default HOASetup
