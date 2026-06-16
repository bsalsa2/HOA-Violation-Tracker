import React from 'react'

function HOAList({ hoas, selectedHOA, onSelect }) {
  return (
    <div className="space-y-2">
      {hoas.map((hoa) => (
        <button
          key={hoa.id}
          onClick={() => onSelect(hoa)}
          className={`w-full text-left p-3 rounded transition-colors ${
            selectedHOA?.id === hoa.id
              ? 'bg-blue-600'
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          <p className="font-semibold">{hoa.name}</p>
          <p className="text-sm text-gray-300">{hoa.address}</p>
        </button>
      ))}
    </div>
  )
}

export default HOAList
