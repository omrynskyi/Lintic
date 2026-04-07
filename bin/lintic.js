#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tsxCli = resolve(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliEntry = resolve(rootDir, 'packages', 'cli', 'src', 'index.ts');

const result = spawnSync(process.execPath, [tsxCli, cliEntry, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
