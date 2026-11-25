import axios from 'axios';

// All API calls go to the same-origin /api/* handlers served by the Worker.
// No localhost, no separate backend hostname, no placeholder domains.
const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach the real JWT issued by the Worker.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fidus_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: global error handler that preserves backend messages.
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred. Please try again.';
    return Promise.reject(new Error(message));
  }
);

/* ==========================================================================
   API Endpoints
   ========================================================================== */

export const authService = {
  register: (userData) => api.post('/auth/register', userData),
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

export const staffService = {
  // Invitation flow: admin creates invitation, invitee accepts with token.
  invite: (data) => api.post('/staff/invite', data),
  acceptInvitation: (data) => api.post('/staff/accept-invitation', data),
  // Public staff application (pending admin approval).
  apply: (data) => api.post('/staff/apply', data),
  // Staff auth.
  login: (credentials) => api.post('/staff/login', credentials),
  me: () => api.get('/staff/me'),
  // Admin-only: review applications.
  listApplications: () => api.get('/staff/applications'),
  approveApplication: (data) => api.post('/staff/applications/approve', data),
  rejectApplication: (data) => api.post('/staff/applications/reject', data),
  // Admin-only: list all users.
  listUsers: () => api.get('/users'),
};

export const doctorService = {
  getAll: (params) => api.get('/doctors', { params }),
  getById: (id) => api.get(`/doctors/${id}`),
  create: (data) => api.post('/doctors', data),
  update: (id, data) => api.put(`/doctors/${id}`, data),
  getSpecialties: () => api.get('/doctors/meta/specialties'),
};

export const patientService = {
  getAll: (params) => api.get('/patients', { params }),
  getById: (id) => api.get(`/patients/${id}`),
  getHistory: (id) => api.get(`/patients/${id}/history`),
  create: (data) => api.post('/patients', data),
  update: (id, data) => api.put(`/patients/${id}`, data),
};

export const appointmentService = {
  getAll: (params) => api.get('/appointments', { params }),
  getById: (id) => api.get(`/appointments/${id}`),
  getSlots: (doctorId, date) => api.get(`/appointments/slots/${doctorId}`, { params: { date } }),
  book: (data) => api.post('/appointments', data),
  update: (id, data) => api.put(`/appointments/${id}`, data),
};

export const prescriptionService = {
  getAll: (params) => api.get('/prescriptions', { params }),
  getById: (id) => api.get(`/prescriptions/${id}`),
  create: (data) => api.post('/prescriptions', data),
  verifyQr: (data) => api.post('/prescriptions/verify-qr', data),
  dispense: (id, data) => api.post(`/prescriptions/${id}/dispense`, data),
};

export const billingService = {
  getInvoices: (params) => api.get('/billing/invoices', { params }),
  getById: (id) => api.get(`/billing/invoices/${id}`),
  createInvoice: (data) => api.post('/billing/invoices', data),
  recordPayment: (id, data) => api.put(`/billing/invoices/${id}/pay`, data),
  getStats: () => api.get('/billing/stats'),
};

export const bedService = {
  getAll: (params) => api.get('/beds', { params }),
  allocate: (id, data) => api.put(`/beds/${id}/allocate`, data),
  discharge: (id) => api.put(`/beds/${id}/discharge`),
  getStats: () => api.get('/beds/stats'),
};

export const uploadService = {
  uploadFile: (formData) =>
    api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getFiles: (params) => api.get('/upload/files', { params }),
  deleteFile: (id) => api.delete(`/upload/files/${id}`),
};

export const dashboardService = {
  getStats: () => api.get('/dashboard/stats'),
};

export const chatbotService = {
  sendMessage: (data) => api.post('/chatbot/query', data),
};

export const emailService = {
  test: (data) => api.post('/email/test', data),
};

export const adminService = {
  overview: () => api.get('/admin/overview'),
  staff: () => api.get('/admin/staff'),
  invitations: () => api.get('/admin/invitations'),
  audit: () => api.get('/admin/audit'),
  updateStatus: (data) => api.post('/admin/users/status', data),
  assignRole: (data) => api.post('/admin/users/role', data),
  resetPassword: (email) => api.post('/admin/users/reset-password', { email }),
  bootstrapStatus: () => api.get('/admin/bootstrap/status'),
  bootstrapRequest: (email) => api.post('/admin/bootstrap/request', { email }),
  bootstrapVerify: (token) => api.post('/admin/bootstrap/verify', { token }),
};

export const notificationService = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.post('/notifications/read', { id }),
  markAllRead: () => api.post('/notifications/read-all', {}),
  preferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.post('/notifications/preferences', data),
  streamUrl: () => '/api/notifications/stream',
};

export const taskService = {
  list: () => api.get('/tasks'),
  updateStatus: (id, status) => api.post('/tasks/status', { id, status }),
};

// Patient portal: every call is scoped server-side to the signed-in patient.
export const patientPortalService = {
  overview: () => api.get('/patient/overview'),
  appointments: (params) => api.get('/patient/appointments', { params }),
  requestAppointment: (data) => api.post('/patient/appointments', data),
  cancelAppointment: (data) => api.post('/patient/appointments/cancel', data),
  prescriptions: (params) => api.get('/patient/prescriptions', { params }),
  reports: () => api.get('/patient/reports'),
  invoices: () => api.get('/patient/invoices'),
  profile: () => api.get('/patient/profile'),
  updateProfile: (data) => api.patch('/patient/profile', data),
  activity: (params) => api.get('/patient/activity', { params }),
  clinicians: () => api.get('/patient/clinicians'),
};

export const workflowService = {
  createAppointment: (data) => api.post('/workflows/appointments', data),
  updateAppointmentStatus: (data) => api.post('/workflows/appointments/status', data),
  dispensePrescription: (data) => api.post('/workflows/pharmacy/dispense', data),
  updateLabStatus: (data) => api.post('/workflows/lab/status', data),
  updateImagingStatus: (data) => api.post('/workflows/radiology/status', data),
  payments: () => api.get('/workflows/billing/payments'),
  recordPayment: (data) => api.post('/workflows/billing/payments', data),
  verifyPayment: (data) => api.post('/workflows/billing/payments/verify', data),
  listPatients: (q) => api.get(`/staff/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  appointments: () => api.get('/workflows/appointments'),
  consultations: () => api.get('/workflows/consultations'),
  prescriptions: () => api.get('/workflows/pharmacy/prescriptions'),
  labRequests: () => api.get('/workflows/lab/requests'),
  radiologyRequests: () => api.get('/workflows/radiology/requests'),
  invoices: () => api.get('/workflows/billing/invoices'),
  createConsultation: (data) => api.post('/workflows/consultations', data),
  createLabRequest: (data) => api.post('/workflows/lab/requests', data),
  completeLabResult: (data) => api.post('/workflows/lab/results', data),
  createRadiologyRequest: (data) => api.post('/workflows/radiology/requests', data),
  completeRadiologyReport: (data) => api.post('/workflows/radiology/reports', data),
  createPrescription: (data) => api.post('/workflows/pharmacy/prescriptions', data),
  createInvoice: (data) => api.post('/workflows/billing/invoices', data),
  departmentQueue: (department) => api.get(`/queues/department?department=${encodeURIComponent(department)}`),
  ops: () => api.get('/admin/notifications/ops'),
};

export const aiService = {
  analyzeScan: (formData) =>
    api.post('/ai/analyze-scan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  analyzeScanJson: (data) => api.post('/ai/analyze-scan', data),
};

export default api;
