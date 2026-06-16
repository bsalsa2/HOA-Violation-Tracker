import React from 'react'

function ResidentList({ residents }) {
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {residents.map((resident) => (
        <div key={resident.id} className="p-3 bg-gray-700 rounded">
          <p className="font-semibold">{resident.name}</p>
          <p className="text-sm text-gray-300">Unit {resident.unit}</p>
          {resident.email && <p className="text-xs text-gray-400">{resident.email}</p>}
          {resident.phone && <p className="text-xs text-gray-400">{resident.phone}</p>}
        </div>
      ))}
      {residents.length === 0 && (
        <p className="text-gray-400 text-center py-8">No residents yet</p>
      )}
    </div>
  )
}

export default ResidentList
