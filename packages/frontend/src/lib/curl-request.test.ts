import { describe, expect, test } from 'vitest';
import { formatResponseBody } from './curl-request.js';

describe('formatResponseBody', () => {
  test('pretty prints JSON responses', () => {
    const formatted = formatResponseBody('{"ok":true,"count":2}', 'application/json');

    expect(formatted.isJson).toBe(true);
    expect(formatted.bodyText).toBe('{\n  "ok": true,\n  "count": 2\n}\n');
  });

  test('leaves plain text unchanged', () => {
    const formatted = formatResponseBody('hello world', 'text/plain');

    expect(formatted.isJson).toBe(false);
    expect(formatted.bodyText).toBe('hello world');
  });
});
