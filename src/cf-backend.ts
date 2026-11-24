// Backend bridge for the Workers deployment of HMS-FRONTEND.
export const API_BASE_URL = import.meta.env?.VITE_API_URL || ''

export const API_URL = () => API_BASE_URL

export const backendHandlers = {
  'GET /api/health': 'Return health JSON from workers.dev staging endpoint.',
  'GET /api/auth/demo-users': 'Not available yet (Backend Worker planned).',
}
