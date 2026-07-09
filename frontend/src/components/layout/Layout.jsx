import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="main-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="content-area">
        <Navbar onMenuClick={() => setSidebarOpen(v => !v)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
