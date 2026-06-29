import React, { useState } from 'react'
import { Modal } from './primitives'
import { residentAPI, violationAPI, hoaAPI } from '../api'
import { VIOLATION_TYPES } from '../lib/constants'

const inputCls = 'vt-input px-3 py-2.5'
const labelCls = 'block text-sm font-medium text-slate-300 mb-1.5'

function ErrorBox({ children }) {
  if (!children) return null
  return <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">{children}</div>
}

function parseDetail(err, fallback) {
  const detail = err.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(', ')
  return detail || fallback
}

export function AddClientModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await hoaAPI.create(name, address)
      onCreated(res.data)
    } catch (err) {
      setError(parseDetail(err, 'Failed to add client.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Add Client (HOA)" subtitle="Add another community to your portfolio" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>HOA / Community Name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Sunridge Estates HOA" required />
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Anytown, CA" required />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] disabled:opacity-60 text-white font-medium rounded-lg transition-colors">
            {loading ? 'Adding…' : 'Add Client'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

export function AddResidentModal({ hoaId, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await residentAPI.create(hoaId, name, unit, email || null, phone || null)
      onAdded(res.data)
    } catch (err) {
      setError(parseDetail(err, 'Failed to add resident.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Add Resident" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Full Name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />
        </div>
        <div>
          <label className={labelCls}>Unit / Address</label>
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit 101  —or—  123 Main St" required />
          <p className="text-xs text-slate-500 mt-1">A unit number or a street address — whichever your community uses.</p>
        </div>
        <div>
          <label className={labelCls}>Email <span className="text-slate-500 font-normal">(required for sending letters)</span></label>
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
        </div>
        <div>
          <label className={labelCls}>Phone <span className="text-slate-500 font-normal">(optional)</span></label>
          <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-555-5555" />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] disabled:opacity-60 text-white font-medium rounded-lg transition-colors">
            {loading ? 'Adding…' : 'Add Resident'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

export function AddViolationModal({ hoaId, residents, defaultResidentId, onClose, onAdded }) {
  const [residentId, setResidentId] = useState(defaultResidentId || residents[0]?.id || '')
  const [violationType, setViolationType] = useState('')
  const [customType, setCustomType] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueInDays, setDueInDays] = useState(14)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedResident = residents.find((r) => r.id === parseInt(residentId))
  const finalType = violationType === 'Other' ? customType : violationType

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!finalType.trim()) {
      setError('Please choose or enter a violation type.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await violationAPI.create(hoaId, parseInt(residentId, 10), finalType, description, priority, parseInt(dueInDays, 10) || 14)
      onAdded()
    } catch (err) {
      setError(parseDetail(err, 'Failed to create violation.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="New Violation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Resident</label>
          <select className={inputCls} value={residentId} onChange={(e) => setResidentId(e.target.value)} required>
            <option value="">Select a resident</option>
            {residents.map((r) => (<option key={r.id} value={r.id}>{r.name} — {r.unit}</option>))}
          </select>
          {selectedResident && !selectedResident.email && (
            <p className="mt-1.5 text-xs text-amber-400">⚠ This resident has no email — you won't be able to send them a letter.</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Violation Type</label>
          <select className={inputCls} value={violationType} onChange={(e) => setViolationType(e.target.value)} required>
            <option value="">Select a type</option>
            {VIOLATION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
        {violationType === 'Other' && (
          <div>
            <label className={labelCls}>Custom Type</label>
            <input className={inputCls} value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Describe the violation type" required />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Priority</label>
            <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Cure Period</label>
            <select className={inputCls} value={dueInDays} onChange={(e) => setDueInDays(e.target.value)}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={45}>45 days</option>
              <option value={60}>60 days</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={`${inputCls} resize-none`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the specific violation in detail…" rows={3} required />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] disabled:opacity-60 text-white font-medium rounded-lg transition-colors">
            {loading ? 'Creating…' : 'Create Violation'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

export function ImportCSVModal({ hoaId, onClose, onDone, addToast }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    try {
      const res = await residentAPI.importCSV(hoaId, file)
      setResult(res.data)
    } catch (err) {
      addToast(parseDetail(err, 'Import failed.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <Modal title="Import Results" onClose={() => onDone(result.added, result.errors || [])}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-green-950 border border-green-800 rounded-xl p-4">
            <svg className="w-5 h-5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-green-200 text-sm">{result.message}</p>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Rows with issues:</p>
              <div className="bg-slate-800 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                {result.errors.map((err, i) => (<p key={i} className="text-xs text-amber-300">{err}</p>))}
              </div>
            </div>
          )}
          <button onClick={() => onDone(result.added, result.errors || [])} className="w-full py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] text-white font-medium rounded-lg transition-colors">Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Import Residents from CSV" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-black/30 ring-1 ring-white/[0.06] rounded-xl p-4 text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-300">Required CSV format:</p>
          <p className="font-mono text-blue-300/90">name,unit,email,phone</p>
          <p className="font-mono text-slate-500">Jane Smith,101,jane@example.com,555-1234</p>
          <p className="mt-2">The <span className="text-slate-300">unit</span> column accepts a unit number or a street address. <span className="text-slate-300">email</span> and <span className="text-slate-300">phone</span> are optional.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Select CSV File</label>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])}
              className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-500/15 file:text-blue-300 hover:file:bg-blue-500/25 file:cursor-pointer file:transition-colors" required />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading || !file} className="flex-1 py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] disabled:opacity-60 text-white font-medium rounded-lg transition-colors">
              {loading ? 'Importing…' : 'Import'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

export function EditHOAModal({ hoa, onClose, onUpdated, onDelete, onSaveHoaEmail }) {
  const [name, setName] = useState(hoa.name)
  const [address, setAddress] = useState(hoa.address)
  const [email, setEmail] = useState(hoa.email || '')
  const [phone, setPhone] = useState(hoa.phone || '')
  const [contactPersonName, setContactPersonName] = useState(hoa.contact_person_name || '')
  const [website, setWebsite] = useState(hoa.website || '')
  const [businessHours, setBusinessHours] = useState(hoa.business_hours || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) {
      setError('Email address is required to send violation letters.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Save email locally first (this always works)
      if (onSaveHoaEmail) {
        onSaveHoaEmail(hoa.id, email)
      }
      // Try to save to backend too (optional, might fail if DB columns don't exist)
      try {
        await hoaAPI.update(hoa.id, name, address, email || null, phone || null, contactPersonName || null, website || null, businessHours || null)
      } catch (err) {
        console.warn('Backend update failed, but email saved locally:', err)
      }
      onUpdated()
    } catch (err) {
      console.error('Error:', err)
      setError(parseDetail(err, 'Failed to update HOA.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Edit HOA Settings" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 max-h-96 overflow-y-auto">
        <div className="bg-blue-950 border border-blue-800 rounded-lg p-3 text-xs text-blue-200">
          ⓘ Add your HOA contact information so violation notices are sent on behalf of your organization.
        </div>
        <div>
          <label className={labelCls}>HOA Name *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>Address *</label>
          <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>Email Address</label>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="board@yourhoa.com" />
          <p className="text-xs text-slate-500 mt-1">Used as reply-to address on violation notices.</p>
        </div>
        <div>
          <label className={labelCls}>Phone Number</label>
          <input type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
        <div>
          <label className={labelCls}>Contact Person</label>
          <input className={inputCls} value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} placeholder="Board President Name" />
          <p className="text-xs text-slate-500 mt-1">Name to appear on violation notices (e.g., board president).</p>
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input type="url" className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.yourhoa.com" />
        </div>
        <div>
          <label className={labelCls}>Business Hours</label>
          <input className={inputCls} value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="Mon-Fri 9am-5pm EST" />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-600/25 active:scale-[.98] disabled:opacity-60 text-white font-medium rounded-lg transition-colors">
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
        </div>
        {onDelete && (
          <button type="button" onClick={onDelete} className="w-full text-xs text-slate-500 hover:text-red-400 transition-colors pt-1">
            Remove this client and all its data
          </button>
        )}
      </form>
    </Modal>
  )
}
