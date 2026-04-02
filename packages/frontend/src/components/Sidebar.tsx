import React from 'react';
import { Code2, Database, GitBranch } from 'lucide-react';

export function Sidebar() {
  return (
    <aside 
      className="w-[80px] flex flex-col shrink-0"
      style={{ background: 'var(--color-bg-app)' }}
    >
      <nav 
        className="flex flex-col items-center gap-4 p-2 rounded-[var(--radius-lg)] bg-[#111111] shadow-2xl"
      >
        <SidebarIcon icon={<Code2 size={24} />} active />
        <SidebarIcon icon={<Database size={24} />} />
        <SidebarIcon icon={<GitBranch size={24} />} />
      </nav>
    </aside>
  );
}

function SidebarIcon({ icon, active = false }: { icon: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={`w-14 h-14 rounded-[22px] transition-all duration-200 flex items-center justify-center ${
        active 
          ? 'bg-[#1A1A1A] text-white shadow-lg' 
          : 'text-[#444444] hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
    </button>
  );
}
