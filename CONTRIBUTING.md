# Contributing to NextLine

Thanks for helping improve NextLine. This project is a DeepSeek Harness (DSH) Web/Desktop plugin; it is not a standalone application.

## Before you start

- Node.js 22+.
- DSH `0.2.2-rc.2` through `0.3.0` (exclusive) if you want to try the plugin in the real UI.
- No API key is needed to run the unit tests. A working DSH model route is needed only for a live suggestion.

## Local checks

The build and tests need no `npm install`:

```powershell
npm run build
npm test
npm pack --dry-run
```

`npm run build` regenerates `lib/client.js` from `src/client.js`. Commit both files together; CI checks that the generated file is current.

Optional compatibility checks (pass a readable DSH `node_modules` directory):

```powershell
node scripts/check-compat.mjs "<DSH node_modules>"
node scripts/test-host.mjs "<DSH node_modules>"
node scripts/test-native.mjs "<DSH node_modules>" "<playwright module path>"
```

## Try a change in DSH

From a fresh checkout, install the two runtime dependencies first (a local link install does not install them):

```powershell
npm install
dsh plugin --profile desktop add "<absolute path to this checkout>"
```

Restart DSH or reload the plugin after changing Host code. The client bundle is served from `lib/client.js`; rebuild it before reloading the page.

## Code layout

| Path | Responsibility |
| --- | --- |
| `src/index.js` | Plugin entry, `Config`, host-library resolution |
| `src/host.js` | Lifecycle, turn listener, history retrieval, model call, record write |
| `src/core.js` | Pure message filtering, lexical retrieval, output cleaning, projection reducer |
| `src/client.js` | Composer adapter, ghost layer, keyboard and IME handling |
| `test/` | Unit and lifecycle-race tests |

Keep the host and client halves separable: `src/host.js` intentionally avoids direct DSH imports so lifecycle tests can run without a DSH installation. Do not write into the editor DOM or replace DSH components.

## Pull request checklist

- [ ] `npm test` passes.
- [ ] `npm run build` leaves `lib/client.js` current.
- [ ] `npm pack --dry-run` shows the runtime files, locale, docs, and icon.
- [ ] No `node_modules/`, `work/`, session samples, logs, or credentials are included.
- [ ] User-visible text is available in both `locale/en.json` and `locale/zh.json`.
- [ ] The change is described in `CHANGELOG.md` under an unreleased heading or the next version.
- [ ] If the change affects the composer or session APIs, the compatibility notes in `README.md` and `README.en.md` are updated.

## Style

- Plain ESM, no bundler dependency for `src/`.
- Keep comments about DSH coupling close to the adapter that owns it.
- Prefer bounded work (timeouts, row limits) over unbounded history scans.
- Never log conversation text or credentials to a file, issue, or pull request.

## License

By contributing, you agree that your contribution is licensed under the MIT License in [LICENSE](LICENSE).
