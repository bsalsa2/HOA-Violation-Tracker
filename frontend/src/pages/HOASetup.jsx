import React, { useState } from 'react'
import { hoaAPI } from '../api'

function HOASetup({ onSetupComplete }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await hoaAPI.setup(name, address)
      onSetupComplete()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to set up HOA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Set Up Your HOA</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="HOA Name (e.g., Sunset Heights)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            required
          />
          <input
            type="text"
            placeholder="Address (e.g., 123 Main St, City, State)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            required
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Setting Up...' : 'Set Up HOA'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default HOASetup
