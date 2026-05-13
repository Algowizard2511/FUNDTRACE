import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import {
  LayoutDashboard, Activity, GitBranch, Bell, Search, Shield,
  Users, LogOut, Wifi, WifiOff, Menu, X, AlertTriangle, Zap, MapPin
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/transactions', icon: Activity, label: 'Live Transactions' },
  { path: '/graph', icon: GitBranch, label: 'Fund Flow Graph' },
  { path: '/alerts', icon: Bell, label: 'Alert Center' },
  { path: '/investigations', icon: Search, label: 'Investigations' },
  { path: '/accounts', icon: Users, label: 'Accounts' },
  { path: '/geomap', icon: MapPin, label: 'Geo Intel Map' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { connected, liveAlerts } = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const openAlerts = liveAlerts.filter(a => a.status === 'OPEN' || !a.status).length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#060b14' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col transition-all duration-300"
        style={{
          width: sidebarOpen ? '240px' : '64px',
          background: '#0d1b2a',
          borderRight: '1px solid #1a3a52',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid #1a3a52', minHeight: '64px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Shield size={20} color="#fff" />
          </div>
          {sidebarOpen && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.02em' }}>FundTrace</div>
              <div style={{ fontSize: 10, color: '#00d4ff', letterSpacing: '0.1em', fontWeight: 600 }}>AI FRAUD INTEL</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              title={!sidebarOpen ? label : ''}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Icon size={18} />
                {path === '/alerts' && openAlerts > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    background: '#ef4444', borderRadius: '50%',
                    width: 14, height: 14, fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                  }}>{Math.min(openAlerts, 9)}</span>
                )}
              </div>
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User + status */}
        <div style={{ borderTop: '1px solid #1a3a52', padding: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '8px 10px', borderRadius: 8, background: 'rgba(0,212,255,0.05)'
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00d4ff33, #7c3aed33)',
              border: '1px solid #1a3a52',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#00d4ff', flexShrink: 0
            }}>
              {user?.name?.[0] || 'A'}
            </div>
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <div style={{ fontSize: 10, color: '#475569' }}>{user?.role}</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', marginBottom: 6 }}>
            {connected
              ? <><Wifi size={12} color="#10b981" />{sidebarOpen && <span style={{ fontSize: 11, color: '#10b981' }}>Live Stream Active</span>}</>
              : <><WifiOff size={12} color="#ef4444" />{sidebarOpen && <span style={{ fontSize: 11, color: '#ef4444' }}>Disconnected</span>}</>
            }
          </div>

          <button
            onClick={logout}
            className="sidebar-link w-full"
            style={{ width: '100%', background: 'none', color: '#64748b' }}
          >
            <LogOut size={16} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'absolute', top: 20, left: sidebarOpen ? 220 : 44,
            width: 24, height: 24, borderRadius: '50%',
            background: '#1a3a52', border: '1px solid #2a4a62',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#64748b', transition: 'left 0.3s', zIndex: 10
          }}
        >
          {sidebarOpen ? <X size={12} /> : <Menu size={12} />}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto cyber-grid">
        <Outlet />
      </main>
    </div>
  );
}
