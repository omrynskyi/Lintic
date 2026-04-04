import { motion } from 'framer-motion';
import { type ReviewReplayEvent, describeReviewEvent } from '../lib/review-replay.js';

interface TimelineProps {
  events: ReviewReplayEvent[];
  selectedEventIndex: number;
  onSelectEvent: (index: number) => void;
}

export function Timeline({ events, selectedEventIndex, onSelectEvent }: TimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-end gap-[2px] h-24 w-full overflow-x-auto pb-4 px-1 no-scrollbar">
        {events.map((event, index) => {
          const isSelected = index === selectedEventIndex;
          const description = describeReviewEvent(event);
          
          return (
            <motion.button
              key={`${event.timestamp}-${index}`}
              type="button"
              data-testid={`timeline-event-${index}`}
              onClick={() => onSelectEvent(index)}
              className="group relative flex-1 min-w-[6px] h-full flex flex-col items-center justify-end"
              whileHover={{ scaleY: 1.1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                <div className="bg-black/90 text-[10px] text-white px-2 py-1 rounded-md border border-white/10 shadow-xl">
                  {description}
                </div>
              </div>

              {/* Event Marker Dot (if special event) */}
              {['message', 'agent_response', 'code_change'].includes(event.type) && (
                <div 
                  className="absolute bottom-12 w-1.5 h-1.5 rounded-full z-10"
                  style={{ 
                    background: event.type === 'message' ? 'var(--color-brand-orange)' : 
                                event.type === 'agent_response' ? 'var(--color-brand-green)' :
                                'var(--color-status-warning)'
                  }}
                />
              )}

              {/* The Bar */}
              <div
                className="w-full transition-colors rounded-t-[2px]"
                style={{
                  height: isSelected ? '100%' : '30%',
                  background: isSelected 
                    ? 'var(--color-brand-orange)' 
                    : 'var(--color-border-main)',
                  opacity: isSelected ? 1 : 0.3
                }}
              />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
