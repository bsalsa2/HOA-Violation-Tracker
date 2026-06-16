import axios from 'axios'

const API_BASE = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authAPI = {
  register: (email, password) => api.post('/auth/register', { email, password }),
  login: (email, password) => api.post('/auth/login', { email, password }),
}

export const hoaAPI = {
  create: (name, address) => api.post('/hoas', { name, address }),
  getAll: () => api.get('/hoas'),
}

export const residentAPI = {
  create: (hoaId, name, unit, email, phone) =>
    api.post(`/residents/${hoaId}`, { name, unit, email, phone }),
  getByHOA: (hoaId) => api.get(`/residents/${hoaId}`),
}

export const violationAPI = {
  create: (hoaId, residentId, violationType, description) =>
    api.post(`/violations/${hoaId}`, { resident_id: residentId, violation_type: violationType, description }),
  getByHOA: (hoaId) => api.get(`/violations/${hoaId}`),
  getLetter: (violationId) => api.get(`/violations/${violationId}/letter`),
  updateStatus: (violationId, status) => api.patch(`/violations/${violationId}`, { status }),
}

export default api
