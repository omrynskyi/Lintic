import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Timeline } from './Timeline.js';
import type { ReviewReplayEvent } from '../lib/review-replay.js';

function makeEvents(): ReviewReplayEvent[] {
  return [
    { type: 'message', timestamp: 1, payload: { role: 'user', content: 'hello' } },
    { type: 'agent_response', timestamp: 2, payload: { role: 'assistant', content: 'hi' } },
    { type: 'code_change', timestamp: 3, payload: { file_path: 'test.ts', diff: '+ hello' } },
    { type: 'system', timestamp: 4, payload: { details: 'meta' } },
  ];
}

describe('Timeline', () => {
  test('uses theme-aware colors for idle and marker states', () => {
    render(
      <Timeline
        events={makeEvents()}
        selectedEventIndex={0}
        onSelectEvent={vi.fn()}
        markerIndices={[1]}
      />,
    );

    const markerEvent = screen.getByTestId('timeline-event-1');
    const markerDot = markerEvent.querySelector('div[style*="var(--color-timeline-marker)"]');
    expect(markerDot).not.toBeNull();

    const idleEvent = screen.getByTestId('timeline-event-2');
    const idleBar = idleEvent.querySelector('div[style*="var(--color-timeline-idle)"]');
    expect(idleBar).not.toBeNull();
  });

  test('uses the hover color token when hovering an unselected event', () => {
    render(
      <Timeline
        events={makeEvents()}
        selectedEventIndex={0}
        onSelectEvent={vi.fn()}
      />,
    );

    const hoveredEvent = screen.getByTestId('timeline-event-3');
    fireEvent.mouseEnter(hoveredEvent);

    const hoverBar = hoveredEvent.querySelector('div[style*="var(--color-timeline-hover)"]');
    expect(hoverBar).not.toBeNull();
  });
});
