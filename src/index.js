import z from '@deepseek-ai/schemastery';
import { z as wire } from 'zod';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { start } from './host.js';

export const name = 'nextline';
export const inject = ['sessions', 'sessionQuery', 'sessionProjections', 'llm'];
export const Config = z.object({
  enabled: z.boolean().default(true),
  historyEnabled: z.boolean().default(true),
  historyDays: z.natural().min(1).max(365).default(30),
  historySessionLimit: z.natural().min(1).max(100).default(10),
  timeoutMs: z.natural().min(1000).max(60000).default(15000),
  maxSuggestionChars: z.natural().min(20).max(240).default(240),
  provider: z.string().default(''),
  model: z.string().default('')
});
const schema = wire.object({ text: wire.string().min(1).max(240),
  turnSeq: wire.number().int().nonnegative(), createdAt: wire.number().finite() }).nullable();
const required = { llm: ['BlockAssembler', 'createUserMessage'], session: ['appendPluginRecord'] };

// A profile-installed bundle may carry its own copy of the DSH libraries next to
// its source. Session records are brand-checked against the running Session class,
// so resolve those modules from the running installation instead of that copy.
function anchors() {
  const result = [];
  const entry = process.argv[1];
  if (typeof entry === 'string' && entry.length > 0) result.push(resolvePath(entry));
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0)
    result.push(join(process.resourcesPath, 'app.asar', 'dsh', 'package.json'));
  return result;
}

async function hostLibraries() {
  for (const anchor of anchors()) {
    try {
      if (!existsSync(anchor)) continue;
      const fromHost = createRequire(anchor);
      const [llm, session] = await Promise.all([
        import(pathToFileURL(fromHost.resolve('@deepseek-ai/dsh-llm')).href),
        import(pathToFileURL(fromHost.resolve('@deepseek-ai/dsh-session')).href)
      ]);
      if (required.llm.every(key => typeof llm[key] === 'function') &&
          required.session.every(key => typeof session[key] === 'function'))
        return { BlockAssembler: llm.BlockAssembler, createUserMessage: llm.createUserMessage,
          appendPluginRecord: session.appendPluginRecord };
    } catch {
      // Another anchor, or the package-resolved copy, may match the host.
    }
  }
  const [llm, session] = await Promise.all([import('@deepseek-ai/dsh-llm'), import('@deepseek-ai/dsh-session')]);
  if (!required.llm.every(key => typeof llm[key] === 'function') ||
      !required.session.every(key => typeof session[key] === 'function'))
    throw new Error('NextLine: cannot load the DSH libraries of the running installation.');
  return { BlockAssembler: llm.BlockAssembler, createUserMessage: llm.createUserMessage,
    appendPluginRecord: session.appendPluginRecord };
}

export async function apply(ctx, config = {}) {
  const resolved = Config(config);
  if (Boolean(resolved.provider) !== Boolean(resolved.model)) throw new Error('NextLine: provider and model must be configured together.');
  const libraries = await hostLibraries();
  return start(ctx, resolved, { schema, ...libraries });
}
