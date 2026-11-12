import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = process.argv[2];
if (!root) { console.error('Usage: node scripts/check-compat.mjs <DSH node_modules directory>'); process.exit(2); }
const specs = {
  'dsh-client-ui-conversation': ['conversation.input.overlay', 'registerRootListener', 'setDraft', 'data-composer-placeholder', '"conversation"'],
  'dsh-session-query': ['observeSession(', 'listSessions('],
  'dsh-session': ['appendPluginRecord', 'requestHeader('],
  'dsh-session-projection': ['register(definition)', 'viewSchema'],
  'dsh-llm': ['prepareCall(', 'BlockAssembler']
};
let passed = true;
for (const [name, tokens] of Object.entries(specs)) {
  try {
    const dir = join(resolve(root), '@deepseek-ai', name);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const code = await readFile(join(dir, 'lib', name.includes('ui-conversation') ? 'client.js' : 'index.js'), 'utf8');
    const missing = tokens.filter(t => !code.includes(t));
    console.log(`${name}@${pkg.version}: ${missing.length ? `CHECK REQUIRED: ${missing.join(', ')}` : 'surface found'}`);
    if (missing.length) passed = false;
  } catch { console.log(`${name}: unavailable`); passed = false; }
}
console.log('Static API check only; this does not certify behavior on an untested DSH release.');
if (!passed) process.exitCode = 1;
