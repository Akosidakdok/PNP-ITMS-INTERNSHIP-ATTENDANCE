import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="main-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="content-area">
        <Navbar onMenuClick={() => setSidebarOpen(v => !v)} />
        <main className="page-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
