import React, { useState, useEffect } from 'react'
import { hoaAPI, residentAPI, violationAPI } from '../api'

function Dashboard({ token, onLogout }) {
  const [hoa, setHoa] = useState(null)
  const [stats, setStats] = useState(null)
  const [residents, setResidents] = useState([])
  const [violations, setViolations] = useState([])
  const [violationFilter, setViolationFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAddResident, setShowAddResident] = useState(false)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [showAddViolation, setShowAddViolation] = useState(false)
  const [showViolationLetter, setShowViolationLetter] = useState(null)

  const [residentForm, setResidentForm] = useState({ name: '', unit: '', email: '', phone: '' })
  const [violationForm, setViolationForm] = useState({ resident_id: '', violation_type: '', description: '' })
  const [csvFile, setCsvFile] = useState(null)

  useEffect(() => {
    loadData()
  }, [violationFilter])

  const loadData = async () => {
    try {
      setLoading(true)
      const hoaRes = await hoaAPI.getMe()
      setHoa(hoaRes.data)

      const statsRes = await hoaAPI.getStats()
      setStats(statsRes.data)

      const residentsRes = await residentAPI.getAll()
      setResidents(residentsRes.data)

      const violationsRes = await violationAPI.getAll(violationFilter)
      setViolations(violationsRes.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleAddResident = async (e) => {
    e.preventDefault()
    try {
      await residentAPI.create(residentForm.name, residentForm.unit, residentForm.email, residentForm.phone)
      setResidentForm({ name: '', unit: '', email: '', phone: '' })
      setShowAddResident(false)
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add resident')
    }
  }

  const handleDeleteResident = async (id) => {
    if (window.confirm('Delete this resident?')) {
      try {
        await residentAPI.delete(id)
        loadData()
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to delete resident')
      }
    }
  }

  const handleImportCSV = async (e) => {
    e.preventDefault()
    if (!csvFile) {
      setError('Please select a file')
      return
    }

    try {
      const result = await residentAPI.importCSV(csvFile)
      setError('')
      alert(`Imported ${result.data.added} residents${result.data.errors.length > 0 ? `. Errors: ${result.data.errors.join('; ')}` : ''}`)
      setCsvFile(null)
      setShowImportCSV(false)
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to import CSV')
    }
  }

  const handleAddViolation = async (e) => {
    e.preventDefault()
    try {
      await violationAPI.create(violationForm.resident_id, violationForm.violation_type, violationForm.description)
      setViolationForm({ resident_id: '', violation_type: '', description: '' })
      setShowAddViolation(false)
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add violation')
    }
  }

  const handleUpdateViolationStatus = async (violationId, newStatus) => {
    try {
      await violationAPI.updateStatus(violationId, newStatus)
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update violation')
    }
  }

  const handleDeleteViolation = async (id) => {
    if (window.confirm('Delete this violation?')) {
      try {
        await violationAPI.delete(id)
        loadData()
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to delete violation')
      }
    }
  }

  const handleViewLetter = async (violationId) => {
    try {
      const res = await violationAPI.getLetter(violationId)
      setShowViolationLetter({ id: violationId, letter: res.data.letter })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate letter')
    }
  }

  const handleSendLetter = async (violationId) => {
    try {
      await violationAPI.sendLetter(violationId)
      alert('Letter sent successfully to resident!')
      loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send letter. Make sure resident has an email address.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-gray-600 text-lg">Loading...</div>
      </div>
    )
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-red-50 text-red-700 border-red-200'
      case 'noticed': return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      case 'resolved': return 'bg-green-50 text-green-700 border-green-200'
      case 'escalated': return 'bg-purple-50 text-purple-700 border-purple-200'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{hoa?.name}</h1>
            <p className="text-sm text-gray-600 mt-1">{hoa?.address}</p>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition"
          >
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Total Residents', value: stats.total_residents, color: 'text-blue-600' },
              { label: 'Total Violations', value: stats.total_violations, color: 'text-slate-600' },
              { label: 'Open', value: stats.open_violations, color: 'text-red-600' },
              { label: 'Noticed', value: stats.noticed_violations, color: 'text-yellow-600' },
              { label: 'Resolved', value: stats.resolved_violations, color: 'text-green-600' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white p-6 rounded border border-gray-200">
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className={`text-4xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-2 gap-8">
          {/* Residents */}
          <div className="bg-white rounded border border-gray-200">
            <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Residents</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportCSV(true)}
                  className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-medium transition border border-blue-200"
                >
                  Import CSV
                </button>
                <button
                  onClick={() => setShowAddResident(true)}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                >
                  Add Resident
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {residents.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">No residents yet</div>
              ) : (
                residents.map((r) => (
                  <div key={r.id} className="px-6 py-4 hover:bg-gray-50 flex justify-between items-start group">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{r.name}</p>
                      <p className="text-sm text-gray-600">Unit {r.unit}</p>
                      {r.email && <p className="text-sm text-gray-600">{r.email}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteResident(r.id)}
                      className="opacity-0 group-hover:opacity-100 ml-4 px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded transition"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Violations */}
          <div className="bg-white rounded border border-gray-200">
            <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Violations</h2>
              <button
                onClick={() => setShowAddViolation(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
              >
                Add Violation
              </button>
            </div>

            <div className="border-b border-gray-200 px-6 py-3">
              <select
                value={violationFilter}
                onChange={(e) => setViolationFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="open">Open</option>
                <option value="noticed">Noticed</option>
                <option value="resolved">Resolved</option>
                <option value="">All</option>
              </select>
            </div>

            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {violations.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">No violations</div>
              ) : (
                violations.map((v) => {
                  const resident = residents.find((r) => r.id === v.resident_id)
                  return (
                    <div key={v.id} className="px-6 py-4 hover:bg-gray-50 group">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-gray-900">{resident?.name}</p>
                            {v.email_sent_at && (
                              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-200">
                                Email sent
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{v.violation_type}</p>
                          <p className="text-sm text-gray-700 mt-1">{v.description}</p>
                        </div>
                        <select
                          value={v.status}
                          onChange={(e) => handleUpdateViolationStatus(v.id, e.target.value)}
                          className={`px-2 py-1 text-xs rounded font-medium border cursor-pointer whitespace-nowrap ${getStatusColor(v.status)}`}
                        >
                          <option value="open">Open</option>
                          <option value="noticed">Noticed</option>
                          <option value="resolved">Resolved</option>
                          <option value="escalated">Escalated</option>
                        </select>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                        {!v.email_sent_at && (
                          <button
                            onClick={() => handleSendLetter(v.id)}
                            className="text-xs px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded transition font-medium"
                          >
                            Send Email
                          </button>
                        )}
                        <button
                          onClick={() => handleViewLetter(v.id)}
                          className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition"
                        >
                          View Letter
                        </button>
                        <button
                          onClick={() => handleDeleteViolation(v.id)}
                          className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Resident Modal */}
      {showAddResident && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md shadow-lg">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Add Resident</h3>
            </div>
            <form onSubmit={handleAddResident} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={residentForm.name}
                  onChange={(e) => setResidentForm({ ...residentForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                <input
                  type="text"
                  value={residentForm.unit}
                  onChange={(e) => setResidentForm({ ...residentForm, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={residentForm.email}
                  onChange={(e) => setResidentForm({ ...residentForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={residentForm.phone}
                  onChange={(e) => setResidentForm({ ...residentForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                >
                  Add Resident
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddResident(false)}
                  className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportCSV && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md shadow-lg">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Import Residents</h3>
            </div>
            <form onSubmit={handleImportCSV} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">CSV File *</label>
                <p className="text-xs text-gray-600 mb-3">Format: name, unit, email (optional), phone (optional)</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="bg-gray-50 p-3 rounded text-xs text-gray-700 border border-gray-200">
                <p className="font-medium mb-2">Example:</p>
                <pre className="whitespace-pre-wrap break-words">John Doe,101,john@example.com,555-1234
Jane Smith,102,jane@example.com</pre>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportCSV(false)
                    setCsvFile(null)
                  }}
                  className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Violation Modal */}
      {showAddViolation && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md shadow-lg">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Add Violation</h3>
            </div>
            <form onSubmit={handleAddViolation} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resident *</label>
                <select
                  value={violationForm.resident_id}
                  onChange={(e) => setViolationForm({ ...violationForm, resident_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select resident...</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} - Unit {r.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Violation Type *</label>
                <input
                  type="text"
                  placeholder="e.g., Unmaintained Lawn"
                  value={violationForm.violation_type}
                  onChange={(e) => setViolationForm({ ...violationForm, violation_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  placeholder="Details of the violation..."
                  value={violationForm.description}
                  onChange={(e) => setViolationForm({ ...violationForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="4"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                >
                  Add Violation
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddViolation(false)}
                  className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Letter Modal */}
      {showViolationLetter && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl shadow-lg max-h-96 overflow-hidden flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Violation Letter</h3>
            </div>
            <div className="overflow-y-auto flex-1 p-6 bg-gray-50">
              <div className="bg-white p-4 rounded border border-gray-200 text-sm text-gray-900 whitespace-pre-wrap">
                {showViolationLetter.letter}
              </div>
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowViolationLetter(null)}
                className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
