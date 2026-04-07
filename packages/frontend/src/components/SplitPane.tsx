import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  initialPct?: number;
  minPct?: number;
  maxPct?: number;
  orientation?: 'horizontal' | 'vertical';
}

export function SplitPane({ 
  left, 
  right, 
  initialPct = 50, 
  minPct = 20, 
  maxPct = 80,
  orientation = 'horizontal' 
}: SplitPaneProps) {
  const [leftPct, setLeftPct] = useState(initialPct);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [orientation]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    let newPct: number;
    if (orientation === 'horizontal') {
      newPct = ((e.clientX - rect.left) / rect.width) * 100;
    } else {
      newPct = ((e.clientY - rect.top) / rect.height) * 100;
    }
    
    setLeftPct(Math.min(maxPct, Math.max(minPct, newPct)));
  }, [orientation, minPct, maxPct]);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Use window events for dragging to handle mouse leaving the container
  const onMouseDownHandler = () => {
    onMouseDown();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Cleanup window events on unmount if needed (though onMouseUp usually handles it)
  // For simplicity here, we'll just use the standard React event approach but with a transparent overlay or similar if needed.
  // Actually, let's stick to a robust approach:

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden gap-[5px] ${orientation === 'horizontal' ? 'flex-row' : 'flex-col'}`}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* First pane */}
      <div
        className="min-w-0 min-h-0 overflow-hidden rounded-[var(--assessment-radius-shell)] shadow-lg bg-[var(--color-bg-code)]"
        style={{
          flexBasis: `${leftPct}%`,
          flexShrink: 0,
          flexGrow: 0
        }}
      >
        {left}
      </div>

      {/* Second pane with resize handle */}
      <div
        className="relative min-w-0 min-h-0 flex-1 overflow-hidden rounded-[var(--assessment-radius-shell)] shadow-lg bg-[var(--color-bg-panel)]"
      >
        <div
          className={`absolute z-50 transition-colors hover:bg-white/10 ${
            orientation === 'horizontal' 
              ? '-left-[3px] top-0 bottom-0 w-[6px] cursor-col-resize' 
              : '-top-[3px] left-0 right-0 h-[6px] cursor-row-resize'
          }`}
          onMouseDown={onMouseDown}
          role="separator"
          aria-orientation={orientation}
          aria-label="Resize panels"
        />
        {right}
      </div>
    </div>
  );
}
