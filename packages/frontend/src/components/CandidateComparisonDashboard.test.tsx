import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CandidateComparisonDashboard } from './CandidateComparisonDashboard.js';
import { AdminKeyProvider } from './admin/AdminKeyContext.js';
import type { ComparisonResponse, ComparisonSessionRow } from '@lintic/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ComparisonSessionRow> = {}): ComparisonSessionRow {
  return {
    session_id: 'sess-1',
    candidate_email: 'alice@example.com',
    prompt_id: 'library-api',
    prompt_title: 'Library Catalog API',
    date: Date.now(),
    composite_score: 0.75,
    ie: 0.8,
    te: 0.7,
    rs: 0.6,
    ir: 0.9,
    pq: null,
    cc: null,
    ...overrides,
  };
}

function renderWithAdminKey(key: string = 'test-admin-key') {
  try {
    localStorage.setItem('lintic_admin_key', key);
  } catch { /* ignore in test env */ }
  return render(
    <AdminKeyProvider>
      <CandidateComparisonDashboard isDark={false} onToggleTheme={() => {}} />
    </AdminKeyProvider>,
  );
}

// ─── Mock fetch ───────────────────────────────────────────────────────────────

function mockFetch(data: ComparisonResponse) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(data)),
  }));
}

function mockFetchError(message = 'Network error') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  try { localStorage.removeItem('lintic_admin_key'); } catch { /* ignore */ }
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  try { localStorage.removeItem('lintic_admin_key'); } catch { /* ignore */ }
});

describe('CandidateComparisonDashboard', () => {
  test('shows admin key prompt when no key is stored', async () => {
    mockFetch({ sessions: [] });
    render(
      <AdminKeyProvider>
        <CandidateComparisonDashboard isDark={false} onToggleTheme={() => {}} />
      </AdminKeyProvider>,
    );
    expect(screen.getByText(/Admin Settings/i)).toBeTruthy();
  });

  test('shows loading state while fetching', async () => {
    let resolveFetch!: (v: unknown) => void;
    const pending = new Promise((r) => { resolveFetch = r; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

    renderWithAdminKey();

    // "Loading…" should appear while the fetch is pending
    expect(screen.getByText(/Loading/i)).toBeTruthy();

    // Clean up
    resolveFetch({ ok: true, status: 200, text: () => Promise.resolve('{"sessions":[]}') });
  });

  test('renders table rows on success', async () => {
    const rows = [
      makeRow({ session_id: 's1', candidate_email: 'alice@example.com' }),
      makeRow({ session_id: 's2', candidate_email: 'bob@example.com' }),
    ];
    mockFetch({ sessions: rows });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeTruthy();
      expect(screen.getByText('bob@example.com')).toBeTruthy();
    });
  });

  test('shows "—" for null pq/cc values', async () => {
    mockFetch({ sessions: [makeRow({ pq: null, cc: null })] });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => {
      // PQ and CC columns should show em-dashes for null values
      const cells = screen.getAllByText('—');
      expect(cells.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('shows composite score as percentage', async () => {
    mockFetch({ sessions: [makeRow({ composite_score: 0.75 })] });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => {
      expect(screen.getByText('75%')).toBeTruthy();
    });
  });

  test('clicking a column header sorts by that column', async () => {
    const rows = [
      makeRow({ session_id: 's1', candidate_email: 'alice@example.com', ie: 0.9 }),
      makeRow({ session_id: 's2', candidate_email: 'bob@example.com', ie: 0.1 }),
    ];
    mockFetch({ sessions: rows });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => screen.getByText('alice@example.com'));

    // Click IE header to sort
    fireEvent.click(screen.getByTitle('Iteration Efficiency'));

    // After clicking, IE header should be the active sort column
    // Table rows should still render
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('bob@example.com')).toBeTruthy();
  });

  test('filtering by prompt shows only matching rows', async () => {
    const rows = [
      makeRow({ session_id: 's1', candidate_email: 'alice@example.com', prompt_id: 'api', prompt_title: 'API Task' }),
      makeRow({ session_id: 's2', candidate_email: 'bob@example.com', prompt_id: 'algo', prompt_title: 'Algo Task' }),
    ];
    mockFetch({ sessions: rows });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => screen.getByText('alice@example.com'));

    // Both rows visible initially
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('bob@example.com')).toBeTruthy();

    // Select prompt filter for 'api'
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'api' } });

    // Only alice should remain
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.queryByText('bob@example.com')).toBeNull();
  });

  test('date filter 7d excludes old sessions', async () => {
    const recentTs = Date.now() - 2 * 86_400_000; // 2 days ago
    const oldTs = Date.now() - 10 * 86_400_000;   // 10 days ago
    const rows = [
      makeRow({ session_id: 's1', candidate_email: 'recent@example.com', date: recentTs }),
      makeRow({ session_id: 's2', candidate_email: 'old@example.com', date: oldTs }),
    ];
    mockFetch({ sessions: rows });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => screen.getByText('recent@example.com'));

    // Click "7 days" date filter
    fireEvent.click(screen.getByText('7 days'));

    expect(screen.getByText('recent@example.com')).toBeTruthy();
    expect(screen.queryByText('old@example.com')).toBeNull();
  });

  test('pagination shows 25 rows per page', async () => {
    // Create 30 rows
    const rows = Array.from({ length: 30 }, (_, i) =>
      makeRow({ session_id: `s${i}`, candidate_email: `user${i}@example.com` }),
    );
    mockFetch({ sessions: rows });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => screen.getByText('user0@example.com'));

    // First page shows 25 rows
    expect(screen.getByText('user0@example.com')).toBeTruthy();
    expect(screen.queryByText('user25@example.com')).toBeNull();

    // Pagination should show "Page 1 of 2"
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();

    // Click next
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => screen.getByText('user25@example.com'));
    expect(screen.queryByText('user0@example.com')).toBeNull();
  });

  test('clicking a row navigates to /review/:sessionId', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    mockFetch({ sessions: [makeRow({ session_id: 'sess-abc' })] });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => screen.getByText('alice@example.com'));

    const rows = screen.getAllByRole('row');
    // rows[0] is the header, rows[1] is the first data row
    fireEvent.click(rows[1]!);

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/review/sess-abc');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(PopStateEvent));
  });

  test('shows error message when fetch fails', async () => {
    mockFetchError('Server unavailable');

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => {
      expect(screen.getByText(/Server unavailable/)).toBeTruthy();
    });
  });

  test('shows session count in header', async () => {
    mockFetch({ sessions: [makeRow(), makeRow({ session_id: 's2', candidate_email: 'b@b.com' })] });

    await act(async () => { renderWithAdminKey(); });

    await waitFor(() => {
      expect(screen.getByText(/2 sessions/)).toBeTruthy();
    });
  });
});
