import React, { useState } from 'react'
import { hoaAPI } from '../api'

function HOASetup({ onComplete, onSignOut }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await hoaAPI.create(name, address)
      onComplete(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add client. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8 anim-rise">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#d8be86] to-[#9c7c44] rounded-2xl mb-4 ring-1 ring-white/20" style={{ boxShadow: '0 16px 44px -10px rgba(202,169,107,0.6), inset 0 1px 0 0 rgba(255,255,255,0.3)' }}>
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Add Your First Client</h1>
          <p className="text-slate-400 mt-2 text-sm leading-relaxed">
            Enter the HOA / community you manage. You can add more communities to your portfolio anytime.
          </p>
        </div>

        <div className="vt-card p-8 anim-rise stagger-1">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">HOA Name</label>
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
              <label className="block text-sm font-medium text-slate-300 mb-1.5">HOA Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="vt-input px-3 py-2.5"
                placeholder="e.g., 123 Main St, Anytown, CA 90210"
                required
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
                className="flex-1 py-2.5 bg-gradient-to-b from-[#e3c98e] to-[#c4a566] hover:from-[#ecd49d] hover:to-[#d0b06f] shadow-lg shadow-[#b08d57]/30 active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed text-[#2a2317] font-semibold rounded-lg transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Setting up...
                  </span>
                ) : 'Continue'}
              </button>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-5 py-2.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors text-sm font-medium"
                >
                  Sign Out
                </button>
              )}
            </div>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          You can edit or add communities anytime from your portfolio.
        </p>
      </div>
    </div>
  )
}

export default HOASetup
