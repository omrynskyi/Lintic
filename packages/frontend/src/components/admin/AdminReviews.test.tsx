import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminReviews } from './AdminReviews.js';
import { AdminKeyProvider } from './AdminKeyContext.js';

vi.mock('../ReviewDashboard.js', () => ({
  ReviewDashboard: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="review-dashboard">{sessionId}</div>
  ),
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AdminReviews', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lintic_admin_key', 'admin-key');
  });

  test('renders task boxes without helper panels and opens review on double click', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/reviews') {
        return jsonResponse({
          reviews: [
            {
              session_id: 'sess-unviewed-1',
              candidate_email: 'first@example.com',
              prompt_id: 'prompt-1',
              prompt_title: 'Build API',
              completed_at: Date.now() - 1000,
              session_score: 0.74,
              review_status: 'unviewed',
              comparison_status: 'pending',
            },
            {
              session_id: 'sess-viewed-1',
              candidate_email: 'viewed@example.com',
              prompt_id: 'prompt-1',
              prompt_title: 'Build API',
              completed_at: Date.now() - 2000,
              review_status: 'viewed',
              comparison_status: 'pending',
            },
          ],
        });
      }
      if (url === '/api/reviews/sess-unviewed-1/viewed') {
        expect(init?.method).toBe('POST');
        return jsonResponse({ review_state: { status: 'viewed' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminKeyProvider>
        <AdminReviews isDark={false} onToggleTheme={() => undefined} />
      </AdminKeyProvider>,
    );

    await waitFor(() => expect(screen.getByText('Build API')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Unviewed \(1\)/ }));
    expect(screen.queryByText('What to do')).not.toBeInTheDocument();
    expect(screen.queryByText('Queue summary')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Stage for comparison')).toBeInTheDocument();
    expect(screen.queryByText('viewed@example.com')).not.toBeInTheDocument();

    const sessionCard = screen.getByText('first@example.com').closest('article');
    expect(sessionCard).not.toBeNull();
    fireEvent.doubleClick(sessionCard!);

    await waitFor(() => expect(screen.getByTestId('review-dashboard')).toHaveTextContent('sess-unviewed-1'));
  });

  test('stages candidates and shows detailed comparison columns side by side', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/reviews') {
        return jsonResponse({
          reviews: [
            {
              session_id: 'sess-1',
              candidate_email: 'first@example.com',
              prompt_id: 'prompt-1',
              prompt_title: 'Build API',
              completed_at: Date.now() - 1000,
              session_score: 0.81,
              review_status: 'unviewed',
              comparison_status: 'pending',
            },
            {
              session_id: 'sess-2',
              candidate_email: 'second@example.com',
              prompt_id: 'prompt-1',
              prompt_title: 'Build API',
              completed_at: Date.now() - 2000,
              session_score: 0.69,
              review_status: 'viewed',
              comparison_status: 'pending',
            },
          ],
        });
      }
      if (url === '/api/review/sess-1') {
        return jsonResponse({
          session: {
            id: 'sess-1',
            prompt_id: 'prompt-1',
            candidate_email: 'first@example.com',
            status: 'completed',
            created_at: Date.now() - 2000,
            closed_at: Date.now() - 1000,
            tokens_used: 1000,
            interactions_used: 4,
            constraint: {
              max_session_tokens: 5000,
              max_interactions: 20,
              time_limit_minutes: 60,
            },
            score: 0.81,
          },
          metrics: [],
          recording: { session_id: 'sess-1', events: [] },
          messages: [],
          evaluation: {
            session_id: 'sess-1',
            score: 0.81,
            created_at: Date.now(),
            updated_at: Date.now(),
            result: {
              infrastructure: {
                caching_effectiveness: { name: 'caching', label: 'Caching', score: 0.7, details: 'Good cache usage' },
                error_handling_coverage: { name: 'errors', label: 'Errors', score: 0.8, details: 'Good handling' },
                scaling_awareness: { name: 'scale', label: 'Scaling', score: 0.6, details: 'Some scaling awareness' },
              },
              llm_evaluation: {
                overall_summary: 'Strong overall candidate.',
                scores: [
                  { dimension: 'prompt_quality', label: 'Prompt Quality', score: 8, rationale: 'Very clear prompts' },
                ],
                acceptance_criteria_results: [
                  { criterion: 'Build API', score: 90, rationale: 'Completed the main task' },
                ],
                rubric_scores: [
                  { question: 'Code quality', score: 8, rationale: 'Solid quality', is_default: false },
                ],
              },
              iterations: [
                { index: 0, message_count: 4, user_messages: ['Start with REST'], rewound_at: undefined },
              ],
            },
          },
        });
      }
      if (url === '/api/review/sess-2') {
        return jsonResponse({
          session: {
            id: 'sess-2',
            prompt_id: 'prompt-1',
            candidate_email: 'second@example.com',
            status: 'completed',
            created_at: Date.now() - 3000,
            closed_at: Date.now() - 1500,
            tokens_used: 1200,
            interactions_used: 5,
            constraint: {
              max_session_tokens: 5000,
              max_interactions: 20,
              time_limit_minutes: 60,
            },
            score: 0.69,
          },
          metrics: [],
          recording: { session_id: 'sess-2', events: [] },
          messages: [],
          evaluation: {
            session_id: 'sess-2',
            score: 0.69,
            created_at: Date.now(),
            updated_at: Date.now(),
            result: {
              infrastructure: {
                caching_effectiveness: { name: 'caching', label: 'Caching', score: 0.4, details: 'Limited cache usage' },
                error_handling_coverage: { name: 'errors', label: 'Errors', score: 0.7, details: 'Handled most errors' },
                scaling_awareness: { name: 'scale', label: 'Scaling', score: 0.5, details: 'Basic scaling awareness' },
              },
              llm_evaluation: {
                overall_summary: 'Promising, but less consistent.',
                scores: [
                  { dimension: 'prompt_quality', label: 'Prompt Quality', score: 6, rationale: 'Sometimes vague' },
                ],
                acceptance_criteria_results: [
                  { criterion: 'Build API', score: 74, rationale: 'Mostly complete' },
                ],
                rubric_scores: [
                  { question: 'Code quality', score: 6, rationale: 'Acceptable quality', is_default: false },
                ],
              },
              iterations: [
                { index: 0, message_count: 5, user_messages: ['Use TypeScript'], rewound_at: undefined },
              ],
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminKeyProvider>
        <AdminReviews isDark={false} onToggleTheme={() => undefined} />
      </AdminKeyProvider>,
    );

    await waitFor(() => expect(screen.getByText('Build API')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Unviewed \(1\)/ }));
    fireEvent.click(screen.getAllByLabelText('Stage for comparison')[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Viewed \(1\)/ }));
    const secondCard = screen.getByText('second@example.com').closest('article');
    expect(secondCard).not.toBeNull();
    fireEvent.click(within(secondCard!).getByLabelText('Stage for comparison'));

    await waitFor(() => expect(screen.getByText('Analyze staged candidates')).toBeInTheDocument());
    await waitFor(() => expect(
      screen.getByRole('button', { name: /Show evaluation for Prompt Quality - first@example.com/ }),
    ).toBeInTheDocument());
    await waitFor(() => expect(
      screen.getByRole('button', { name: /Show evaluation for Build API - first@example.com/ }),
    ).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Show evaluation for Build API - first@example.com/ }));
    await waitFor(() => expect(screen.getByText('Completed the main task')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Show evaluation for Prompt Quality - first@example.com/ }));
    await waitFor(() => expect(screen.getByText('Very clear prompts')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Summary/ }));
    await waitFor(() => expect(screen.getByText('Strong overall candidate.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Rubric/ }));
    await waitFor(() => expect(screen.getByText('Solid quality')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Infrastructure/ }));
    await waitFor(() => expect(screen.getByText('Good cache usage')).toBeInTheDocument());
    expect(screen.getByText('Completed the main task')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/review/sess-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/review/sess-2');
  });

  test('refreshes stale comparison data when a session score exists but cached detail had no evaluation', async () => {
    let reviewFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/reviews') {
        return jsonResponse({
          reviews: [
            {
              session_id: 'sess-1',
              candidate_email: 'candidate@example.com',
              prompt_id: 'prompt-1',
              prompt_title: 'Build API',
              completed_at: Date.now() - 1000,
              session_score: 0.61,
              review_status: 'viewed',
              comparison_status: 'pending',
            },
          ],
        });
      }
      if (url === '/api/review/sess-1') {
        reviewFetchCount += 1;
        if (reviewFetchCount === 1) {
          return jsonResponse({
            session: {
              id: 'sess-1',
              prompt_id: 'prompt-1',
              candidate_email: 'candidate@example.com',
              status: 'completed',
              created_at: Date.now() - 2000,
              closed_at: Date.now() - 1000,
              tokens_used: 1000,
              interactions_used: 4,
              constraint: {
                max_session_tokens: 5000,
                max_interactions: 20,
                time_limit_minutes: 60,
              },
              score: 0.61,
            },
            metrics: [],
            recording: { session_id: 'sess-1', events: [] },
            messages: [],
            evaluation: null,
          });
        }
        return jsonResponse({
          session: {
            id: 'sess-1',
            prompt_id: 'prompt-1',
            candidate_email: 'candidate@example.com',
            status: 'completed',
            created_at: Date.now() - 2000,
            closed_at: Date.now() - 1000,
            tokens_used: 1000,
            interactions_used: 4,
            constraint: {
              max_session_tokens: 5000,
              max_interactions: 20,
              time_limit_minutes: 60,
            },
            score: 0.61,
          },
          metrics: [],
          recording: { session_id: 'sess-1', events: [] },
          messages: [],
          evaluation: {
            session_id: 'sess-1',
            score: 0.61,
            created_at: Date.now(),
            updated_at: Date.now(),
            result: {
              infrastructure: {
                caching_effectiveness: { name: 'caching', label: 'Caching', score: 0.7, details: 'Good cache usage' },
                error_handling_coverage: { name: 'errors', label: 'Errors', score: 0.8, details: 'Good handling' },
                scaling_awareness: { name: 'scale', label: 'Scaling', score: 0.6, details: 'Some scaling awareness' },
              },
              llm_evaluation: {
                overall_summary: 'Now refreshed correctly.',
                scores: [
                  { dimension: 'prompt_quality', label: 'Prompt Quality', score: 8, rationale: 'Now refreshed correctly.' },
                ],
                acceptance_criteria_results: [],
                rubric_scores: [],
              },
              iterations: [],
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminKeyProvider>
        <AdminReviews isDark={false} onToggleTheme={() => undefined} />
      </AdminKeyProvider>,
    );

    await waitFor(() => expect(screen.getByText('Build API')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Viewed \(1\)/ }));
    fireEvent.click(screen.getByLabelText('Stage for comparison'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/review/sess-1'));
    await waitFor(() => expect(screen.getByText(/No LLM evaluation yet/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Comparison \(1\)/ }));
    await waitFor(() => expect(screen.queryByText(/No LLM evaluation yet/i)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Comparison \(1\)/ }));
    await waitFor(() => expect(
      screen.getByRole('button', { name: /Show evaluation for Prompt Quality - candidate@example.com/ }),
    ).toBeInTheDocument());
    const refreshedScoreButton = screen.getByRole('button', { name: /Show evaluation for Prompt Quality - candidate@example.com/ });
    fireEvent.click(refreshedScoreButton);
    await waitFor(() => expect(within(refreshedScoreButton).getByText('Now refreshed correctly.')).toBeInTheDocument());
    expect(reviewFetchCount).toBe(2);
  });

  test('archives live reviews and lets archived reviews be deleted manually', async () => {
    const liveReview = {
      session_id: 'sess-archive-1',
      candidate_email: 'archive@example.com',
      prompt_id: 'prompt-1',
      prompt_title: 'Build API',
      completed_at: Date.now() - 1000,
      review_status: 'viewed',
      comparison_status: 'pending',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/reviews') {
        return jsonResponse({ reviews: [liveReview] });
      }
      if (url === '/api/reviews?archived=true') {
        return jsonResponse({
          reviews: [
            {
              ...liveReview,
              archived_at: Date.now(),
            },
          ],
        });
      }
      if (url === '/api/reviews/sess-archive-1/archive') {
        expect(init?.method).toBe('POST');
        return jsonResponse({ session: { ...liveReview, archived_at: Date.now() } });
      }
      if (url === '/api/reviews/sess-archive-1') {
        expect(init?.method).toBe('DELETE');
        return jsonResponse({ deleted: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminKeyProvider>
        <AdminReviews isDark={false} onToggleTheme={() => undefined} />
      </AdminKeyProvider>,
    );

    await waitFor(() => expect(screen.getByText('Build API')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Viewed \(1\)/ }));
    await waitFor(() => expect(screen.getByText('archive@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Archive review'));
    await waitFor(() => expect(screen.queryByText('archive@example.com')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await waitFor(() => expect(screen.getByText('Build API')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Viewed \(1\)/ }));
    await waitFor(() => expect(screen.getByText('archive@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Delete permanently'));
    await waitFor(() => expect(screen.queryByText('archive@example.com')).not.toBeInTheDocument());
  });
});
