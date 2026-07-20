#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Prefer the compiled build; fall back to running the TypeScript source
// directly (requires Node >= 23.6 for native type stripping).
const dist = new URL('../dist/cli.js', import.meta.url);
const src = new URL('../src/cli.ts', import.meta.url);
await import(existsSync(fileURLToPath(dist)) ? dist.href : src.href);
