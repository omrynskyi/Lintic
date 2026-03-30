import { describe, test, expect } from 'vitest';
import { languageFromPath } from './languageFromPath.js';

describe('languageFromPath', () => {
  test.each([
    ['index.ts', 'typescript'],
    ['App.tsx', 'typescript'],
    ['index.js', 'javascript'],
    ['App.jsx', 'javascript'],
    ['package.json', 'json'],
    ['styles.css', 'css'],
    ['index.html', 'html'],
    ['README.md', 'markdown'],
    ['notes.txt', 'plaintext'],
    ['Makefile', 'plaintext'],
    ['noextension', 'plaintext'],
  ])('%s → %s', (path, expected) => {
    expect(languageFromPath(path)).toBe(expected);
  });
});
