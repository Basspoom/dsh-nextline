import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { start } from '../src/host.js';
import { RECORD } from '../src/core.js';
const runtime = process.argv[2];
if (!runtime) throw new Error('Usage: node scripts/test-host.mjs <DSH node_modules>');
const native = name => import(pathToFileURL(join(resolve(runtime), '@deepseek-ai', name, 'lib/index.js')).href);
const { Context } = await native('cordis');
const { SessionStore, appendPluginRecord } = await native('dsh-session');
const { SessionProjectionRegistry } = await native('dsh-session-projection');
const { SessionQueryEngine } = await native('dsh-session-query');
const { BlockAssembler, createUserMessage, createAssistantMessage } = await native('dsh-llm');
const ctx = new Context();
try {
  await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SessionQueryEngine);
  const calls = [];
  ctx.provide('llm', { prepareCall: async route => ({ config: route, stream: async function* (options) {
    calls.push(options);
    yield { type: 'text-delta', index: 0, text: '请先验证数据，再开始实施。' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } }) });
  await ctx.fiber.await();
  const schema = { parse: x => x };
  const plugin = ctx.plugin({ name: 'nextline-native-test', inject: ['sessions', 'sessionProjections', 'sessionQuery', 'llm'],
    apply: scope => start(scope, { enabled: true, historyEnabled: true, historySessionLimit: 30, historyDays: 30,
      timeoutMs: 5000, maxSuggestionChars: 240, provider: 'test', model: 'test' },
      { schema, BlockAssembler, createUserMessage, appendPluginRecord }) });
  await plugin.await();
  assert.equal(plugin.state, 2, 'native plugin must be active');
  const session = ctx.sessions.create('nextline-isolated-test', { meta: { cwd: resolve('.') } });
  session.append('turn/start', { turn: 1 });
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '请帮我制定数据分析方案。' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  session.append('assistant/message', { turn: 1, step: 1, stream: [],
    message: createAssistantMessage({ content: [{ type: 'text', text: '先清理数据，再进行统计分析。' }], provider: 'test', model: 'test' }) }, { surfaceOp: 'append' });
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
  let observation;
  for (let i = 0; i < 100; i++) {
    observation?.[Symbol.dispose]();
    observation = await ctx.sessionQuery.observeSession(session.id);
    if (observation.events.some(e => e.type === RECORD)) break;
    await new Promise(r => setTimeout(r, 10));
  }
  const suggestion = observation.events.find(e => e.type === RECORD);
  assert(suggestion, `native host did not publish a suggestion; calls=${calls.length}; events=${observation.events.map(e => e.type).join(',')}`);
  assert.equal(suggestion.ignorable, true);
  assert.equal(calls.length, 1);
  assert.equal(observation.projections.values.nextline.text, suggestion.data.text);
  observation[Symbol.dispose]();
  session.append('turn/start', { turn: 2 });
  observation = await ctx.sessionQuery.observeSession(session.id);
  assert.equal(observation.projections.values.nextline, null);
  observation[Symbol.dispose]();
  await plugin.dispose();
  console.log('PASS: native Cordis lifecycle, Session events, history reads, LLM stream assembly, plugin record and projection invalidation. Model transport is a deterministic stub.');
} finally { await ctx.fiber.dispose(); }
