import { useState } from 'react';
import { type ReviewReplayEvent, describeReviewEvent } from '../lib/review-replay.js';

const EVENT_COLOR: Record<string, string> = {
  message: 'var(--color-brand)',
  agent_response: 'var(--color-brand-green)',
  code_change: 'var(--color-status-warning)',
};

interface TimelineProps {
  events: ReviewReplayEvent[];
  selectedEventIndex: number;
  onSelectEvent: (index: number) => void;
  markerIndices?: number[];
}

export function Timeline({ events, selectedEventIndex, onSelectEvent, markerIndices = [] }: TimelineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (events.length === 0) return null;

  return (
    <div className="flex w-full items-end gap-px" style={{ height: '32px' }}>
      {events.map((event, index) => {
        const isSelected = index === selectedEventIndex;
        const isHovered = hoveredIndex === index;
        const isMarker = markerIndices.includes(index);
        const accentColor = EVENT_COLOR[event.type];

        let barHeight: string;
        let barBg: string;

        if (isSelected) {
          barHeight = '100%';
          barBg = accentColor ?? 'var(--color-brand)';
        } else if (isHovered) {
          barHeight = '75%';
          barBg = accentColor ? accentColor : 'rgba(255,255,255,0.4)';
        } else if (isMarker) {
          barHeight = '40%';
          barBg = 'var(--color-brand)';
        } else {
          barHeight = '20%';
          barBg = 'rgba(255,255,255,0.12)';
        }

        return (
          <div
            key={`${event.timestamp}-${index}`}
            data-testid={`timeline-event-${index}`}
            className="group relative flex-1"
            style={{ height: '100%', minWidth: '2px', cursor: 'pointer' }}
            onClick={() => onSelectEvent(index)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {isMarker && !isSelected && !isHovered && (
              <div 
                className="absolute top-0 left-1/2 w-1 h-1 -translate-x-1/2 rounded-full"
                style={{ background: 'var(--color-brand)' }}
              />
            )}
            {/* Tooltip */}
            {isHovered && (
              <div
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap"
                style={{ fontSize: '10px' }}
              >
                <div
                  className="rounded-xl px-2 py-1 text-white shadow-xl"
                  style={{ background: '#111' }}
                >
                  {describeReviewEvent(event)}
                </div>
              </div>
            )}

            {/* Bar */}
            <div
              className="absolute bottom-0 w-full"
              style={{
                height: barHeight,
                background: barBg,
                transition: 'height 80ms ease, background 80ms ease',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
