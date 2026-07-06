import { formatDate, currency } from './format'

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function isOverdue(v) {
  if (!v.due_date || v.status === 'resolved') return false
  return new Date(v.due_date) < new Date()
}

const GRADE_COLORS = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#ea580c', F: '#dc2626' }

/**
 * Static grouped-bar SVG: new vs resolved violations per month.
 * Print-friendly — palette (#2563eb / #16a34a on white) is CVD-validated.
 */
function trendChartSvg(timeline) {
  if (!timeline?.length) return ''
  const W = 660
  const H = 190
  const pad = { top: 10, right: 8, bottom: 24, left: 30 }
  const iw = W - pad.left - pad.right
  const ih = H - pad.top - pad.bottom
  const maxRaw = Math.max(...timeline.map((m) => Math.max(m.new || 0, m.resolved || 0)), 1)
  const yMax = Math.ceil(maxRaw / 2) * 2 // even top so the midpoint gridline is an integer
  const y = (v) => pad.top + ih - (v / yMax) * ih
  const groupW = iw / timeline.length
  const barW = Math.min(20, (groupW - 16) / 2)

  // Bars are rounded at the data end only, anchored square to the baseline.
  const bar = (x, v, color, label) => {
    if (v <= 0) return ''
    const top = y(v)
    const bottom = pad.top + ih
    const r = Math.min(4, bottom - top, barW / 2)
    return `<path d="M${x},${bottom} V${(top + r).toFixed(1)} Q${x},${top.toFixed(1)} ${x + r},${top.toFixed(1)} H${(x + barW - r).toFixed(1)} Q${x + barW},${top.toFixed(1)} ${x + barW},${(top + r).toFixed(1)} V${bottom} Z" fill="${color}"><title>${esc(label)}: ${v}</title></path>`
  }

  const grid = [0, yMax / 2, yMax]
    .map(
      (v) =>
        `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0" stroke-width="1" />` +
        `<text x="${pad.left - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#94a3b8">${v}</text>`
    )
    .join('')

  const groups = timeline
    .map((m, i) => {
      const gx = pad.left + i * groupW + (groupW - (barW * 2 + 2)) / 2
      return (
        bar(gx, m.new || 0, '#2563eb', `${m.month} — new`) +
        bar(gx + barW + 2, m.resolved || 0, '#16a34a', `${m.month} — resolved`) +
        `<text x="${(pad.left + i * groupW + groupW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#64748b">${esc(m.month)}</text>`
      )
    })
    .join('')

  return `
  <div class="legend">
    <span><span class="sw" style="background:#2563eb"></span>New</span>
    <span><span class="sw" style="background:#16a34a"></span>Resolved</span>
  </div>
  <svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="New versus resolved violations by month, last six months" style="max-width:${W}px">${grid}${groups}</svg>`
}

/**
 * Renders a print-ready board meeting compliance report.
 * Pass an already-opened `win` (so the caller can open it inside the click
 * gesture, then fetch fresh data) — otherwise one is opened here.
 * Returns false if the popup was blocked.
 */
export function openBoardReport(hoa, analytics, violations, win) {
  if (!win) win = window.open('', '_blank')
  if (!win) return false

  const k = analytics?.kpis || {}
  const today = formatDate(new Date().toISOString())

  const active = violations.filter((v) => v.status !== 'resolved')
  const overdue = violations.filter(isOverdue)

  const statusRows = (analytics?.by_status || [])
    .map((s) => `<tr><td style="text-transform:capitalize">${esc(s.label)}</td><td style="text-align:right">${s.value}</td></tr>`)
    .join('')

  const typeRows = (analytics?.by_type || [])
    .slice(0, 8)
    .map((t) => `<tr><td>${esc(t.label)}</td><td style="text-align:right">${t.value}</td></tr>`)
    .join('')

  const activeRows = active
    .slice(0, 200)
    .map(
      (v) => `
      <tr class="${isOverdue(v) ? 'overdue' : ''}">
        <td>${esc(v.resident_unit)}</td>
        <td>${esc(v.resident_name)}</td>
        <td>${esc(v.violation_type)}</td>
        <td style="text-transform:capitalize">${esc(v.status)}</td>
        <td style="text-transform:capitalize">${esc(v.priority)}</td>
        <td>${v.due_date ? formatDate(v.due_date) : '—'}${isOverdue(v) ? ' ⚠' : ''}</td>
        <td style="text-align:right">${v.fine_amount > 0 ? currency(v.fine_amount) + (v.fine_paid ? ' (paid)' : '') : '—'}</td>
      </tr>`
    )
    .join('')

  const compliance = analytics?.compliance
  const complianceHtml = compliance
    ? `
  <h2>Compliance Score</h2>
  <div class="kpis">
    <div class="kpi"><div class="v" style="color:${GRADE_COLORS[compliance.grade] || '#1e293b'}">${esc(compliance.grade)} · ${compliance.score}/100</div><div class="l">Overall Grade</div></div>
    <div class="kpi"><div class="v">${compliance.factors.resolution_rate}%</div><div class="l">Cases Resolved</div></div>
    <div class="kpi"><div class="v">${compliance.factors.on_time_rate}%</div><div class="l">Resolved On Time</div></div>
    <div class="kpi"><div class="v">${compliance.factors.first_time_rate}%</div><div class="l">First-Time Compliance</div></div>
  </div>`
    : ''

  const trendSvg = trendChartSvg(analytics?.timeline)
  const trendHtml = trendSvg ? `\n  <h2>Six-Month Enforcement Trend</h2>${trendSvg}` : ''

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Compliance Report — ${esc(hoa?.name || 'HOA')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 40px; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 28px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  .sub { color: #64748b; font-size: 13px; margin-top: 4px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 20px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .kpi .v { font-size: 22px; font-weight: 700; }
  .kpi .l { font-size: 11px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 2px solid #e2e8f0; padding: 8px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; }
  tr.overdue td { background: #fef2f2; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .footer { margin-top: 40px; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  .legend { display: flex; gap: 16px; font-size: 12px; color: #475569; margin: 4px 0 6px; }
  .legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .btn { position: fixed; top: 16px; right: 16px; background: #2563eb; color: white; border: 0; border-radius: 8px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
  @media print { .btn { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>${esc(hoa?.name || 'HOA')} — Violation Compliance Report</h1>
  <div class="sub">${esc(hoa?.address || '')} · Generated ${esc(today)}</div>

  <div class="kpis">
    <div class="kpi"><div class="v">${k.open_violations ?? active.length}</div><div class="l">Active Cases</div></div>
    <div class="kpi"><div class="v" style="color:${(k.overdue_violations || 0) > 0 ? '#dc2626' : '#1e293b'}">${k.overdue_violations ?? overdue.length}</div><div class="l">Overdue</div></div>
    <div class="kpi"><div class="v">${k.resolution_rate ?? 0}%</div><div class="l">Resolution Rate</div></div>
    <div class="kpi"><div class="v">${currency(k.outstanding_fines || 0)}</div><div class="l">Outstanding Fines</div></div>
  </div>

${complianceHtml}
${trendHtml}

  <h2>Fines Ledger</h2>
  <div class="kpis" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi"><div class="v">${currency(k.total_fines || 0)}</div><div class="l">Total Assessed</div></div>
    <div class="kpi"><div class="v" style="color:#16a34a">${currency(k.collected_fines || 0)}</div><div class="l">Collected (Paid)</div></div>
    <div class="kpi"><div class="v" style="color:#dc2626">${currency(k.outstanding_fines || 0)}</div><div class="l">Outstanding</div></div>
  </div>

  <div class="two-col">
    <div>
      <h2>By Status</h2>
      <table><tbody>${statusRows || '<tr><td>No data</td></tr>'}</tbody></table>
    </div>
    <div>
      <h2>Most Common Types</h2>
      <table><tbody>${typeRows || '<tr><td>No data</td></tr>'}</tbody></table>
    </div>
  </div>

  <h2>Active Violations (${active.length})</h2>
  <table>
    <thead>
      <tr><th>Unit</th><th>Resident</th><th>Type</th><th>Status</th><th>Priority</th><th>Cure By</th><th style="text-align:right">Fine</th></tr>
    </thead>
    <tbody>${activeRows || '<tr><td colspan="7" style="color:#94a3b8">No active violations 🎉</td></tr>'}</tbody>
  </table>

  <div class="footer">
    Generated by ViolationTrack · This report reflects data as of ${esc(today)} and is intended for HOA board review.
  </div>
</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}
