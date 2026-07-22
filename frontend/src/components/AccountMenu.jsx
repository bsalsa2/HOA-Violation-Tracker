import React, { useState, useRef, useEffect, useCallback } from 'react'
import { authAPI, adminAPI } from '../api'
import { Modal, Spinner } from './primitives'

/** Header account dropdown: change password (all users), invite links (admin), sign out. */
export default function AccountMenu({ email, isAdmin, onSignOut, addToast }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(null) // 'password' | 'invite' | null
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const item = 'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/[0.06] transition-colors'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 border border-white/10 hover:border-white/20 hover:bg-white/[0.06] rounded-lg transition-colors whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        <span className="hidden sm:inline">Account</span>
      </button>

      {open && (
        <div className="anim-scale-in absolute right-0 top-full mt-2 w-60 vt-card bg-slate-950 py-1.5 z-50" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), var(--shadow-xl)' }}>
          {email && (
            <div className="px-3 py-1.5 border-b border-white/[0.06] mb-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Signed in as</p>
              <p className="text-xs text-slate-300 truncate">{email}{isAdmin && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#60a5fa] border border-[#3b82f6]/20">Admin</span>}</p>
            </div>
          )}
          <button onClick={() => { setModal('password'); setOpen(false) }} className={item}>
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            Change password
          </button>
          <div className="vt-hairline my-1.5" />
          <button onClick={onSignOut} className={item}>
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Sign out
          </button>
        </div>
      )}

      {modal === 'password' && <ChangePasswordModal onClose={() => setModal(null)} addToast={addToast} />}
    </div>
  )
}

function ChangePasswordModal({ onClose, addToast }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('New passwords do not match.'); return }
    setLoading(true)
    try {
      await authAPI.changePassword(current, next)
      addToast('Password updated.')
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not change password.')
    } finally {
      setLoading(false)
    }
  }

  const field = 'vt-input px-3.5 py-2.5 focus:ring-2 focus:ring-[#3b82f6]/20'

  return (
    <Modal title="Change password" subtitle="Update the password for your account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Current password</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} required autoComplete="current-password" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={field} placeholder="At least 8 characters" minLength={8} required autoComplete="new-password" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} required autoComplete="new-password" />
        </div>
        {error && <div className="bg-red-900/30 border border-red-800/50 text-red-200 text-sm rounded-lg p-3">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm border border-white/10 text-slate-400 hover:bg-white/5 rounded-lg transition-colors">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary btn-sheen flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
            {loading && <Spinner />} Update password
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function InviteModal({ onClose, addToast }) {
  const [invites, setInvites] = useState(null)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  const linkFor = (code) => `${window.location.origin}/login?invite=${encodeURIComponent(code)}`

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.listInvites()
      setInvites(res.data)
    } catch {
      setInvites([])
      addToast('Could not load invites.', 'error')
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const create = async () => {
    setCreating(true)
    try {
      const res = await adminAPI.createInvite(label.trim() || null)
      setLabel('')
      await load()
      // Auto-copy the fresh link so the operator can paste it straight into an email
      try { await navigator.clipboard.writeText(linkFor(res.data.code)); addToast('Invite link copied to clipboard.') }
      catch { addToast('Invite created.') }
    } catch {
      addToast('Could not create invite.', 'error')
    } finally {
      setCreating(false)
    }
  }

  const copy = async (code, id) => {
    try {
      await navigator.clipboard.writeText(linkFor(code))
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
    } catch { addToast('Copy failed — select the link and copy manually.', 'error') }
  }

  const revoke = async (id) => {
    try { await adminAPI.revokeInvite(id); await load() }
    catch (err) { addToast(err.response?.data?.detail || 'Could not revoke.', 'error') }
  }

  return (
    <Modal title="Invite links" subtitle="Generate reusable sign-up links for customers — each link can be used unlimited times" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional) — e.g. Sunset Ridge HOA"
            className="vt-input px-3.5 py-2.5 focus:ring-2 focus:ring-[#3b82f6]/20"
          />
          <button onClick={create} disabled={creating} className="btn-primary btn-sheen px-4 py-2.5 text-sm whitespace-nowrap flex items-center gap-2">
            {creating && <Spinner />} Generate link
          </button>
        </div>
        <p className="text-xs text-slate-500">Send the generated link to a customer after they've paid. It works once — creating their account consumes it.</p>

        {invites === null ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Spinner /> Loading…</div>
        ) : invites.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No invites yet. Generate one above.</p>
        ) : (
          <div className="space-y-2 max-h-[45vh] overflow-y-auto">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-200 truncate">{inv.label || 'Invite'}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">Reusable</span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">{linkFor(inv.code)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => copy(inv.code, inv.id)} className="px-2.5 py-1.5 text-xs text-slate-300 border border-white/10 hover:bg-white/[0.06] rounded-lg transition-colors">
                    {copiedId === inv.id ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={() => revoke(inv.id)} aria-label="Revoke invite" className="px-2 py-1.5 text-xs text-slate-500 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-lg transition-colors">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
