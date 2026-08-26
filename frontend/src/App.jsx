import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import Layout from './components/layout/Layout.jsx';
import InstallPrompt from './components/pwa/InstallPrompt.jsx';
import SystemLoader from './components/common/SystemLoader.jsx';
import LegalDocuments from './pages/legal/LegalDocuments.jsx';
import LegalAcceptance from './pages/legal/LegalAcceptance.jsx';

// Auth pages
import Login from './pages/auth/Login.jsx';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import SupervisorDashboard from './SupervisorDashboard.jsx';
import InternManagement from './pages/admin/InternManagement.jsx';
import SupervisorManagement from './pages/admin/SupervisorManagement.jsx';
import AttendanceApproval from './pages/admin/AttendanceApproval.jsx';
import DocumentReview from './pages/admin/DocumentReview.jsx';
import PerformanceEval from './pages/admin/PerformanceEval.jsx';
import Divisions from './pages/admin/Divisions.jsx';
import Schools from './pages/admin/Schools.jsx';
import Reports from './pages/admin/Reports.jsx';
import AdminCalendar from './pages/admin/Calendar.jsx';
import AdminDTRViewer from './pages/admin/AdminDTRViewer.jsx';
import ProjectDirectory from './pages/admin/ProjectDirectory.jsx';

// Intern pages
import InternDashboard from './pages/intern/InternDashboard.jsx';
import ScanAttendance from './pages/intern/ScanAttendance.jsx';
import MyDTR from './pages/intern/MyDTR.jsx';
import MyProjects from './pages/intern/MyProjects.jsx';
import MyDocuments from './pages/intern/MyDocuments.jsx';
import MyEvaluation from './pages/intern/MyEvaluation.jsx';
import Profile from './pages/Profile.jsx';
import InternCalendar from './pages/intern/Calendar.jsx';

function isAdminLike(role) {
  return role === 'admin' || role === 'supervisor';
}

function getHomePath(role) {
  if (isAdminLike(role)) return '/admin';
  return '/intern';
}

function PerformanceEvalWrapper() {
  const { user } = useAuth();
  return <PerformanceEval readOnly={user?.role === 'supervisor'} />;
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={getHomePath(user.role)} replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/legal" element={<LegalDocuments />} />
      <Route path="/login" element={user ? <Navigate to={getHomePath(user.role)} replace /> : <Login />} />

      {/* Admin & Supervisor Routes */}
      <Route path="/admin" element={<ProtectedRoute roles={['admin', 'supervisor']}><Layout /></ProtectedRoute>}>
        <Route 
          index 
          element={
            <ProtectedRoute roles={['admin', 'supervisor']}>
              {isAdminLike(user?.role) && user.role === 'supervisor' 
                ? <SupervisorDashboard /> 
                : <AdminDashboard />
              }
            </ProtectedRoute>
          } />
        <Route path="interns" element={<InternManagement />} />
        <Route path="supervisors" element={<ProtectedRoute roles={['admin']}><SupervisorManagement /></ProtectedRoute>} />
        <Route path="attendance" element={<AttendanceApproval />} />
        <Route path="documents" element={<DocumentReview />} />
        <Route path="evaluations" element={<PerformanceEvalWrapper />} />
        <Route path="calendar" element={<AdminCalendar />} />
        <Route path="divisions" element={<ProtectedRoute roles={['admin']}><Divisions /></ProtectedRoute>} />
        <Route path="departments" element={<Navigate to="/admin/divisions" replace />} />
        <Route path="schools" element={<ProtectedRoute roles={['admin']}><Schools /></ProtectedRoute>} />
        <Route path="reports" element={<Reports />} />
        <Route path="dtr" element={<AdminDTRViewer />} />
        <Route path="projects" element={<ProjectDirectory />} />
        <Route path="profile" element={<Profile role="admin" />} />
      </Route>

      {/* Intern Routes */}
      <Route path="/intern" element={<ProtectedRoute roles={['intern']}><Layout /></ProtectedRoute>}>
        <Route index element={<InternDashboard />} />
        <Route path="scan" element={<ScanAttendance />} />
        <Route path="dtr" element={<MyDTR />} />
        <Route path="projects" element={<MyProjects />} />
        <Route path="documents" element={<MyDocuments />} />
        <Route path="evaluation" element={<MyEvaluation />} />
        <Route path="calendar" element={<InternCalendar />} />
        <Route path="profile" element={<Profile role="intern" />} />
      </Route>

      <Route path="/" element={user ? <Navigate to={getHomePath(user.role)} replace /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppShell />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const { loading, user, legalStatus } = useAuth();
  const needsLegalAcceptance = Boolean(user && !loading && legalStatus?.required);

  return (
    <>
      {needsLegalAcceptance ? <LegalAcceptance /> : <AppRoutes />}
      <InstallPrompt />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: '10px', fontFamily: 'Inter, sans-serif', fontSize: '14px' },
          success: { style: { background: '#dcfce7', color: '#14532d', border: '1px solid #86efac' } },
          error: { style: { background: '#fee2e2', color: '#7f1d1d', border: '1px solid #fca5a5' } },
        }}
      />
      <SystemLoader systemLoading={loading} />
    </>
  );
}
