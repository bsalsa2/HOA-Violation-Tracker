import React, { useState, useEffect } from 'react'
import { hoaAPI, residentAPI, violationAPI } from '../api'
import HOAList from '../components/HOAList'
import ResidentList from '../components/ResidentList'
import ViolationList from '../components/ViolationList'
import AddViolationForm from '../components/AddViolationForm'
import AddResidentForm from '../components/AddResidentForm'
import AddHOAForm from '../components/AddHOAForm'

function Dashboard({ setToken }) {
  const [hoas, setHoas] = useState([])
  const [selectedHOA, setSelectedHOA] = useState(null)
  const [residents, setResidents] = useState([])
  const [violations, setViolations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddViolation, setShowAddViolation] = useState(false)
  const [showAddResident, setShowAddResident] = useState(false)
  const [showAddHOA, setShowAddHOA] = useState(false)

  useEffect(() => {
    loadHOAs()
  }, [])

  useEffect(() => {
    if (selectedHOA) {
      loadResidents()
      loadViolations()
    }
  }, [selectedHOA])

  const loadHOAs = async () => {
    try {
      const response = await hoaAPI.getAll()
      setHoas(response.data)
      if (response.data.length > 0) {
        setSelectedHOA(response.data[0])
      }
    } catch (err) {
      console.error('Error loading HOAs:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadResidents = async () => {
    try {
      const response = await residentAPI.getByHOA(selectedHOA.id)
      setResidents(response.data)
    } catch (err) {
      console.error('Error loading residents:', err)
    }
  }

  const loadViolations = async () => {
    try {
      const response = await violationAPI.getByHOA(selectedHOA.id)
      setViolations(response.data)
    } catch (err) {
      console.error('Error loading violations:', err)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setToken(null)
  }

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">HOA Violation Tracker</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
          >
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">HOAs</h2>
              <button
                onClick={() => setShowAddHOA(true)}
                className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 text-sm transition-colors"
              >
                + Add HOA
              </button>
            </div>
            <HOAList hoas={hoas} selectedHOA={selectedHOA} onSelect={setSelectedHOA} />
            {hoas.length === 0 && (
              <p className="text-gray-400 text-center py-8">No HOAs yet. Add one to get started.</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Residents</h2>
            </div>
            <ResidentList residents={residents} />
            {selectedHOA && (
              <button
                onClick={() => setShowAddResident(true)}
                className="mt-4 w-full py-2 bg-green-600 rounded hover:bg-green-700 transition-colors"
              >
                + Add Resident
              </button>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Violations</h2>
            </div>
            <ViolationList violations={violations} onStatusChange={loadViolations} />
            {selectedHOA && (
              <button
                onClick={() => setShowAddViolation(true)}
                className="mt-4 w-full py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                + Add Violation
              </button>
            )}
          </div>
        </div>
      </div>

      {showAddHOA && (
        <AddHOAForm
          onClose={() => setShowAddHOA(false)}
          onAdded={() => {
            loadHOAs()
            setShowAddHOA(false)
          }}
        />
      )}

      {showAddResident && selectedHOA && (
        <AddResidentForm
          hoaId={selectedHOA.id}
          onClose={() => setShowAddResident(false)}
          onAdded={() => {
            loadResidents()
            setShowAddResident(false)
          }}
        />
      )}

      {showAddViolation && selectedHOA && (
        <AddViolationForm
          hoaId={selectedHOA.id}
          residents={residents}
          onClose={() => setShowAddViolation(false)}
          onAdded={() => {
            loadViolations()
            setShowAddViolation(false)
          }}
        />
      )}
    </div>
  )
}

export default Dashboard
