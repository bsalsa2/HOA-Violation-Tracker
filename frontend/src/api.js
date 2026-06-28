import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://hoa-violation-tracker-production.up.railway.app'

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
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (email, password) => api.post('/auth/register', { email, password }),
  login: (email, password) => api.post('/auth/login', { email, password }),
}

export const hoaAPI = {
  setup: (name, address) => api.post('/hoas/setup', { name, address }),
  getMe: () => api.get('/hoas/me'),
  update: (name, address) => api.patch('/hoas/me', { name, address }),
  getStats: () => api.get('/hoas/me/stats'),
  getAnalytics: () => api.get('/hoas/me/analytics'),
}

export const residentAPI = {
  create: (name, unit, email, phone) => api.post('/residents', { name, unit, email, phone }),
  getAll: () => api.get('/residents'),
  update: (residentId, name, unit, email, phone) =>
    api.patch(`/residents/${residentId}`, { name, unit, email, phone }),
  delete: (residentId) => api.delete(`/residents/${residentId}`),
  importCSV: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/residents/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const violationAPI = {
  create: (residentId, violationType, description, priority = 'medium', dueInDays = 14) =>
    api.post('/violations', {
      resident_id: residentId,
      violation_type: violationType,
      description,
      priority,
      due_in_days: dueInDays,
    }),
  getAll: (status) => (status ? api.get(`/violations?status=${status}`) : api.get('/violations')),
  getLetter: (violationId) => api.get(`/violations/${violationId}/letter`),
  markSent: (violationId) => api.post(`/violations/${violationId}/mark-sent`),
  update: (violationId, fields) => api.patch(`/violations/${violationId}`, fields),
  updateStatus: (violationId, status) => api.patch(`/violations/${violationId}`, { status }),
  escalate: (violationId) => api.post(`/violations/${violationId}/escalate`),
  getNotes: (violationId) => api.get(`/violations/${violationId}/notes`),
  addNote: (violationId, body) => api.post(`/violations/${violationId}/notes`, { body }),
  delete: (violationId) => api.delete(`/violations/${violationId}`),
}

export default api
