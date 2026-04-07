import { AnimatePresence, motion } from 'framer-motion';
import { File, X } from 'lucide-react';

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
      className="flex items-center gap-1 overflow-x-auto shrink-0 px-2"
      role="tablist"
      style={{ background: 'var(--color-bg-sidebar)', height: '48px' }}
    >
      <AnimatePresence initial={false}>
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const fileName = tab.split('/').pop() || tab;
          return (
            <motion.div
              key={tab}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabSelect(tab)}
              className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-[13px] shrink-0 rounded-xl transition-all group ${
                isActive 
                  ? 'bg-[var(--color-bg-tab)] text-[var(--color-text-bold)]' 
                  : 'text-[var(--color-text-dim)] hover:bg-white/5'
              }`}
            >
              <File 
                size={14} 
                className={isActive ? 'text-[var(--color-brand-yellow)]' : 'text-[var(--color-text-dim)]'} 
              />
              <span className={`truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{fileName}</span>
              <button
                type="button"
                aria-label={`Close ${tab}`}
                className={`ml-1 transition-opacity p-0.5 hover:bg-white/10 rounded ${
                  isActive ? 'opacity-40 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab);
                }}
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
