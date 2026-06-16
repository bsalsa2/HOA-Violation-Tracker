import React, { useState } from 'react'
import { violationAPI } from '../api'

function AddViolationForm({ hoaId, residents, onClose, onAdded }) {
  const [residentId, setResidentId] = useState(residents[0]?.id || '')
  const [violationType, setViolationType] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await violationAPI.create(hoaId, residentId, violationType, description)
      onAdded()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error creating violation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full shadow-xl">
        <h3 className="text-2xl font-semibold mb-4">Add Violation</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <select
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            required
          >
            <option value="">Select Resident</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} - Unit {r.unit}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Violation Type (e.g., Landscaping)"
            value={violationType}
            onChange={(e) => setViolationType(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            required
          />

          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            rows={4}
            required
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddViolationForm
