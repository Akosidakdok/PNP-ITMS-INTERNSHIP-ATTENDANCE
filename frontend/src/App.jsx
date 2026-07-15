import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import Layout from './components/layout/Layout.jsx';

// Auth pages
import Login from './pages/auth/Login.jsx';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import InternManagement from './pages/admin/InternManagement.jsx';
import AttendanceApproval from './pages/admin/AttendanceApproval.jsx';
import DocumentReview from './pages/admin/DocumentReview.jsx';
import PerformanceEval from './pages/admin/PerformanceEval.jsx';
import Departments from './pages/admin/Departments.jsx';
import Reports from './pages/admin/Reports.jsx';

// Intern pages
import InternDashboard from './pages/intern/InternDashboard.jsx';
import ScanAttendance from './pages/intern/ScanAttendance.jsx';
import MyDTR from './pages/intern/MyDTR.jsx';
import MyDocuments from './pages/intern/MyDocuments.jsx';
import MyEvaluation from './pages/intern/MyEvaluation.jsx';
import Profile from './pages/Profile.jsx';

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
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #001240 0%, #003087 100%)' }}>
      <div className="text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full border-4 border-white border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-white font-medium text-lg">Loading PNP-ITMS...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={getHomePath(user.role)} replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getHomePath(user.role)} replace /> : <Login />} />

      {/* Admin & Supervisor Routes */}
      <Route path="/admin" element={<ProtectedRoute roles={['admin', 'supervisor']}><Layout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="interns" element={<InternManagement />} />
        <Route path="attendance" element={<AttendanceApproval />} />
        <Route path="documents" element={<DocumentReview />} />
        <Route path="evaluations" element={<PerformanceEvalWrapper />} />
        <Route path="departments" element={<Departments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<Profile role="admin" />} />
      </Route>

      {/* Intern Routes */}
      <Route path="/intern" element={<ProtectedRoute roles={['intern']}><Layout /></ProtectedRoute>}>
        <Route index element={<InternDashboard />} />
        <Route path="scan" element={<ScanAttendance />} />
        <Route path="dtr" element={<MyDTR />} />
        <Route path="documents" element={<MyDocuments />} />
        <Route path="evaluation" element={<MyEvaluation />} />
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
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { borderRadius: '10px', fontFamily: 'Inter, sans-serif', fontSize: '14px' },
              success: { style: { background: '#dcfce7', color: '#14532d', border: '1px solid #86efac' } },
              error: { style: { background: '#fee2e2', color: '#7f1d1d', border: '1px solid #fca5a5' } },
            }}
          />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
