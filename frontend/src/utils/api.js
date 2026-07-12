// ─── MOCK API — no backend required ─────────────────────────────────────────
// All api.get / api.post / api.patch / api.put / api.delete calls are
// intercepted here and return realistic demo data.

const delay = (ms = 300) => new Promise(r => setTimeout(r, ms));

// ── Shared demo data ──────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { id: 1, name: 'Information Technology', head: 'Lt. Santos', intern_count: 5, description: 'IT Division' },
  { id: 2, name: 'Communications',         head: 'Sgt. Reyes',  intern_count: 3, description: 'Communications Division' },
  { id: 3, name: 'Records Management',     head: 'Cpl. Cruz',   intern_count: 4, description: 'Records Division' },
];

const INTERNS = [
  { id: 1, full_name: 'Juan dela Cruz',    username: 'juan',    school: 'PLM',  course: 'BSIT',  department_id: 1, department_name: 'Information Technology', required_hours: 486, rendered_hours: 210.5, status: 'active', start_date: '2026-06-01', end_date: '2026-08-31', email: 'juan@plm.edu.ph' },
  { id: 2, full_name: 'Maria Santos',      username: 'maria',   school: 'UST',  course: 'BSCS',  department_id: 2, department_name: 'Communications',         required_hours: 486, rendered_hours: 320.0, status: 'active', start_date: '2026-06-01', end_date: '2026-08-31', email: 'maria@ust.edu.ph' },
  { id: 3, full_name: 'Pedro Reyes',       username: 'pedro',   school: 'FEU',  course: 'BSECE', department_id: 1, department_name: 'Information Technology', required_hours: 486, rendered_hours: 486.0, status: 'completed', start_date: '2026-01-01', end_date: '2026-05-31', email: 'pedro@feu.edu.ph' },
  { id: 4, full_name: 'Ana Gonzales',      username: 'ana',     school: 'DLSU', course: 'BSIT',  department_id: 3, department_name: 'Records Management',     required_hours: 486, rendered_hours: 50.0,  status: 'active', start_date: '2026-07-01', end_date: '2026-09-30', email: 'ana@dlsu.edu.ph' },
];

const now = new Date();
const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const daysAgo = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return fmt(d); };
const today = now.toISOString().slice(0, 10);

const ATTENDANCE_LOGS = [
  { id: 1, intern_id: 1, full_name: 'Juan dela Cruz',  department_name: 'IT', scan_type: 'time_in',  scan_time: daysAgo(0) + ' 08:02:00', approval_status: 'pending',  remarks: '' },
  { id: 2, intern_id: 2, full_name: 'Maria Santos',    department_name: 'Communications', scan_type: 'time_in', scan_time: daysAgo(0) + ' 07:55:00', approval_status: 'approved', remarks: 'On time' },
  { id: 3, intern_id: 1, full_name: 'Juan dela Cruz',  department_name: 'IT', scan_type: 'time_out', scan_time: daysAgo(0) + ' 17:03:00', approval_status: 'pending',  remarks: '' },
  { id: 4, intern_id: 3, full_name: 'Pedro Reyes',     department_name: 'IT', scan_type: 'time_in',  scan_time: daysAgo(1) + ' 08:10:00', approval_status: 'approved', remarks: '' },
  { id: 5, intern_id: 4, full_name: 'Ana Gonzales',    department_name: 'Records', scan_type: 'time_in', scan_time: daysAgo(1) + ' 08:30:00', approval_status: 'rejected', remarks: 'Late arrival' },
];

const DTR_RECORDS = [
  { id: 1, intern_id: 1, date: today,               time_in: '08:02', time_out: '17:03', total_hours: 8.5,  approval_status: 'pending' },
  { id: 2, intern_id: 1, date: daysAgo(1).slice(0,10), time_in: '07:58', time_out: '17:00', total_hours: 8.0,  approval_status: 'approved' },
  { id: 3, intern_id: 1, date: daysAgo(2).slice(0,10), time_in: '08:05', time_out: '17:10', total_hours: 8.1,  approval_status: 'approved' },
  { id: 4, intern_id: 1, date: daysAgo(3).slice(0,10), time_in: '08:00', time_out: '17:00', total_hours: 8.0,  approval_status: 'approved' },
  { id: 5, intern_id: 1, date: daysAgo(4).slice(0,10), time_in: '08:15', time_out: '17:05', total_hours: 7.8,  approval_status: 'approved' },
];

const DOCUMENTS = [
  { id: 1, intern_id: 1, full_name: 'Juan dela Cruz', document_type: 'MOA',              file_url: '#', status: 'pending',  uploaded_at: daysAgo(2) },
  { id: 2, intern_id: 2, full_name: 'Maria Santos',   document_type: 'Endorsement Letter', file_url: '#', status: 'approved', uploaded_at: daysAgo(5) },
  { id: 3, intern_id: 1, full_name: 'Juan dela Cruz', document_type: 'Daily Time Record', file_url: '#', status: 'pending',  uploaded_at: daysAgo(1) },
  { id: 4, intern_id: 3, full_name: 'Pedro Reyes',    document_type: 'Certificate',      file_url: '#', status: 'approved', uploaded_at: daysAgo(10) },
];

const EVALUATIONS = [
  { id: 1, intern_id: 1, full_name: 'Juan dela Cruz', department_name: 'IT', overall_rating: 4.5, technical_skills: 4, communication: 5, punctuality: 4, initiative: 5, teamwork: 4, remarks: 'Excellent performance', created_at: daysAgo(5) },
  { id: 2, intern_id: 2, full_name: 'Maria Santos',   department_name: 'Communications', overall_rating: 4.0, technical_skills: 4, communication: 4, punctuality: 4, initiative: 4, teamwork: 4, remarks: 'Good progress', created_at: daysAgo(3) },
];

const NOTIFICATIONS = [
  { id: 1, title: 'Attendance Approved', message: 'Your time-in for today has been approved.', is_read: 0, created_at: daysAgo(0) },
  { id: 2, title: 'Document Received',   message: 'Your MOA has been received and is under review.', is_read: 0, created_at: daysAgo(1) },
  { id: 3, title: 'Welcome!',            message: 'Welcome to PNP-ITMS Internship System.', is_read: 1, created_at: daysAgo(3) },
];

// ── Route matcher ─────────────────────────────────────────────────────────────
function mockResponse(data) {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} };
}

async function handleRequest(method, url, payload) {
  await delay(250);
  const u = url.replace(/\?.*$/, ''); // strip query string for matching

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (u === '/auth/login')  return mockResponse({ token: 'mock-token', user: { id: 1, username: payload?.username || 'admin', full_name: 'Demo Admin', role: 'admin' } });
  if (u === '/auth/me')     return mockResponse({ user: { id: 1, username: 'admin', full_name: 'Demo Admin', role: 'admin' } });
  if (u === '/auth/logout') return mockResponse({ success: true });

  // ── Admin dashboard ───────────────────────────────────────────────────────
  if (u === '/admin/dashboard-stats') return mockResponse({
    stats: { total_interns: INTERNS.length, present_today: 2, pending_attendance: 2, approved_today: 1, total_departments: DEPARTMENTS.length, pending_documents: 2 },
    recentAttendance: ATTENDANCE_LOGS.slice(0, 5),
    recentDocuments:  DOCUMENTS.slice(0, 3),
  });

  // ── Interns ───────────────────────────────────────────────────────────────
  if (u === '/interns' && method === 'GET') return mockResponse({ interns: INTERNS, total: INTERNS.length });
  if (u.match(/^\/interns\/\d+$/) && method === 'GET') {
    const id = parseInt(u.split('/')[2]);
    return mockResponse({ intern: INTERNS.find(i => i.id === id) || INTERNS[0] });
  }
  if (u === '/interns/me/profile' && method === 'GET') return mockResponse({ intern: INTERNS[0] });
  if (u === '/interns/me/profile' && (method === 'PUT' || method === 'PATCH')) return mockResponse({ intern: { ...INTERNS[0], ...payload } });
  if (u === '/interns' && method === 'POST') return mockResponse({ intern: { id: 99, ...payload } });
  if (u.match(/^\/interns\/\d+$/) && (method === 'PUT' || method === 'PATCH')) return mockResponse({ intern: { ...INTERNS[0], ...payload } });
  if (u.match(/^\/interns\/\d+$/) && method === 'DELETE') return mockResponse({ success: true });
  if (u.match(/^\/interns\/\d+\/reset-password$/)) return mockResponse({ success: true });
  if (u.match(/^\/interns\/\d+\/photo$/)) return mockResponse({ photo_url: '/demo-photo.jpg' });

  // ── Attendance ────────────────────────────────────────────────────────────
  if (u === '/attendance/logs') return mockResponse({ logs: ATTENDANCE_LOGS, total: ATTENDANCE_LOGS.length });
  if (u.match(/^\/attendance\/\d+\/(approve|reject)$/)) return mockResponse({ success: true });
  if (u === '/attendance/scan') return mockResponse({ success: true, message: 'Attendance recorded successfully', scan_type: 'time_in' });

  // ── DTR ───────────────────────────────────────────────────────────────────
  if (u === '/dtr') return mockResponse({ records: DTR_RECORDS, total: DTR_RECORDS.length });
  if (u.match(/^\/dtr\/\d+$/)) return mockResponse({ record: DTR_RECORDS[0] });

  // ── Documents ─────────────────────────────────────────────────────────────
  if (u === '/documents' && method === 'GET') return mockResponse({ documents: DOCUMENTS, total: DOCUMENTS.length });
  if (u === '/documents/my') return mockResponse({ documents: DOCUMENTS.filter(d => d.intern_id === 1) });
  if (u.match(/^\/documents\/\d+\/(approve|reject)$/)) return mockResponse({ success: true });
  if (u === '/documents' && method === 'POST') return mockResponse({ document: { id: 99, ...payload, status: 'pending', uploaded_at: fmt(now) } });
  if (u.match(/^\/documents\/\d+$/) && method === 'DELETE') return mockResponse({ success: true });
  if (u === '/documents/upload' && method === 'POST') return mockResponse({ document: { id: 99, document_type: 'Uploaded', status: 'pending', uploaded_at: fmt(now) } });
  if (u.match(/^\/documents\/\d+\/status$/)) return mockResponse({ success: true });

  // ── Evaluations ───────────────────────────────────────────────────────────
  if (u === '/evaluations' && method === 'GET') return mockResponse({ evaluations: EVALUATIONS, total: EVALUATIONS.length });
  if (u === '/evaluations/my') return mockResponse({ evaluation: EVALUATIONS[0] });
  if (u === '/evaluations' && method === 'POST') return mockResponse({ evaluation: { id: 99, ...payload } });
  if (u.match(/^\/evaluations\/\d+$/) && method === 'PUT') return mockResponse({ evaluation: { ...EVALUATIONS[0], ...payload } });

  // ── Departments ───────────────────────────────────────────────────────────
  if (u === '/departments' && method === 'GET') return mockResponse({ departments: DEPARTMENTS, total: DEPARTMENTS.length });
  if (u === '/departments' && method === 'POST') return mockResponse({ department: { id: 99, ...payload } });
  if (u.match(/^\/departments\/\d+$/) && method === 'PUT') return mockResponse({ department: { ...DEPARTMENTS[0], ...payload } });
  if (u.match(/^\/departments\/\d+$/) && method === 'DELETE') return mockResponse({ success: true });

  // ── Reports ───────────────────────────────────────────────────────────────
  if (u === '/reports/attendance' || u === '/admin/reports/attendance') return mockResponse({ report: INTERNS.map(i => ({ full_name: i.full_name, school: i.school, department_name: i.department_name, days_present: 18, total_hours: i.rendered_hours, required_hours: i.required_hours, rendered_hours: i.rendered_hours })) });
  if (u === '/reports/interns')    return mockResponse({ interns: INTERNS, total: INTERNS.length });
  if (u === '/reports/summary')    return mockResponse({ summary: { total_hours: 1200, avg_hours: 300, completion_rate: 65 } });

  // ── Profile ───────────────────────────────────────────────────────────────
  if (u === '/profile' && method === 'PUT') return mockResponse({ user: { ...INTERNS[0], ...payload } });
  if (u === '/profile/change-password' || u === '/auth/change-password') return mockResponse({ success: true });

  // ── Notifications ─────────────────────────────────────────────────────────
  if (u === '/notifications') return mockResponse({ notifications: NOTIFICATIONS, unread_count: NOTIFICATIONS.filter(n => !n.is_read).length });
  if (u.match(/^\/notifications\/\d+\/read$/)) return mockResponse({ success: true });
  if (u === '/notifications/read-all') return mockResponse({ success: true });

  // ── QR ────────────────────────────────────────────────────────────────────
  if (u === '/qr/current') return mockResponse({ qr_code: 'DEMO-QR-' + today, expires_at: fmt(new Date(now.getTime() + 3600000)) });

  // ── Fallback ──────────────────────────────────────────────────────────────
  console.warn('[Mock API] Unhandled:', method, url);
  return mockResponse({});
}

// ── Public api object (mirrors axios interface) ───────────────────────────────
const api = {
  get:    (url, config)        => handleRequest('GET',    url, config?.params),
  post:   (url, data, config)  => handleRequest('POST',   url, data),
  put:    (url, data, config)  => handleRequest('PUT',    url, data),
  patch:  (url, data, config)  => handleRequest('PATCH',  url, data),
  delete: (url, config)        => handleRequest('DELETE', url, null),
};

export default api;
