import React, { useState, useRef, useEffect, useCallback } from 'react'
import { authAPI, adminAPI } from '../api'
import { Modal, Spinner } from './primitives'

/** Header account dropdown: change password (all users), invite links (admin), sign out. */
export default function AccountMenu({ email, isAdmin, onSignOut, addToast }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(null) // 'password' | 'invite' | 'wipe' | null
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
          {isAdmin && (
            <button onClick={() => { setModal('invite'); setOpen(false) }} className={item}>
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              Invite links
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setModal('wipe'); setOpen(false) }} className={`${item} text-red-400 hover:bg-red-500/10`}>
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Wipe all data
            </button>
          )}
          <div className="vt-hairline my-1.5" />
          <button onClick={onSignOut} className={item}>
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Sign out
          </button>
        </div>
      )}

      {modal === 'password' && <ChangePasswordModal onClose={() => setModal(null)} addToast={addToast} />}
      {modal === 'invite' && <InviteModal onClose={() => setModal(null)} addToast={addToast} />}
      {modal === 'wipe' && <WipeDataModal onClose={() => setModal(null)} addToast={addToast} />}
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

function WipeDataModal({ onClose, addToast }) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await adminAPI.wipeData()
      addToast(res.data.message || 'All data wiped.')
      // Every list in the app (HOAs, residents, violations) was loaded before
      // the wipe — reload so the whole app re-fetches a clean, empty state.
      window.location.reload()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not wipe data.')
      setLoading(false)
    }
  }

  return (
    <Modal title="Wipe all data" subtitle="Deletes every HOA, resident, and violation — for every account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2.5 bg-red-900/20 border border-red-800/40 text-red-200 text-sm rounded-lg p-3">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <span>This permanently deletes <strong>all HOAs, residents, and violations across every account</strong> — not just yours. Logins and invite links are kept. This cannot be undone.</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Type <span className="font-mono text-red-300">WIPE</span> to confirm</label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="vt-input px-3.5 py-2.5 focus:ring-2 focus:ring-red-500/30 font-mono"
            placeholder="WIPE"
            autoComplete="off"
          />
        </div>
        {error && <div className="bg-red-900/30 border border-red-800/50 text-red-200 text-sm rounded-lg p-3">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm border border-white/10 text-slate-400 hover:bg-white/5 rounded-lg transition-colors">Cancel</button>
          <button
            type="submit"
            disabled={loading || confirmText !== 'WIPE'}
            className="flex-1 py-2.5 text-sm bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 disabled:opacity-40 disabled:pointer-events-none text-slate-100 rounded-lg transition-all font-medium shadow-lg shadow-red-900/40 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />} Wipe everything
          </button>
        </div>
      </form>
    </Modal>
  )
}

function InviteModal({ onClose, addToast }) {
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
    <Modal title="Invite links" subtitle="Generate a single-use sign-up link for a paying customer" onClose={onClose} wide>
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
                    {inv.used ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20 shrink-0">Used{inv.used_by_email ? ` · ${inv.used_by_email}` : ''}</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">Available</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">{linkFor(inv.code)}</p>
                </div>
                {!inv.used && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => copy(inv.code, inv.id)} className="px-2.5 py-1.5 text-xs text-slate-300 border border-white/10 hover:bg-white/[0.06] rounded-lg transition-colors">
                      {copiedId === inv.id ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={() => revoke(inv.id)} aria-label="Revoke invite" className="px-2 py-1.5 text-xs text-slate-500 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-lg transition-colors">✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
