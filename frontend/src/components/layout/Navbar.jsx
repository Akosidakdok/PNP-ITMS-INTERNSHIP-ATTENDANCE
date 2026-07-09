import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Bell, Sun, Moon, Search, ChevronDown, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { formatDistanceToNow } from 'date-fns';

export default function Navbar({ onMenuClick }) {
  const { user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [darkMode, setDarkMode] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleDark = () => {
    setDarkMode(v => !v);
    document.documentElement.classList.toggle('dark');
  };

  const initials = (user?.full_name || user?.username || 'U')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="navbar">
      {/* Left */}
      <div className="flex items-center gap-3 flex-1">
        <button
          id="sidebar-toggle"
          className="btn btn-ghost btn-icon lg:hidden"
          onClick={onMenuClick}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden md:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent outline-none text-sm text-gray-600 placeholder-gray-400 w-full"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Dark Mode */}
        <button
          id="dark-mode-toggle"
          className="btn btn-ghost btn-icon"
          onClick={toggleDark}
          data-tooltip={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            id="notifications-btn"
            className="btn btn-ghost btn-icon relative"
            onClick={() => setNotifOpen(v => !v)}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 card animate-scale-in z-50 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-800">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No notifications yet
                  </div>
                ) : notifications.slice(0, 10).map(n => (
                  <div
                    key={n.id}
                    className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                    onClick={() => { markAsRead(n.id); setNotifOpen(false); }}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.is_read ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <Link to={`/${user?.role}/profile`} className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200 hover:opacity-85 transition-opacity cursor-pointer no-underline text-inherit">
          <div className="avatar-placeholder w-8 h-8 text-xs">{initials}</div>
          <div className="hidden md:block text-right">
            <p className="text-sm font-semibold text-gray-800 leading-tight">{user?.full_name || user?.username}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
