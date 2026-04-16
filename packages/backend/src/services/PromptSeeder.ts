import { syncPromptsFromConfig, type DatabaseAdapter, type PromptConfig } from '@lintic/core';

export async function seedPromptsFromConfig(
  db: DatabaseAdapter,
  prompts: PromptConfig[],
): Promise<void> {
  await syncPromptsFromConfig(db, prompts);
}
