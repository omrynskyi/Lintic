import { describe, expect, test } from 'vitest';
import {
  buildCodeStateSnapshot,
  buildConversationEntries,
  getConversationAnchorIndex,
  getReviewSessionId,
} from './review-replay.js';

describe('review-replay helpers', () => {
  test('parses review session id from pathname', () => {
    expect(getReviewSessionId('/review/sess-123')).toBe('sess-123');
    expect(getReviewSessionId('/')).toBeNull();
  });

  test('builds conversation entries from replay events', () => {
    const entries = buildConversationEntries([
      { type: 'message', timestamp: 1, payload: { role: 'user', content: 'Hello' } },
      { type: 'tool_call', timestamp: 2, payload: { tool_calls: [{ id: '1', name: 'read_file', input: { path: 'src/index.ts' } }] } },
      { type: 'agent_response', timestamp: 3, payload: { content: 'Done', stop_reason: 'end_turn' } },
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0]?.title).toBe('You');
    expect(entries[1]?.title).toBe('Tool Call');
    expect(entries[2]?.body).toBe('Done');
  });

  test('finds the closest conversation anchor for a selected event', () => {
    const entries = [
      { id: 'a', eventIndex: 0, timestamp: 1, title: 'You', body: 'one' },
      { id: 'b', eventIndex: 2, timestamp: 2, title: 'Agent', body: 'two' },
      { id: 'c', eventIndex: 5, timestamp: 3, title: 'Tool', body: 'three' },
    ];

    expect(getConversationAnchorIndex(entries, 4)).toBe(1);
  });

  test('reconstructs code state from write_file tool calls', () => {
    const snapshot = buildCodeStateSnapshot([
      {
        type: 'tool_call',
        timestamp: 1,
        payload: {
          tool_calls: [{
            id: '1',
            name: 'write_file',
            input: { path: 'src/index.ts', content: 'const x = 1;\nconst y = 2;' },
          }],
        },
      },
      {
        type: 'code_change',
        timestamp: 2,
        payload: { file_path: 'src/index.ts', diff: '@@ -1 +1,2 @@\n+const z = 3;' },
      },
    ], 1);

    expect(snapshot.activePath).toBe('src/index.ts');
    expect(snapshot.files['src/index.ts']).toContain('const x = 1;');
    expect(snapshot.diff).toContain('const z = 3');
  });
});

