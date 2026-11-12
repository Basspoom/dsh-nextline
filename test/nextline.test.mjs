import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesOf, makeInput, cleanSuggestion, reduceSuggestion, RECORD } from '../src/core.js';
import { start } from '../src/host.js';

const now = Date.now();
const human = (text, seq = 1) => ({ type: 'user/message', seq, time: now,
  data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } });
const answer = { type: 'assistant/message', seq: 2, time: now,
  data: { message: { content: [{ type: 'text', text: '方案已准备好。' }] } } };
const end = { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } };
const hint = { text: '请按这个方案开始。', turnSeq: 3, createdAt: now };

test('learns sent human messages, not tool injections or unedited suggestions', () => {
  const rows = messagesOf([human('请简洁一些'), { ...human('system injected'), data: { source: { kind: 'tool' } } },
    { type: RECORD, data: hint }, human(hint.text, 4), human('请按方案开始，先验证数据。', 5)], 's');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(m => m.manual), [true, false, true]);
});
test('retrieves similar task follow-ups and recent style without old unrelated habits', () => {
  const current = messagesOf([human('为酶筛选结果做统计图'), answer], 'current');
  const history = messagesOf([human('请给酶筛选结果做统计图'), human('请使用 R，并输出 SVG。', 4)], 'past');
  const input = JSON.parse(makeInput(current, [...history, { role: 'user', manual: true, time: 0, text: 'obsolete' }], now));
  assert.equal(input.similarTasks[0].next, '请使用 R，并输出 SVG。');
  assert(!input.recentStyle.includes('obsolete'));
});
test('rejects malformed, secret-bearing, excessive output and stale projection', () => {
  for (const text of ['one\ntwo', 'a'.repeat(241), 'api_key=secretvalue', '1. choice']) assert.equal(cleanSuggestion(text), '');
  assert.equal(cleanSuggestion('“可以，开始吧。”'), '可以，开始吧。');
  assert.deepEqual(reduceSuggestion(null, { type: RECORD, data: hint }), hint);
  assert.equal(reduceSuggestion(hint, human('new')), null);
  assert.equal(reduceSuggestion(hint, end), null);
});

async function harness({ hold = false, historyEnabled = true } = {}) {
  const handlers = new Map(), cleanup = [], records = [], calls = [];
  let release;
  const gate = hold ? new Promise(r => { release = r; }) : Promise.resolve();
  const session = { id: 'one', header: {}, requestHeader: () => ({ config: { provider: 'test', model: 'test' } }) };
  let historyReads = 0;
  const ctx = {
    effect: f => cleanup.push(f()), on: (name, f) => handlers.set(name, f),
    sessions: { get: () => session },
    sessionProjections: { register: async () => {} },
    sessionQuery: {
      observeSession: async () => ({ events: [human('请给我一个方案'), answer], [Symbol.dispose]() {} }),
      listSessions: async () => { historyReads++; return []; }
    },
    llm: { prepareCall: async (route, signal) => ({ config: route, stream: async function* (options) {
      calls.push(options); await gate; yield { text: hint.text };
    } }) }
  };
  class Assembler { finish = { kind: 'stop' }; push(chunk) { this.text = chunk.text; } blocks() { return [{ type: 'text', text: this.text }]; } }
  await start(ctx, { enabled: true, historyEnabled, historySessionLimit: 30, historyDays: 30,
    timeoutMs: 1000, maxSuggestionChars: 240 }, { schema: {}, BlockAssembler: Assembler,
    createUserMessage: x => x, appendPluginRecord: (s, type, data) => records.push({ type, data }) });
  return { emit: e => handlers.get('session/event')(session, e), records, calls,
    release: () => release?.(), historyReads: () => historyReads,
    dispose: () => Promise.all(cleanup.map(f => f())) };
}
const tick = () => new Promise(r => setImmediate(r));
test('generates once on a completed turn, and history toggle suppresses cross-chat reads', async () => {
  const h = await harness({ historyEnabled: false });
  h.emit({ ...end, data: { reason: { kind: 'aborted' } } }); await tick();
  assert.equal(h.calls.length, 0);
  h.emit(end); await tick();
  assert.equal(h.records.length, 1); assert.equal(h.historyReads(), 0);
  assert.equal(h.calls[0].purpose, 'nextline'); assert.equal(h.calls[0].tools, undefined);
  await h.dispose();
});
test('drops a late response after new input instead of overwriting the next turn', async () => {
  const h = await harness({ hold: true }); h.emit(end); await tick();
  h.emit(human('new')); h.release(); await tick();
  assert.equal(h.records.length, 0); await h.dispose();
});
test('disposal aborts outstanding work and never publishes afterward', async () => {
  const h = await harness({ hold: true }); h.emit(end); await tick();
  const done = h.dispose(); h.release(); await done;
  assert.equal(h.records.length, 0);
});
