# Context Panel + Rewind Redesign

**Date:** 2026-04-06  
**Status:** Approved

---

## Overview

Two related improvements to the assessment chat UI:

1. **Context panel redesign** — cleaner hierarchy, no all-caps, remove conversation history section
2. **Rewind on user messages** — hover-reveal rewind icon on each user message that offers two actions: rewind code + conversation, or rewind code only

---

## 1. Rewind on User Messages

### UX

- A `RotateCcw` icon (16px) appears on hover at the top-right corner of each user message bubble
- Only shown on messages that have a `turnSequence` (i.e. a code snapshot exists for that point)
- Clicking opens a small popover anchored to the icon with two options:
  - **Rewind code + conversation** — soft-hides messages after this point and restores code
  - **Rewind code only** — restores code snapshot, conversation untouched
- Popover dismisses on outside click
- No confirmation dialog — the textarea restore makes the action feel reversible

### "Rewind code + conversation" action

1. Call `POST /api/sessions/:id/rewind` with `{ turn_sequence: number }`
2. Backend sets `rewound_at` timestamp on all messages after that `turn_sequence` (soft flag, not delete)
3. Frontend filters rewound messages out of the active chat view
4. User message content is restored to the textarea (ready to re-send, not auto-submitted)
5. Code snapshot for that `turn_sequence` is restored via the existing workspace restore mechanism

### "Rewind code only" action

1. Restore code snapshot for that `turn_sequence` via existing workspace restore mechanism
2. Conversation unchanged

### Backend

- New endpoint: `POST /api/sessions/:id/rewind`
- Body: `{ turn_sequence: number }`
- Sets `rewound_at = NOW()` on all messages in the conversation where `turn_sequence > :turn_sequence`
- Messages with `rewound_at` set are excluded from `GET /api/sessions/:id/messages` by default
- `GET /api/sessions/:id/messages?include_rewound=true` returns full history (used by reviewer)

### ChatMessage type

Add `rewound?: boolean` to the `ChatMessage` interface. Messages loaded from the API with `rewound_at` set are excluded from the active message list in `ChatPanel`.

### ChatPanel props

Add `onRewind?: (turnSequence: number, mode: 'code' | 'both') => Promise<void>` prop to `ChatPanel`. `App.tsx` implements this handler.

---

## 2. Review Dashboard — Rewound Section

In `ReviewDashboard` (session replay), rewound message groups appear as a collapsed inline block between messages:

- Label: `↩ Rewound here` with a count of hidden turns (e.g. "3 turns hidden")
- Subtle bordered box (`border border-white/8 rounded-xl`)
- Expandable — reviewer can click to inspect the messages that were typed and the agent responses before the rewind
- No action buttons — read-only

Data source: `GET /api/sessions/:id/messages?include_rewound=true` returns all messages including rewound ones. The review dashboard uses this to reconstruct the full timeline and identify rewind boundaries (contiguous group of messages with `rewound_at` set).

---

## 3. Context Panel Redesign

### Header

- Title: "Context" (not "Context tools")
- Subtitle: usage percentage (e.g. "35% of window in use")
- Remove current conversation title from header

### Action buttons

- All use `rounded-[var(--assessment-radius-control)] px-3 py-1.5 text-[12px]` sizing
- "New chat": slightly more prominent — `bg-white/10 hover:bg-white/14`
- "Clear", "Refresh repo map", "Summarize chat": secondary — `bg-white/6 hover:bg-white/10`
- Consistent icon size (14px), consistent gap (`gap-1.5`)
- Arranged in a `flex flex-wrap gap-2` row

### Section headers

- Lowercase, `text-[11px] font-medium` in `--color-text-dim`
- No all-caps, no letter-spacing tracking
- Icon retained (same size, same color)

### Sections

- **Conversation history**: removed entirely
- **File context**: retained, new header style
- **Saved summaries**: retained, new header style
- **Prior chat snapshots**: retained, new header style

---

## Files to Change

| File | Change |
|------|--------|
| `packages/frontend/src/components/ChatPanel.tsx` | Rewind icon on user messages, rewind popover, remove conversation history section, context panel header/button/section header redesign |
| `packages/frontend/src/components/ReviewDashboard.tsx` | Rewound section — collapsed block with expand |
| `packages/frontend/src/App.tsx` | `handleRewind` handler — calls API + restores workspace snapshot |
| Backend session route | New `POST /api/sessions/:id/rewind` endpoint |
| Backend DB adapter | `rewindMessages(sessionId, turnSequence)` method |

---

## Out of Scope

- Rewind across branches — only applies to the current conversation
- Undo of a rewind itself
- Rewinding to a point with no snapshot (icon is not shown in that case)
