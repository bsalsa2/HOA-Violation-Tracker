import React, { useState, useMemo } from 'react'
import { Badge, EmptyState } from './primitives'
import { STATUS_CONFIG, PRIORITY_CONFIG, STATUS_ORDER } from '../lib/constants'
import { formatDate, currency, dueLabel, isOverdue } from '../lib/format'

function ViolationCard({ violation, onOpen }) {
  const due = dueLabel(violation)
  const overdue = isOverdue(violation)
  return (
    <button
      onClick={() => onOpen(violation)}
      className={`w-full text-left px-5 py-4 hover:bg-slate-800/50 transition-colors border-l-2 ${
        overdue ? 'border-red-500' : violation.priority === 'high' ? 'border-rose-500/40' : 'border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-100">{violation.violation_type}</span>
            <Badge config={STATUS_CONFIG[violation.status]} />
            {violation.priority === 'high' && <Badge config={PRIORITY_CONFIG.high}>High</Badge>}
            {violation.notice_level > 0 && (
              <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">{violation.notice_label}</Badge>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">{violation.resident_name} · Unit {violation.resident_unit}</p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{violation.description}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-slate-600">{formatDate(violation.created_at)}</span>
            {due && (
              <span className={`text-xs font-medium ${due.tone === 'overdue' ? 'text-red-400' : due.tone === 'soon' ? 'text-amber-400' : 'text-slate-500'}`}>
                {due.text}
              </span>
            )}
            {violation.fine_amount > 0 && (
              <span className={`text-xs font-medium ${violation.fine_paid ? 'text-green-400' : 'text-rose-400'}`}>
                {currency(violation.fine_amount)} {violation.fine_paid ? 'paid' : 'due'}
              </span>
            )}
            {violation.note_count > 0 && (
              <span className="text-xs text-slate-600 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                {violation.note_count}
              </span>
            )}
          </div>
        </div>
        <svg className="w-4 h-4 text-slate-600 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

export default function ViolationsTab({ violations, onOpen, onNew, canAdd, query, setQuery }) {
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('recent')

  const filtered = useMemo(() => {
    let list = violations
    if (statusFilter === 'overdue') {
      list = list.filter((v) => isOverdue(v))
    } else if (statusFilter) {
      list = list.filter((v) => v.status === statusFilter)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (v) =>
          v.violation_type?.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q) ||
          v.resident_name?.toLowerCase().includes(q) ||
          String(v.resident_unit || '').toLowerCase().includes(q)
      )
    }
    const sorted = [...list]
    if (sortBy === 'recent') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else if (sortBy === 'due') sorted.sort((a, b) => new Date(a.due_date || '2999') - new Date(b.due_date || '2999'))
    else if (sortBy === 'priority') {
      const rank = { high: 0, medium: 1, low: 2 }
      sorted.sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1))
    }
    return sorted
  }, [violations, statusFilter, query, sortBy])

  const counts = useMemo(() => {
    const c = { all: violations.length, overdue: violations.filter((v) => isOverdue(v)).length }
    STATUS_ORDER.forEach((s) => { c[s] = violations.filter((v) => v.status === s).length })
    return c
  }, [violations])

  const chips = [
    { key: '', label: 'All', count: counts.all },
    { key: 'open', label: 'Open', count: counts.open },
    { key: 'noticed', label: 'Noticed', count: counts.noticed },
    { key: 'escalated', label: 'Escalated', count: counts.escalated },
    { key: 'resolved', label: 'Resolved', count: counts.resolved },
    { key: 'overdue', label: 'Overdue', count: counts.overdue, danger: true },
  ]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl">
      <div className="px-5 py-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search violations…"
              className="w-full pl-9 pr-3 py-2 bg-slate-800 text-sm text-white rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500">
              <option value="recent">Most recent</option>
              <option value="due">Due soonest</option>
              <option value="priority">Priority</option>
            </select>
            <button
              onClick={onNew}
              disabled={!canAdd}
              className="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium whitespace-nowrap"
              title={!canAdd ? 'Add residents first' : ''}
            >
              + New Violation
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map((chip) => (
            <button
              key={chip.key || 'all'}
              onClick={() => setStatusFilter(chip.key)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                statusFilter === chip.key
                  ? chip.danger ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                  : 'text-slate-400 border-slate-700 hover:border-slate-600'
              }`}
            >
              {chip.label} <span className="opacity-60">{chip.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-slate-800 max-h-[calc(100vh-22rem)] overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            title={query || statusFilter ? 'No violations match your filters.' : 'No violations yet.'}
            hint={query || statusFilter ? 'Try clearing the search or filter.' : 'Create your first violation to get started.'}
          />
        ) : (
          filtered.map((v) => <ViolationCard key={v.id} violation={v} onOpen={onOpen} />)
        )}
      </div>
    </div>
  )
}
