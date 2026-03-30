interface TabBarProps {
  tabs: string[];
  activeTab: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
}

export function TabBar({ tabs, activeTab, onTabSelect, onTabClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex items-stretch overflow-x-auto shrink-0"
      role="tablist"
      style={{ background: '#2d2d30', height: '35px', borderBottom: '1px solid #3c3c3c' }}
    >
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <div
            key={tab}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => onTabSelect(tab)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onTabSelect(tab);
            }}
            className="flex items-center gap-1.5 px-3 cursor-pointer text-xs shrink-0 group"
            style={{
              background: isActive ? '#1e1e1e' : 'transparent',
              color: isActive ? '#d4d4d4' : '#8a8a8a',
              borderRight: '1px solid #3c3c3c',
              borderTop: isActive ? '1px solid #007acc' : '1px solid transparent',
              minWidth: '80px',
              maxWidth: '160px',
            }}
          >
            <span className="truncate flex-1">{tab}</span>
            <button
              aria-label={`Close ${tab}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              style={{ color: '#8a8a8a', lineHeight: 1 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#d4d4d4'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8a8a8a'; }}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
