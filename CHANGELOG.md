# Changelog

All notable changes to NextLine are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-12

First installable release.

### Added

- Personalized next-message ghost text in the DSH composer.
- Tab / → acceptance, Esc dismissal, and editable draft before sending.
- Current-conversation context plus bounded lexical retrieval from recent sessions.
- Host projection (`nextline`) and `plugin:nextline/suggestion` records for client synchronization.
- English and Chinese plugin metadata, icon, and one-image detail page.

### Fixed

- Resolve `@deepseek-ai/dsh-session` and `@deepseek-ai/dsh-llm` from the running DSH installation. A linked package's bundled runtime copy passed a different `Session` class to `appendPluginRecord` and was rejected by the host.
- Made suggestions faster: warm and cache the session list, read history in parallel with a 1.5-second cap and a 10-session default, tighten the prompt and context, and cap output at 192 tokens.
- Keep the package installable from Git: `lib/client.js` is committed, `prepare` rebuilds it, and `zod` / `@deepseek-ai/schemastery` are declared dependencies.

### Verified

- Six unit tests, including cancellation and disposal races.
- Host integration with a real Session, projection, and `appendPluginRecord` on DSH `0.2.2-rc.2` (deterministic model transport).
- Ten native editor checks on DSH `0.2.2-rc.1` (ghost text, Tab/→, editable text, Esc, IME, late results, cleanup, remount).
- Live Desktop / Web acceptance on DSH `0.2.2-rc.2`.
