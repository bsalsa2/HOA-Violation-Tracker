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
  const [csvFile, setCsvFile] = useState(null)

  const [residentForm, setResidentForm] = useState({ name: '', unit: '', email: '', phone: '' })
  const [violationForm, setViolationForm] = useState({ resident_id: '', violation_type: '', description: '' })

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

  if (loading) return <div className="flex items-center justify-center h-screen text-white">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">{hoa?.name}</h1>
          <p className="text-gray-400">{hoa?.address}</p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold"
        >
          Logout
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-900 text-red-200 rounded">{error}</div>}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Total Residents</p>
            <p className="text-3xl font-bold">{stats.total_residents}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Total Violations</p>
            <p className="text-3xl font-bold">{stats.total_violations}</p>
          </div>
          <div className="bg-red-900 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Open</p>
            <p className="text-3xl font-bold">{stats.open_violations}</p>
          </div>
          <div className="bg-yellow-900 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Noticed</p>
            <p className="text-3xl font-bold">{stats.noticed_violations}</p>
          </div>
          <div className="bg-green-900 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Resolved</p>
            <p className="text-3xl font-bold">{stats.resolved_violations}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        {/* Residents Section */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Residents ({residents.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImportCSV(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold text-sm"
              >
                Import CSV
              </button>
              <button
                onClick={() => setShowAddResident(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
              >
                Add Resident
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {residents.map((r) => (
              <div key={r.id} className="bg-gray-700 p-3 rounded flex justify-between items-center">
                <div className="flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-gray-400">Unit {r.unit}</p>
                  {r.email && <p className="text-sm text-gray-400">{r.email}</p>}
                </div>
                <button
                  onClick={() => handleDeleteResident(r.id)}
                  className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Violations Section */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Violations</h2>
            <button
              onClick={() => setShowAddViolation(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
            >
              Add Violation
            </button>
          </div>

          <div className="mb-4">
            <select
              value={violationFilter}
              onChange={(e) => setViolationFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600"
            >
              <option value="open">Open</option>
              <option value="noticed">Noticed</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {violations.map((v) => {
              const resident = residents.find((r) => r.id === v.resident_id)
              return (
                <div key={v.id} className="bg-gray-700 p-3 rounded">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">{resident?.name}</p>
                      <p className="text-sm text-gray-400">{v.violation_type}</p>
                      <p className="text-sm text-gray-300">{v.description}</p>
                    </div>
                    <select
                      value={v.status}
                      onChange={(e) => handleUpdateViolationStatus(v.id, e.target.value)}
                      className={`px-2 py-1 rounded text-sm font-semibold ${
                        v.status === 'open' ? 'bg-red-600' :
                        v.status === 'noticed' ? 'bg-yellow-600' :
                        'bg-green-600'
                      }`}
                    >
                      <option value="open">Open</option>
                      <option value="noticed">Noticed</option>
                      <option value="resolved">Resolved</option>
                      <option value="escalated">Escalated</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewLetter(v.id)}
                      className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      View Letter
                    </button>
                    <button
                      onClick={() => handleDeleteViolation(v.id)}
                      className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add Resident Modal */}
      {showAddResident && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg w-96">
            <h3 className="text-2xl font-bold mb-4">Add Resident</h3>
            <form onSubmit={handleAddResident} className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                value={residentForm.name}
                onChange={(e) => setResidentForm({ ...residentForm, name: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Unit"
                value={residentForm.unit}
                onChange={(e) => setResidentForm({ ...residentForm, unit: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                required
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={residentForm.email}
                onChange={(e) => setResidentForm({ ...residentForm, email: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Phone (optional)"
                value={residentForm.phone}
                onChange={(e) => setResidentForm({ ...residentForm, phone: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddResident(false)}
                  className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 rounded font-semibold"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg w-96">
            <h3 className="text-2xl font-bold mb-4">Add Violation</h3>
            <form onSubmit={handleAddViolation} className="space-y-4">
              <select
                value={violationForm.resident_id}
                onChange={(e) => setViolationForm({ ...violationForm, resident_id: e.target.value })}
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
                placeholder="Violation Type"
                value={violationForm.violation_type}
                onChange={(e) => setViolationForm({ ...violationForm, violation_type: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                required
              />
              <textarea
                placeholder="Description"
                value={violationForm.description}
                onChange={(e) => setViolationForm({ ...violationForm, description: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                rows="4"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddViolation(false)}
                  className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 rounded font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Violation Letter Modal */}
      {showViolationLetter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold">Violation Letter</h3>
              <button
                onClick={() => setShowViolationLetter(null)}
                className="text-2xl text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="bg-white text-gray-900 p-4 rounded whitespace-pre-wrap text-sm">
              {showViolationLetter.letter}
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportCSV && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg w-96">
            <h3 className="text-2xl font-bold mb-4">Import Residents from CSV</h3>
            <p className="text-gray-400 text-sm mb-4">
              CSV format: name, unit, email (optional), phone (optional)
            </p>
            <form onSubmit={handleImportCSV} className="space-y-4">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                required
              />
              <div className="bg-gray-700 p-3 rounded text-sm text-gray-300">
                <p className="font-semibold mb-2">Example CSV format:</p>
                <pre className="text-xs overflow-x-auto">name,unit,email,phone
John Doe,101,john@example.com,555-1234
Jane Smith,102,jane@example.com,555-5678</pre>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportCSV(false)
                    setCsvFile(null)
                  }}
                  className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 rounded font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
