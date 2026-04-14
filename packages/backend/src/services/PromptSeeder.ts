import type { DatabaseAdapter, PromptConfig } from '@lintic/core';

export async function seedPromptsFromConfig(
  db: DatabaseAdapter,
  prompts: PromptConfig[],
): Promise<void> {
  const existing = await db.listPrompts();
  if (existing.length > 0) return;
  for (const p of prompts) {
    await db.createPrompt(p);
  }
}
