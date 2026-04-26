import React from 'react';
import { Code2, Database, Globe, Moon, Sun } from 'lucide-react';

export type WorkspaceSection = 'code' | 'database' | 'curl';

interface SidebarProps {
  activeSection: WorkspaceSection;
  onSelect: (section: WorkspaceSection) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Sidebar({ activeSection, onSelect, isDark, onToggleTheme }: SidebarProps) {
  return (
    <aside 
      className=" flex flex-col shrink-0"
      style={{ background: 'var(--color-bg-app)' }}
    >
      <nav 
        className="flex h-full w-full flex-col items-center gap-3 rounded-[var(--assessment-radius-shell)] p-2"
        style={{
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border-main)',
          boxShadow: 'var(--assessment-shadow-soft)',
        }}
      >
        <SidebarIcon
          icon={<Code2 size={24} />}
          label="Code"
          active={activeSection === 'code'}
          onClick={() => onSelect('code')}
        />
        <SidebarIcon
          icon={<Database size={24} />}
          label="Database"
          active={activeSection === 'database'}
          onClick={() => onSelect('database')}
        />
        <SidebarIcon
          icon={<Globe size={24} />}
          label="Curl"
          active={activeSection === 'curl'}
          onClick={() => onSelect('curl')}
        />

        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={onToggleTheme}
            data-testid="sidebar-theme-toggle"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-12 w-12 items-center justify-center rounded-[var(--assessment-radius-control)] text-[var(--color-text-dim)] transition-all duration-200 hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-main)]"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </nav>
    </aside>
  );
}

function SidebarIcon({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`h-12 w-12 rounded-[var(--assessment-radius-control)] transition-all duration-200 flex items-center justify-center ${
        active 
          ? 'text-[var(--color-text-bold)] shadow-lg' 
          : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-subtle)]'
      }`}
      style={active ? {
        background: 'var(--color-bg-active-node)',
        boxShadow: 'var(--assessment-shadow-panel)',
      } : undefined}
    >
      {icon}
    </button>
  );
}
