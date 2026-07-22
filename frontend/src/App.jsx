import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import Layout from './components/layout/Layout.jsx';
import InstallPrompt from './components/pwa/InstallPrompt.jsx';

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

// Intern pages
import InternDashboard from './pages/intern/InternDashboard.jsx';
import ScanAttendance from './pages/intern/ScanAttendance.jsx';
import MyDTR from './pages/intern/MyDTR.jsx';
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

function LoadingScreen() {
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlowLoad(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #001240 0%, #003087 100%)' }}>
      <div className="text-center animate-fade-in px-6">
        {/* Logo */}
        <img src="/ITMS_LOGO.png" alt="PNP-ITMS" className="w-20 h-20 object-contain mx-auto mb-5 rounded-2xl shadow-lg" />

        {/* Spinner */}
        <div className="w-12 h-12 rounded-full border-4 border-white/30 border-t-white animate-spin mx-auto mb-5" />

        {!slowLoad ? (
          <p className="text-white font-medium text-lg">Loading PNP-ITMS...</p>
        ) : (
          <div className="space-y-2">
            <p className="text-white font-semibold text-lg">Waking up server...</p>
            <p className="text-blue-200 text-sm max-w-xs mx-auto leading-relaxed">
              The server was sleeping due to inactivity. This usually takes <strong className="text-white">20–40 seconds</strong> on first load.
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {[0,1,2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-white/60"
                  style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
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
        <Route path="profile" element={<Profile role="admin" />} />
      </Route>

      {/* Intern Routes */}
      <Route path="/intern" element={<ProtectedRoute roles={['intern']}><Layout /></ProtectedRoute>}>
        <Route index element={<InternDashboard />} />
        <Route path="scan" element={<ScanAttendance />} />
        <Route path="dtr" element={<MyDTR />} />
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
          <AppRoutes />
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
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
