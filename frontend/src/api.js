import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://hoa-violation-tracker-k4lq.vercel.app'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Expired/invalid session → sign out. But a 401 from login itself just
    // means wrong credentials — reloading would wipe the error message.
    const isAuthCall = error.config?.url?.includes('/auth/')
    if (error.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('access_token')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (email, password, inviteCode) => api.post('/auth/register', { email, password, invite_code: inviteCode || null }),
  login: (email, password) => api.post('/auth/login', { email, password }),
  forgot: (email) => api.post('/auth/forgot', { email }),
  reset: (token, password) => api.post('/auth/reset', { token, password }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
}

export const adminAPI = {
  createInvite: (label) => api.post('/admin/invites', { label: label || null }),
  listInvites: () => api.get('/admin/invites'),
  revokeInvite: (id) => api.delete(`/admin/invites/${id}`),
}

export const hoaAPI = {
  list: () => api.get('/hoas'),
  create: (name, address, email) => api.post('/hoas', { name, address, email: email || null }),
  get: (hoaId) => api.get(`/hoas/${hoaId}`),
  update: (hoaId, name, address, email, phone, contactPersonName, website, businessHours) =>
    api.patch(`/hoas/${hoaId}`, {
      name, address, email, phone,
      contact_person_name: contactPersonName,
      website, business_hours: businessHours,
    }),
  delete: (hoaId) => api.delete(`/hoas/${hoaId}`),
  getStats: (hoaId) => api.get(`/hoas/${hoaId}/stats`),
  getAnalytics: (hoaId) => api.get(`/hoas/${hoaId}/analytics`),
  getActivity: (hoaId, limit = 15) => api.get(`/hoas/${hoaId}/activity?limit=${limit}`),
  seedDemo: (hoaId) => api.post(`/hoas/${hoaId}/seed-demo`),
}

export const residentAPI = {
  create: (hoaId, name, unit, email, phone) => api.post('/residents', { hoa_id: hoaId, name, unit, email, phone }),
  getAll: (hoaId, includeArchived = false) => api.get(`/residents?hoa_id=${hoaId}${includeArchived ? '&include_archived=true' : ''}`),
  restore: (residentId) => api.post(`/residents/${residentId}/restore`),
  update: (residentId, name, unit, email, phone) =>
    api.patch(`/residents/${residentId}`, { name, unit, email, phone }),
  delete: (residentId) => api.delete(`/residents/${residentId}`),
  importCSV: (hoaId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/residents/import/csv?hoa_id=${hoaId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const violationAPI = {
  create: (hoaId, residentId, violationType, description, priority = 'medium', dueInDays = 14) =>
    api.post('/violations', {
      hoa_id: hoaId,
      resident_id: residentId,
      violation_type: violationType,
      description,
      priority,
      due_in_days: dueInDays,
    }),
  getAll: (hoaId, status) =>
    api.get(`/violations?hoa_id=${hoaId}${status ? `&status=${status}` : ''}`),
  getLetter: (violationId) => api.get(`/violations/${violationId}/letter`),
  getLetterPdf: (violationId, version = 'draft') => api.get(`/violations/${violationId}/letter.pdf?version=${version}`, { responseType: 'blob' }),
  markSent: (violationId, letter) => api.post(`/violations/${violationId}/mark-sent`, letter ? { letter } : {}),
  sendNotice: (violationId) => api.post(`/violations/${violationId}/send-notice`),
  getFines: (violationId) => api.get(`/violations/${violationId}/fines`),
  addFine: (violationId, amount, kind, note) => api.post(`/violations/${violationId}/fines`, { amount, kind, note: note || null }),
  getPortalLink: (violationId) => api.get(`/violations/${violationId}/portal-link`),
  getCaseFile: (violationId) => api.get(`/violations/${violationId}/case-file.pdf`, { responseType: 'blob' }),
  update: (violationId, fields) => api.patch(`/violations/${violationId}`, fields),
  updateStatus: (violationId, status) => api.patch(`/violations/${violationId}`, { status }),
  escalate: (violationId) => api.post(`/violations/${violationId}/escalate`),
  getNotes: (violationId) => api.get(`/violations/${violationId}/notes`),
  addNote: (violationId, body) => api.post(`/violations/${violationId}/notes`, { body }),
  delete: (violationId) => api.delete(`/violations/${violationId}`),
  getPhotos: (violationId) => api.get(`/violations/${violationId}/photos`),
  addPhoto: (violationId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/violations/${violationId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deletePhoto: (violationId, photoId) => api.delete(`/violations/${violationId}/photos/${photoId}`),
  importCSV: (hoaId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/violations/import/csv?hoa_id=${hoaId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// Public, token-authenticated resident portal (no account required)
export const portalAPI = {
  getCase: (token) => api.get(`/portal/${token}`),
  respond: (token, kind, message) => api.post(`/portal/${token}/respond`, { kind, message }),
}

export default api
