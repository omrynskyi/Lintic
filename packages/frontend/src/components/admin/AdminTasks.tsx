import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { fetchAdminJson, useAdminKey } from './AdminKeyContext.js';
import type { AdminPromptsResponse, PromptSummary } from '@lintic/core';

type PromptRubricItem = { question: string; guide: string };

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiListPrompts(adminKey: string): Promise<PromptSummary[]> {
  const r = await fetchAdminJson<AdminPromptsResponse>('/api/prompts', adminKey);
  return r.prompts;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function apiCreatePrompt(adminKey: string, data: Omit<PromptSummary, 'id'> & { id?: string }): Promise<PromptSummary> {
  const r = await fetchAdminJson<{ prompt: PromptSummary }>('/api/prompts', adminKey, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  return r.prompt;
}

async function apiUpdatePrompt(adminKey: string, id: string, data: Partial<PromptSummary>): Promise<PromptSummary> {
  const r = await fetchAdminJson<{ prompt: PromptSummary }>(`/api/prompts/${id}`, adminKey, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  return r.prompt;
}

async function apiDeletePrompt(adminKey: string, id: string): Promise<void> {
  await fetchAdminJson<{ deleted: boolean }>(`/api/prompts/${id}`, adminKey, { method: 'DELETE' });
}

async function apiGenerateTask(adminKey: string, description: string): Promise<Omit<PromptSummary, 'id'>> {
  const r = await fetchAdminJson<{ prompt: Omit<PromptSummary, 'id'> }>('/api/prompts/generate', adminKey, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ description }),
  });
  return r.prompt;
}

async function apiGenerateCriteria(
  adminKey: string,
  promptId: string,
): Promise<{ acceptance_criteria: string[]; rubric: PromptRubricItem[] }> {
  return fetchAdminJson<{ acceptance_criteria: string[]; rubric: PromptRubricItem[] }>(
    `/api/prompts/${promptId}/generate-criteria`,
    adminKey,
    { method: 'POST', headers: JSON_HEADERS },
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl bg-[var(--color-bg-app)]/50 px-3 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-[var(--color-brand)] transition-all';
const inputStyle = { color: 'var(--color-text-main)' };

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminTasks() {
  const { adminKey } = useAdminKey();

  // List state
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form visibility
  const [showForm, setShowForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptSummary | null>(null);

  // Form fields
  const [formId, setFormId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDifficulty, setFormDifficulty] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formTagInput, setFormTagInput] = useState('');
  const [formCriteria, setFormCriteria] = useState<string[]>(['']);
  const [formRubric, setFormRubric] = useState<PromptRubricItem[]>([{ question: '', guide: '' }]);

  // AI generation state
  const [showGenerateInput, setShowGenerateInput] = useState(false);
  const [generateDesc, setGenerateDesc] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const [saving, setSaving] = useState(false);

  const generateInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load prompts ──────────────────────────────────────────────────────────

  function loadPrompts() {
    if (!adminKey) return;
    setLoading(true);
    apiListPrompts(adminKey)
      .then(setPrompts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPrompts(); }, [adminKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditingPrompt(null);
    setFormId('');
    setFormTitle('');
    setFormDesc('');
    setFormDifficulty('');
    setFormTags([]);
    setFormTagInput('');
    setFormCriteria(['']);
    setFormRubric([{ question: '', guide: '' }]);
    setShowGenerateInput(false);
    setGenerateDesc('');
    setError(null);
    setShowForm(true);
  }

  function openEdit(prompt: PromptSummary) {
    setEditingPrompt(prompt);
    setFormId(prompt.id);
    setFormTitle(prompt.title);
    setFormDesc(prompt.description ?? '');
    setFormDifficulty(prompt.difficulty ?? '');
    setFormTags(prompt.tags ?? []);
    setFormTagInput('');
    setFormCriteria(prompt.acceptance_criteria?.length ? prompt.acceptance_criteria : ['']);
    setFormRubric(
      prompt.rubric?.length
        ? prompt.rubric.map((r) => ({ question: r.question, guide: r.guide ?? '' }))
        : [{ question: '', guide: '' }],
    );
    setShowGenerateInput(false);
    setGenerateDesc('');
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingPrompt(null);
    setShowGenerateInput(false);
    setGenerateDesc('');
  }

  // ── Tag helpers ───────────────────────────────────────────────────────────

  function commitTag() {
    const t = formTagInput.trim();
    if (t && !formTags.includes(t)) setFormTags((prev) => [...prev, t]);
    setFormTagInput('');
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag();
    }
    if (e.key === 'Backspace' && !formTagInput && formTags.length > 0) {
      setFormTags((prev) => prev.slice(0, -1));
    }
  }

  // ── Criteria helpers ──────────────────────────────────────────────────────

  function updateCriterion(i: number, value: string) {
    setFormCriteria((prev) => prev.map((c, idx) => (idx === i ? value : c)));
  }

  function removeCriterion(i: number) {
    setFormCriteria((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addCriterion() {
    setFormCriteria((prev) => [...prev, '']);
  }

  // ── Rubric helpers ────────────────────────────────────────────────────────

  function updateRubric(i: number, field: 'question' | 'guide', value: string) {
    setFormRubric((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function removeRubric(i: number) {
    setFormRubric((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addRubric() {
    setFormRubric((prev) => [...prev, { question: '', guide: '' }]);
  }

  // ── AI generation ─────────────────────────────────────────────────────────

  async function handleGenerateTask() {
    if (!adminKey || !generateDesc.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const generated = await apiGenerateTask(adminKey, generateDesc.trim());
      setFormTitle(generated.title ?? '');
      setFormDesc(generated.description ?? '');
      setFormDifficulty(generated.difficulty ?? '');
      setFormTags(generated.tags ?? []);
      setFormCriteria(generated.acceptance_criteria?.length ? generated.acceptance_criteria : ['']);
      setFormRubric(
        generated.rubric?.length
          ? generated.rubric.map((r) => ({ question: r.question, guide: r.guide ?? '' }))
          : [{ question: '', guide: '' }],
      );
      setShowGenerateInput(false);
      setGenerateDesc('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateCriteria() {
    if (!adminKey || !editingPrompt) return;
    setGeneratingCriteria(true);
    setError(null);
    try {
      const result = await apiGenerateCriteria(adminKey, editingPrompt.id);
      setFormCriteria(result.acceptance_criteria?.length ? result.acceptance_criteria : ['']);
      setFormRubric(
        result.rubric?.length
          ? result.rubric.map((r) => ({ question: r.question, guide: r.guide ?? '' }))
          : [{ question: '', guide: '' }],
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Criteria generation failed');
    } finally {
      setGeneratingCriteria(false);
    }
  }

  // ── Save / Delete ─────────────────────────────────────────────────────────

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!adminKey || !formTitle.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);

    const cleanCriteria = formCriteria.filter((c) => c.trim());
    const cleanRubric = formRubric.filter((r) => r.question.trim()).map((r) => ({
      question: r.question.trim(),
      guide: r.guide.trim() || undefined,
    }));

    const payload: Partial<PromptSummary> & { id?: string } = {
      title: formTitle.trim(),
      description: formDesc.trim() || undefined,
      difficulty: formDifficulty || undefined,
      tags: formTags,
      acceptance_criteria: cleanCriteria,
      rubric: cleanRubric,
    };

    try {
      if (editingPrompt) {
        await apiUpdatePrompt(adminKey, editingPrompt.id, payload);
      } else {
        if (formId.trim()) payload.id = formId.trim();
        await apiCreatePrompt(adminKey, payload as Omit<PromptSummary, 'id'> & { id?: string });
      }
      loadPrompts();
      closeForm();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!adminKey) return;
    try {
      await apiDeletePrompt(adminKey, id);
      setDeleteConfirmId(null);
      loadPrompts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 p-5">
      {/* Topbar */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-bold)' }}>
            Tasks
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
            Manage assessment tasks — stored in the database
          </p>
        </div>
        {adminKey ? (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: 'var(--color-brand)', color: 'white' }}
          >
            <Plus size={11} />
            Add Task
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          className="mb-4 rounded-xl px-3 py-2.5 text-[12px]"
          style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--color-status-error)' }}
        >
          {error}
        </div>
      ) : null}

      {/* ── Create / Edit Form ──────────────────────────────────────────── */}
      {showForm ? (
        <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--color-bg-panel)' }}>
          {/* Form header */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-bold)' }}>
              {editingPrompt ? `Edit: ${editingPrompt.title}` : 'New Task'}
            </span>
            <button type="button" onClick={closeForm} style={{ color: 'var(--color-text-dim)' }}>
              <X size={13} />
            </button>
          </div>

          {/* Generate Task section */}
          <div className="mb-4 rounded-xl p-3" style={{ background: 'var(--color-bg-app)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {showGenerateInput ? (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-brand)' }}>
                  DESCRIBE THE TASK FOR AI
                </span>
                <textarea
                  ref={generateInputRef}
                  value={generateDesc}
                  onChange={(e) => setGenerateDesc(e.target.value)}
                  rows={3}
                  placeholder="e.g. Build a REST API for managing a todo list with CRUD operations, authentication, and rate limiting..."
                  className={inputClass + ' resize-y'}
                  style={inputStyle}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={generating || !generateDesc.trim()}
                    onClick={handleGenerateTask}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                    style={{ background: 'var(--color-brand)', color: 'white' }}
                  >
                    <Sparkles size={11} />
                    {generating ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowGenerateInput(false); setGenerateDesc(''); }}
                    className="rounded-xl px-3 py-1.5 text-[11px]"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                  Let AI write the task for you
                </span>
                <button
                  type="button"
                  onClick={() => { setShowGenerateInput(true); setTimeout(() => generateInputRef.current?.focus(), 50); }}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold"
                  style={{ background: 'rgba(var(--color-brand-rgb, 99,102,241),0.15)', color: 'var(--color-brand)' }}
                >
                  <Sparkles size={11} />
                  Generate Task
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSave}>
            {/* Basic fields */}
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              {!editingPrompt ? (
                <label>
                  <span className="mb-1 block text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                    ID <span className="font-normal opacity-60">(optional — auto-generated if empty)</span>
                  </span>
                  <input
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="library-api"
                    className={inputClass}
                    style={inputStyle}
                  />
                </label>
              ) : null}
              <label className={editingPrompt ? 'sm:col-span-2' : ''}>
                <span className="mb-1 block text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                  Title <span style={{ color: 'var(--color-status-error)' }}>*</span>
                </span>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Library Catalog API"
                  required
                  className={inputClass}
                  style={inputStyle}
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                  Difficulty
                </span>
                <select
                  value={formDifficulty}
                  onChange={(e) => setFormDifficulty(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Not set</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                  Tags
                </span>
                <div
                  className="flex min-h-[32px] flex-wrap items-center gap-1 rounded-xl px-2 py-1"
                  style={{ background: 'var(--color-bg-app)/50', border: '1px solid transparent', outline: 'none' }}
                >
                  {formTags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px]"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-muted)' }}
                    >
                      {tag}
                      <button type="button" onClick={() => setFormTags((p) => p.filter((t) => t !== tag))}>
                        <X size={8} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={formTagInput}
                    onChange={(e) => setFormTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={commitTag}
                    placeholder={formTags.length === 0 ? 'backend, api-design… (Enter to add)' : ''}
                    className="min-w-[80px] flex-1 bg-transparent text-[12px] outline-none"
                    style={inputStyle}
                  />
                </div>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                  Description (Markdown)
                </span>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={6}
                  placeholder="# Goal&#10;Describe the task requirements..."
                  className={inputClass + ' resize-y'}
                  style={inputStyle}
                />
              </label>
            </div>

            {/* Acceptance Criteria */}
            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                  ACCEPTANCE CRITERIA
                </span>
                {editingPrompt ? (
                  <button
                    type="button"
                    disabled={generatingCriteria}
                    onClick={handleGenerateCriteria}
                    className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-semibold disabled:opacity-50"
                    style={{ background: 'rgba(var(--color-brand-rgb, 99,102,241),0.12)', color: 'var(--color-brand)' }}
                  >
                    <Sparkles size={9} />
                    {generatingCriteria ? 'Generating…' : 'Generate Criteria'}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                {formCriteria.map((criterion, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={criterion}
                      onChange={(e) => updateCriterion(i, e.target.value)}
                      placeholder={`Criterion ${i + 1}…`}
                      className={inputClass + ' flex-1'}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => removeCriterion(i)}
                      className="shrink-0 rounded-lg p-1.5 transition-colors"
                      style={{ color: 'var(--color-text-dim)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-status-error)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-dim)'; }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addCriterion}
                className="mt-2 flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--color-text-dim)' }}
              >
                <Plus size={11} />
                Add criterion
              </button>
            </div>

            {/* Rubric Questions */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                  RUBRIC QUESTIONS
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {formRubric.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <input
                        value={item.question}
                        onChange={(e) => updateRubric(i, 'question', e.target.value)}
                        placeholder={`Question ${i + 1}… (e.g. Did the candidate choose an appropriate framework?)`}
                        className={inputClass}
                        style={inputStyle}
                      />
                      <input
                        value={item.guide}
                        onChange={(e) => updateRubric(i, 'guide', e.target.value)}
                        placeholder="Scoring guide (optional)"
                        className={inputClass}
                        style={{ ...inputStyle, fontSize: '11px', opacity: 0.8 }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRubric(i)}
                      className="shrink-0 rounded-lg p-1.5 transition-colors"
                      style={{ color: 'var(--color-text-dim)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-status-error)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-dim)'; }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRubric}
                className="mt-2 flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--color-text-dim)' }}
              >
                <Plus size={11} />
                Add rubric question
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-brand)', color: 'white' }}
              >
                {saving ? 'Saving…' : editingPrompt ? 'Save changes' : 'Add task'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl px-4 py-1.5 text-[12px]"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Task list ───────────────────────────────────────────────────── */}
      {!adminKey ? (
        <div
          className="rounded-xl px-4 py-6 text-center text-[12px]"
          style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text-dim)' }}
        >
          Enter your admin key in Settings to view tasks.
        </div>
      ) : loading ? (
        <div className="text-center text-[12px]" style={{ color: 'var(--color-text-dim)' }}>
          Loading…
        </div>
      ) : prompts.length === 0 ? (
        <div
          className="rounded-xl px-4 py-8 text-center text-[12px]"
          style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text-dim)' }}
        >
          No tasks yet. Click <strong>Add Task</strong> to create your first one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ background: 'var(--color-bg-panel)' }}>
          {prompts.map((prompt) => (
            <div key={prompt.id} className="even:bg-[var(--color-bg-app)]/20">
              {/* Row */}
              <div className="flex items-center gap-2 px-4 py-2.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
                >
                  {expandedId === prompt.id ? (
                    <ChevronDown size={13} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={13} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-bold)' }}>
                      {prompt.title}
                    </span>
                    <span className="ml-3 font-mono text-[10px]" style={{ color: 'var(--color-text-dimmest)' }}>
                      {prompt.id}
                    </span>
                  </span>
                  {prompt.difficulty ? (
                    <span
                      className="shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] capitalize"
                      style={{
                        background:
                          prompt.difficulty === 'easy'
                            ? 'rgba(34,197,94,0.12)'
                            : prompt.difficulty === 'hard'
                              ? 'rgba(239,68,68,0.12)'
                              : 'rgba(234,179,8,0.12)',
                        color:
                          prompt.difficulty === 'easy'
                            ? 'var(--color-status-active)'
                            : prompt.difficulty === 'hard'
                              ? 'var(--color-status-error)'
                              : '#ca8a04',
                      }}
                    >
                      {prompt.difficulty}
                    </span>
                  ) : null}
                  {prompt.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="flex shrink-0 items-center gap-1 rounded-xl px-1.5 py-0.5 text-[10px]"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-dim)' }}
                    >
                      <Tag size={9} />
                      {tag}
                    </span>
                  ))}
                </button>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {deleteConfirmId === prompt.id ? (
                    <>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
                        Delete?
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(prompt.id)}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold"
                        style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--color-status-error)' }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg px-2 py-1 text-[10px]"
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        title="Edit task"
                        onClick={() => openEdit(prompt)}
                        className="rounded-lg p-1.5 transition-colors"
                        style={{ color: 'var(--color-text-dim)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-brand)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-dim)'; }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        title="Delete task"
                        onClick={() => setDeleteConfirmId(prompt.id)}
                        className="rounded-lg p-1.5 transition-colors"
                        style={{ color: 'var(--color-text-dim)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-status-error)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-dim)'; }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === prompt.id ? (
                <div className="px-10 pb-4 pt-1" style={{ background: 'rgba(255,255,255,0.01)' }}>
                  {prompt.description ? (
                    <pre
                      className="mb-3 whitespace-pre-wrap text-[12px] leading-relaxed"
                      style={{ color: 'var(--color-text-muted)', fontFamily: 'inherit' }}
                    >
                      {prompt.description}
                    </pre>
                  ) : null}

                  {prompt.acceptance_criteria?.length ? (
                    <div className="mb-3">
                      <p className="mb-1.5 text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                        ACCEPTANCE CRITERIA
                      </p>
                      <ul className="flex flex-col gap-1">
                        {prompt.acceptance_criteria.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                            <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: 'var(--color-brand)' }}>✓</span>
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {prompt.rubric?.length ? (
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
                        RUBRIC
                      </p>
                      <ul className="flex flex-col gap-2">
                        {prompt.rubric.map((r, i) => (
                          <li key={i} className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                            <span className="font-medium" style={{ color: 'var(--color-text-main)' }}>
                              {i + 1}. {r.question}
                            </span>
                            {r.guide ? (
                              <p className="mt-0.5 text-[11px] italic" style={{ color: 'var(--color-text-dim)' }}>
                                {r.guide}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
