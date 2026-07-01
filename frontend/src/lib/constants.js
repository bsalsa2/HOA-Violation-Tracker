export const VIOLATION_TYPES = [
  'Landscaping / Lawn Care',
  'Parking Violation',
  'Noise Complaint',
  'Trash / Debris',
  'Exterior Maintenance',
  'Pet Violation',
  'Architectural Modification',
  'Pool / Amenity Misuse',
  'Commercial Vehicle',
  'Holiday Decorations',
  'Fencing / Walls',
  'Other',
]

// Conventional traffic-light semantics — blue: active, amber: notice served /
// awaiting cure, green: resolved, red: escalated/problem. Instantly readable.
export const STATUS_CONFIG = {
  open: { label: 'Open', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/25', dot: '#3b82f6' },
  noticed: { label: 'Noticed', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25', dot: '#f59e0b' },
  resolved: { label: 'Resolved', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25', dot: '#10b981' },
  escalated: { label: 'Escalated', badge: 'bg-red-500/10 text-red-400 border-red-500/25', dot: '#ef4444' },
}

export const STATUS_ORDER = ['open', 'noticed', 'resolved', 'escalated']

export const PRIORITY_CONFIG = {
  low: { label: 'Low', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/25', dot: '#64748b' },
  medium: { label: 'Medium', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25', dot: '#f59e0b' },
  high: { label: 'High', badge: 'bg-red-500/10 text-red-400 border-red-500/25', dot: '#ef4444' },
}

export const NOTICE_LEVELS = [
  'None',
  'Courtesy Notice',
  'First Notice',
  'Second Notice',
  'Final Notice',
  'Hearing / Legal',
]
