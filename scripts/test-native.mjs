// Isolated test using the actual installed DSH browser bundle and Lexical editor.
// No application restart, user session writes, or credentials are needed.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const [runtime, playwrightPath] = process.argv.slice(2);
if (!runtime || !playwrightPath) throw new Error('Usage: node scripts/test-native.mjs <DSH node_modules> <playwright module path>');
const modules = resolve(runtime);
const assets = join(modules, '@deepseek-ai/dsh-web-frontend/dist/assets');
const { readdir } = await import('node:fs/promises');
const main = (await readdir(assets)).find(n => /^index-.*\.js$/.test(n));
const original = await readFile(join(assets, main), 'utf8');
const factory = /function (\w+)\(\)\{return\{react:/.exec(original);
assert(factory, 'DSH static-module factory changed; update this test adapter');
const cut = original.indexOf('}}', factory.index) + 2;
const staticModuleCode = original.slice(0, cut) + `;window.nativeModules=${factory[1]}();`;
let composer = await readFile(join(modules, '@deepseek-ai/dsh-client-ui-conversation/lib/client.js'), 'utf8');
composer = composer.replace('exports.apply = apply;', 'exports.TestShell = SessionInputShell; exports.TestEditor = DraftEditor; exports.TestCSS = InputBar_module_css_default; exports.apply = apply;');
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
    if (name === 'native.js') return res.end(staticModuleCode);
    if (name === 'composer.js') return res.end(composer);
    if (name === 'nextline.js') return res.end(client);
    if (/^vendor-[\w-]+\.js$/.test(name)) return res.end(await readFile(join(assets, name)));
    if (name) { res.statusCode = 404; return res.end(); }
    res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;background:#f5f6f8;color:#171717;margin:60px}main{max-width:720px;margin:auto}.box{background:white;border:1px solid #ddd;border-radius:16px;padding:20px;position:relative}h1{font-size:24px}p{color:#666}:root{--dsh-content-font-size:16px;--dsw-alias-label-tertiary:#969696;--dsw-alias-label-primary:#171717} [contenteditable]{outline:none;min-height:28px} .GRgSLq_grow{position:relative}</style></head><body><main><h1>NextLine · DSH 原生编辑器验证</h1><p>AI 回复完成后，Tab 或 → 采纳建议，可编辑后发送。</p><div class="box" id="mount"></div></main></body></html>');
  } catch { res.statusCode = 500; res.end('Test asset error'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ url: '/native.js', type: 'module' });
  await page.waitForFunction(() => window.nativeModules);
  await page.evaluate(() => { window.__ModuleLoader__ = { load: ({ id, factory }) => { nativeModules[id] = factory(name => {
    if (!nativeModules[name]) throw new Error(`Missing test module: ${name}`); return nativeModules[name];
  }); } }; });
  await page.addScriptTag({ url: '/composer.js' }); await page.addScriptTag({ url: '/nextline.js' });
  await page.evaluate(() => {
    const React = nativeModules.react, ReactDOM = nativeModules['react-dom/client'];
    const native = nativeModules['@deepseek-ai/dsh-client-ui-conversation'];
    const store = value => ({ getSnapshot: () => value, subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
      listeners: new Set(), set(v) { value = v; for (const f of this.listeners) f(); } });
    window.session = store({ running: false, removed: false });
    window.source = store(null);
    window.shell = new native.TestShell({ inputTriggers: () => undefined, inbox: store({}),
      submissionState: () => ({ running: false }), defaultSink: () => { throw Error('must not send'); } });
    function Editor() {
      const input = React.useSyncExternalStore(fn => shell.state.subscribe(fn), () => shell.state.getSnapshot());
      return React.createElement(native.TestEditor, { classNames: native.TestCSS, editor: shell.editor,
        scrollRef: React.useRef(null), editable: true, editorDisabled: false, phase: input.phase,
        placeholderText: '输入消息…', ariaLabel: '消息', hint: null, showPlaceholder: !input.draft });
    }
    window.reactRoot = ReactDOM.createRoot(document.getElementById('mount')); reactRoot.render(React.createElement(Editor));
    window.attach = () => nativeModules['dsh-nextline'].attachGhost(shell, session, source);
    window.nextTurn = seq => { session.set({ running: true }); shell.setDraft(''); source.set(null);
      session.set({ running: false }); source.set({ text: '请结合我之前的要求，把方案整理成可执行的步骤。', turnSeq: seq, createdAt: Date.now() }); };
  });
  const editor = page.locator('[contenteditable=true]'); await editor.waitFor();
  await page.evaluate(() => { window.detach = attach(); nextTurn(1); });
  await page.locator('[data-nextline-ghost]:visible').waitFor();
  assert.equal(await page.evaluate(() => shell.state.getSnapshot().draft), '');
  await mkdir(new URL('../work/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../work/native-ghost.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  await editor.focus(); await page.keyboard.press('Tab');
  assert.match(await page.evaluate(() => shell.state.getSnapshot().draft), /可执行/);
  await page.keyboard.type(' test');
  assert.match(await page.evaluate(() => shell.state.getSnapshot().draft), /test/);
  await page.evaluate(() => nextTurn(2)); await editor.focus(); await page.keyboard.press('ArrowRight');
  assert.match(await page.evaluate(() => shell.state.getSnapshot().draft), /可执行/);
  await page.evaluate(() => nextTurn(3)); await editor.focus();
  await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-nextline-ghost]:visible').count(), 0);
  await page.evaluate(() => nextTurn(4));
  await editor.dispatchEvent('compositionstart');
  await editor.dispatchEvent('keydown', { key: 'Tab', isComposing: true });
  assert.equal(await page.evaluate(() => shell.state.getSnapshot().draft.replace(/\u200b/g, '')), '');
  assert.equal(await page.locator('[data-nextline-ghost]:visible').count(), 0);
  await editor.dispatchEvent('compositionend');
  await page.evaluate(() => { nextTurn(5); source.set(null); });
  await editor.focus(); await page.keyboard.type('my draft');
  await page.evaluate(() => source.set({ text: '迟到建议', turnSeq: 5, createdAt: Date.now() }));
  assert.equal(await page.locator('[data-nextline-ghost]:visible').count(), 0);
  assert.equal(await page.evaluate(() => shell.state.getSnapshot().draft), 'my draft');
  await page.evaluate(() => { detach(); });
  assert.equal(await page.locator('[data-nextline-ghost], [data-nextline-owner]').count(), 0);
  await page.evaluate(() => { window.detach = attach(); nextTurn(6); });
  assert.equal(await page.locator('[data-nextline-ghost]:visible').count(), 1);
  await page.evaluate(() => { detach(); shell.dispose(); reactRoot.unmount(); });
  assert.deepEqual(errors, []);
  const report = { dsh: JSON.parse(await readFile(join(modules, '@deepseek-ai/dsh-client-ui-conversation/package.json'))).version,
    passed: ['native Lexical editor', 'ghost is not draft', 'Tab', 'ArrowRight', 'editable accepted text', 'Escape', 'IME', 'late response', 'cleanup', 'remount'],
    scope: 'Actual DSH editor components in an isolated test page; not the live desktop app.' };
  await writeFile(new URL('../work/native-test.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); server.close(); }
