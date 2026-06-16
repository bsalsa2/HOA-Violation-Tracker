import React, { useState } from 'react'
import { violationAPI } from '../api'

const STATUS_COLORS = {
  pending: 'text-yellow-400',
  resolved: 'text-green-400',
  escalated: 'text-red-400',
}

function ViolationList({ violations, onStatusChange }) {
  const [expandedId, setExpandedId] = useState(null)
  const [letters, setLetters] = useState({})
  const [letterLoading, setLetterLoading] = useState({})
  const [statusLoading, setStatusLoading] = useState({})

  const toggleLetter = async (violationId) => {
    if (expandedId === violationId) {
      setExpandedId(null)
      return
    }
    if (letters[violationId]) {
      setExpandedId(violationId)
      return
    }
    setLetterLoading((prev) => ({ ...prev, [violationId]: true }))
    try {
      const response = await violationAPI.getLetter(violationId)
      setLetters((prev) => ({ ...prev, [violationId]: response.data.letter }))
      setExpandedId(violationId)
    } catch (err) {
      console.error('Error loading letter:', err)
    } finally {
      setLetterLoading((prev) => ({ ...prev, [violationId]: false }))
    }
  }

  const handleStatusChange = async (violationId, newStatus) => {
    setStatusLoading((prev) => ({ ...prev, [violationId]: true }))
    try {
      await violationAPI.updateStatus(violationId, newStatus)
      onStatusChange()
    } catch (err) {
      console.error('Error updating status:', err)
    } finally {
      setStatusLoading((prev) => ({ ...prev, [violationId]: false }))
    }
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {violations.map((violation) => (
        <div key={violation.id} className="p-3 bg-gray-700 rounded">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{violation.violation_type}</p>
              <p className="text-sm text-gray-300 mt-1">{violation.description}</p>
              <p className={`text-xs mt-1 font-medium ${STATUS_COLORS[violation.status] || 'text-gray-400'}`}>
                {violation.status}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                onClick={() => toggleLetter(violation.id)}
                disabled={letterLoading[violation.id]}
                className="text-blue-400 hover:text-blue-300 text-sm whitespace-nowrap disabled:opacity-50"
              >
                {letterLoading[violation.id] ? 'Loading...' : expandedId === violation.id ? 'Hide Letter' : 'View Letter'}
              </button>
              <select
                value={violation.status}
                onChange={(e) => handleStatusChange(violation.id, e.target.value)}
                disabled={statusLoading[violation.id]}
                className="text-xs bg-gray-600 text-white rounded px-1 py-0.5 border border-gray-500 disabled:opacity-50"
              >
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
          </div>

          {expandedId === violation.id && letters[violation.id] && (
            <div className="mt-3 p-3 bg-gray-800 rounded border border-gray-600 max-h-48 overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap text-gray-300">{letters[violation.id]}</p>
            </div>
          )}
        </div>
      ))}
      {violations.length === 0 && (
        <p className="text-gray-400 text-center py-8">No violations yet</p>
      )}
    </div>
  )
}

export default ViolationList
