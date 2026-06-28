export function formatDate(dateStr, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-US', opts)
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function currency(n) {
  const num = Number(n || 0)
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Whole days from now until dateStr. Negative = in the past. */
export function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const now = new Date()
  const ms = d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function isOverdue(violation) {
  if (!violation || violation.status === 'resolved' || !violation.due_date) return false
  const days = daysUntil(violation.due_date)
  return days !== null && days < 0
}

/** Human label for a due date relative to today. */
export function dueLabel(violation) {
  if (!violation?.due_date) return null
  if (violation.status === 'resolved') return null
  const days = daysUntil(violation.due_date)
  if (days === null) return null
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'Due today', tone: 'soon' }
  if (days <= 3) return { text: `Due in ${days}d`, tone: 'soon' }
  return { text: `Due in ${days}d`, tone: 'ok' }
}

export function relativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}
