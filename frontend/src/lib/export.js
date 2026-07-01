// Client-side file downloads: CSV export and PDF letters.

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Export a violation list as a spreadsheet-ready CSV (board/audit requests). */
export function downloadViolationsCsv(violations, hoaName = 'HOA') {
  const header = ['Unit', 'Resident', 'Type', 'Status', 'Priority', 'Notice Level', 'Opened', 'Cure By', 'Resolved', 'Fine', 'Fine Paid', 'Description']
  const rows = violations.map((v) => [
    v.resident_unit, v.resident_name, v.violation_type, v.status, v.priority,
    v.notice_label, (v.created_at || '').slice(0, 10), (v.due_date || '').slice(0, 10),
    (v.resolved_at || '').slice(0, 10), v.fine_amount || 0, v.fine_paid ? 'yes' : 'no', v.description,
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
  const date = new Date().toISOString().slice(0, 10)
  const safe = hoaName.replace(/[^A-Za-z0-9_-]+/g, '_')
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safe}_violations_${date}.csv`)
}

/** Save a letter PDF blob returned by the API. */
export function downloadLetterPdf(blob, residentName = 'resident') {
  const safe = String(residentName).replace(/[^A-Za-z0-9_-]+/g, '_')
  triggerDownload(blob, `violation_notice_${safe}.pdf`)
}
