import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  LayoutDashboard, Users, CalendarCheck, FileText, Star,
  Building2, BarChart3, QrCode, Clock, Upload, Award, Calendar,
  Shield, ChevronLeft, LogOut, X, User, Briefcase, GraduationCap
} from 'lucide-react';

const adminNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/interns', icon: Users, label: 'Interns' },
  { to: '/admin/supervisors', icon: Briefcase, label: 'Supervisors' },
  { to: '/admin/attendance', icon: CalendarCheck, label: 'Attendance' },
  { to: '/admin/dtr', icon: Clock, label: 'Intern DTRs' },
  { to: '/admin/documents', icon: FileText, label: 'Documents' },
  { to: '/admin/evaluations', icon: Star, label: 'Evaluations' },
  { to: '/admin/departments', icon: Building2, label: 'Departments' },
  { to: '/admin/schools', icon: GraduationCap, label: 'Schools' },
  { to: '/admin/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { to: '/admin/profile', icon: User, label: 'My Profile' },
];

const internNav = [
  { to: '/intern', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/intern/scan', icon: QrCode, label: 'Scan QR Attendance' },
  { to: '/intern/dtr', icon: Clock, label: 'My DTR' },
  { to: '/intern/documents', icon: Upload, label: 'Documents' },
  { to: '/intern/evaluation', icon: Award, label: 'Evaluation' },
  { to: '/intern/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/intern/profile', icon: User, label: 'My Profile' },
];

const supervisorNav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/interns', icon: Users, label: 'Interns' },
  { to: '/admin/attendance', icon: CalendarCheck, label: 'Attendance' },
  { to: '/admin/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/admin/documents', icon: FileText, label: 'Documents' },
  { to: '/admin/evaluations', icon: Star, label: 'Evaluations' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { to: '/admin/profile', icon: User, label: 'My Profile' },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = user?.role === 'admin' ? adminNav : user?.role === 'supervisor' ? supervisorNav : internNav;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (user?.full_name || user?.username || 'U')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''} lg:translate-x-0`}>
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-amber-400 overflow-hidden flex items-center justify-center">
            <img src="/ITMS_LOGO.png" alt="ITMS Logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>PNP-ITMS</p>
            <p className="text-blue-300 text-xs truncate">Internship System</p>
          </div>
          <button className="lg:hidden ml-auto text-white/60 hover:text-white" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User card */}
        <div className="p-4">
          <div className="glass-dark rounded-xl p-3 flex items-center gap-3">
            <div className="avatar-placeholder w-9 h-9 text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">{user?.full_name || user?.username}</p>
              <p className="text-blue-300 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          <p className="text-blue-400 text-xs font-bold uppercase tracking-widest px-4 mb-2">
            {user?.role === 'admin' ? 'Administration' : user?.role === 'supervisor' ? 'Supervision' : 'My Internship'}
          </p>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="nav-item w-full text-red-300 hover:text-red-200 hover:bg-red-900/30"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Sign Out</span>
          </button>
          <p className="text-center text-blue-400/50 text-xs mt-3">v1.0.0</p>
        </div>
      </aside>
    </>
  );
}
