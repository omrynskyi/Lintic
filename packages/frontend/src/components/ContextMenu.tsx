import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust position if menu goes off screen
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 1000,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[160px] bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] transition-colors ${
            item.danger 
              ? 'text-red-400 hover:bg-red-500/10' 
              : 'text-white/80 hover:bg-white/5 hover:text-white'
          }`}
        >
          {item.icon && <span className="opacity-60">{item.icon}</span>}
          <span className="flex-1 text-left">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
