'use client';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { href: '/busqueda', label: 'Búsqueda de Leads', icon: '🔍' },
  { href: '/mis-leads', label: 'Mis Leads', icon: '👥' },
  { href: '/marketing', label: 'Marketing', icon: '📧' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Prospec<span>tos</span></h1>
        <p>Lead Generation & Marketing</p>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.href}
            className={`nav-item ${pathname.startsWith(item.href) ? 'active' : ''}`}
            onClick={() => router.push(item.href)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>v1.0 · Powered by Scrapling</p>
      </div>
    </aside>
  );
}
