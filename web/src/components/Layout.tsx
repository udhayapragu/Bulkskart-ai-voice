import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loading } from './ui';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/suppliers', label: 'Supplier contacts' },
  { to: '/leads', label: 'Lead statuses' },
  { to: '/campaigns', label: 'AI campaigns' },
  { to: '/calls', label: 'Call history' },
  { to: '/voice-agent', label: 'Voice agent' },
  { to: '/languages', label: 'Languages' },
  { to: '/knowledge', label: 'Knowledge base' },
  { to: '/usage', label: 'Usage & cost' },
  { to: '/integrations', label: 'Integrations & health' },
];

export function ProtectedLayout() {
  const { email, loading, signOut } = useAuth();
  if (loading) return <div className="login"><Loading /></div>;
  if (!email) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>Bulkskart<br /><span className="muted" style={{ fontWeight: 500, fontSize: '0.8rem' }}>AI Voice Sales</span></span>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted" style={{ wordBreak: 'break-all' }}>{email}</div>
          <button className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
