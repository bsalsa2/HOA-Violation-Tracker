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

// Restrained, luxe semantic palette: champagne gold · sage · clay · stone
export const STATUS_CONFIG = {
  open: { label: 'Open', badge: 'bg-[#4f46e5]/10 text-[#818cf8] border-[#4f46e5]/25', dot: '#4f46e5' },
  noticed: { label: 'Noticed', badge: 'bg-[#9aa1ad]/10 text-[#b6bcc6] border-[#9aa1ad]/25', dot: '#9aa1ad' },
  resolved: { label: 'Resolved', badge: 'bg-[#8fae8b]/10 text-[#a8c3a3] border-[#8fae8b]/25', dot: '#8fae8b' },
  escalated: { label: 'Escalated', badge: 'bg-[#c17b6a]/10 text-[#d4988a] border-[#c17b6a]/25', dot: '#c17b6a' },
}

export const STATUS_ORDER = ['open', 'noticed', 'resolved', 'escalated']

export const PRIORITY_CONFIG = {
  low: { label: 'Low', badge: 'bg-[#9a948a]/10 text-[#b8b1a5] border-[#9a948a]/25', dot: '#9a948a' },
  medium: { label: 'Medium', badge: 'bg-[#4f46e5]/10 text-[#818cf8] border-[#4f46e5]/25', dot: '#4f46e5' },
  high: { label: 'High', badge: 'bg-[#c17b6a]/10 text-[#d4988a] border-[#c17b6a]/25', dot: '#c17b6a' },
}

export const NOTICE_LEVELS = [
  'None',
  'Courtesy Notice',
  'First Notice',
  'Second Notice',
  'Final Notice',
  'Hearing / Legal',
]

export const CHART_COLORS = ['#4f46e5', '#8fae8b', '#c17b6a', '#9aa1ad', '#b89b8e', '#a9b18f', '#818cf8', '#8c8f9a', '#bfa6a0', '#7e8a7c']
