import { SYSTEM, RECORD, messagesOf, makeInput, cleanSuggestion, reduceSuggestion } from './core.js';

// Kept separate from DSH imports so lifecycle/race checks run without installing DSH.
export async function start(ctx, config, api) {
  if (!config.enabled) return;
  for (const [service, method] of [['sessionQuery', 'observeSession'], ['sessionQuery', 'listSessions'],
    ['sessionProjections', 'register'], ['llm', 'prepareCall'], ['sessions', 'get']]) {
    if (typeof ctx[service]?.[method] !== 'function') {
      console.warn(`[NextLine] Disabled: missing ${service}.${method}`);
      return;
    }
  }
  const life = new AbortController(), active = new Map(), cache = new Map(), pending = new Set();
  ctx.effect(() => async () => {
    life.abort();
    for (const job of active.values()) job.abort();
    await Promise.allSettled([...pending]);
    cache.clear();
  });
  await ctx.sessionProjections.register({ key: 'nextline', stateVersion: 1,
    stateSchema: api.schema, init: () => null, apply: reduceSuggestion,
    wire: { viewSchema: api.schema, view: state => state } });

  async function read(id, signal) {
    const lease = await ctx.sessionQuery.observeSession(id, { signal, projectionMode: 'none' });
    try { return messagesOf(lease.events, id); }
    finally { lease[Symbol.dispose](); }
  }
  async function history(session, signal) {
    if (!config.historyEnabled) return [];
    // Cross-session retrieval is optional context. Bound it so a slow corpus never
    // consumes the suggestion's whole budget; partial rows are still useful.
    const budget = new AbortController();
    const timer = setTimeout(() => budget.abort(new Error('history budget')),
      Math.max(1000, Math.min(5000, config.timeoutMs - 2000)));
    const bounded = AbortSignal.any([signal, budget.signal]);
    try {
      let listed;
      try {
        listed = await ctx.sessionQuery.listSessions(bounded);
      } catch (error) {
        if (signal.aborted) throw error;
        return [];
      }
      const candidates = listed.filter(r => r.header.id !== session.id && r.header.origin !== 'subagent')
        .toSorted((a, b) => Number(b.live) - Number(a.live)).slice(0, config.historySessionLimit);
      const allowed = new Set(candidates.map(r => r.header.id));
      for (const id of cache.keys()) if (!allowed.has(id)) cache.delete(id);
      const result = [];
      for (const record of candidates) {
        if (bounded.aborted) break;
        const id = record.header.id, old = cache.get(id);
        try {
          const cached = old && !record.live && Date.now() - old.at < 300000;
          const rows = cached ? old.rows : await read(id, bounded);
          const human = rows.filter(m => m.role === 'user').slice(-40);
          cache.set(id, { at: cached ? old.at : Date.now(), rows: human });
          result.push(...human);
        } catch (error) {
          if (signal.aborted) throw error;
          if (bounded.aborted) break;
          // A missing/corrupt history must not stop the current suggestion.
        }
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  async function generate(session, end, controller) {
    const signal = AbortSignal.any([life.signal, controller.signal, AbortSignal.timeout(config.timeoutMs)]);
    const current = await read(session.id, signal);
    if (!current.some(m => m.role === 'user') || current.at(-1)?.role !== 'assistant') return;
    const route = session.requestHeader?.()?.config;
    const provider = config.provider || route?.provider, model = config.model || route?.model;
    if (!provider || !model) return;
    const histories = await history(session, signal);
    const input = makeInput(current, histories, Date.now(), config.historyDays);
    const call = await ctx.llm.prepareCall({ provider, model, maxTokens: 384 }, signal,
      (controls, info) => ({ ...controls, ...(info.reasoning?.efforts?.[0]?.id === undefined ? {} :
        { reasoningEffort: info.reasoning.efforts[0].id }) }));
    signal.throwIfAborted();
    const assembler = new api.BlockAssembler();
    for await (const chunk of call.stream({ ...call.config, system: SYSTEM,
      messages: [api.createUserMessage({ content: [{ type: 'text', text: input }], source: { kind: 'dsh-nextline' } })],
      sessionId: session.id, purpose: 'nextline', signal })) {
      signal.throwIfAborted();
      assembler.push(chunk);
    }
    signal.throwIfAborted();
    if (assembler.finish?.kind !== 'stop') return;
    const blocks = assembler.blocks();
    if (blocks.some(b => b.type === 'tool-call')) return;
    const text = cleanSuggestion(blocks.filter(b => b.type === 'text').map(b => b.text).join(''), config.maxSuggestionChars);
    if (!text || active.get(session.id) !== controller || ctx.sessions.get(session.id) !== session) return;
    api.appendPluginRecord(session, RECORD, { text, turnSeq: end.seq, createdAt: Date.now() });
  }
  ctx.on('session/event', (session, event) => {
    if (['user/message', 'turn/start'].includes(event.type)) active.get(session.id)?.abort();
    if (event.type !== 'turn/end' || event.data?.reason?.kind !== 'completed' || session.header.origin === 'subagent') return;
    active.get(session.id)?.abort();
    const controller = new AbortController();
    active.set(session.id, controller);
    // Defer until the current event publication finishes; appending inside it is forbidden.
    const task = Promise.resolve().then(() => generate(session, event, controller)).catch(() => {
      if (!controller.signal.aborted && !life.signal.aborted) console.warn('[NextLine] Suggestion unavailable (timeout, model or history API); chat is unaffected.');
    }).finally(() => {
      if (active.get(session.id) === controller) active.delete(session.id);
      pending.delete(task);
    });
    pending.add(task);
  });
  ctx.on('session/disposed', session => { active.get(session.id)?.abort(); cache.delete(session.id); });
}
