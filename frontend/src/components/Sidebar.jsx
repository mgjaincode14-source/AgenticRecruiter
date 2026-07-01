import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Sparkles, Settings2, Menu, X } from 'lucide-react';

const navItems = [
  { name: 'Dashboard',          icon: LayoutDashboard, path: '/' },
  { name: 'Job Description',    icon: FileText,         path: '/jd' },
  { name: 'Candidates',         icon: Users,            path: '/candidates' },
  { name: 'Interview Settings', icon: Settings2,        path: '/interview-settings' },
];

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div
      className="flex flex-col h-full"
      style={{ background: '#121212', borderRight: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Logo */}
      <div className="p-6 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1DB954,#158a3e)' }}
        >
          <Sparkles className="w-5 h-5 text-black" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-white">AgenticATS</h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 transform hover:translate-x-1 ${
                  isActive
                    ? 'text-black font-bold'
                    : 'text-[#b3b3b3] hover:text-white hover:bg-white/5'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: '#1DB954', color: '#000' }
                  : {}
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer agent badge */}
      <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div
          className="flex items-center gap-3 p-3 rounded-xl transition-all duration-300 cursor-pointer hover:scale-[1.02]"
          style={{ background: 'rgba(255,255,255,0.04)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(29,185,84,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-black text-black text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1DB954,#158a3e)' }}
          >
            AI
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Hiring Agent</p>
            <p className="text-xs font-medium flex items-center gap-1.5 mt-0.5" style={{ color: '#1DB954' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse inline-block" />
              Online
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 lg:w-72 flex-shrink-0 h-screen">
        <div className="w-full">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile hamburger button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: '#1DB954', color: '#000' }}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed top-0 left-0 h-full w-72 z-40 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </div>
    </>
  );
};

export default Sidebar;
