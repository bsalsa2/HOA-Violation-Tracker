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

export const STATUS_CONFIG = {
  open: { label: 'Open', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: '#f59e0b' },
  noticed: { label: 'Noticed', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: '#3b82f6' },
  resolved: { label: 'Resolved', badge: 'bg-green-500/10 text-green-400 border-green-500/20', dot: '#22c55e' },
  escalated: { label: 'Escalated', badge: 'bg-red-500/10 text-red-400 border-red-500/20', dot: '#ef4444' },
}

export const STATUS_ORDER = ['open', 'noticed', 'resolved', 'escalated']

export const PRIORITY_CONFIG = {
  low: { label: 'Low', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', dot: '#94a3b8' },
  medium: { label: 'Medium', badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', dot: '#eab308' },
  high: { label: 'High', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: '#f43f5e' },
}

export const NOTICE_LEVELS = [
  'None',
  'Courtesy Notice',
  'First Notice',
  'Second Notice',
  'Final Notice',
  'Hearing / Legal',
]

export const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b']
