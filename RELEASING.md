# Releasing NextLine

> **Do not push, tag, or publish until the repository owner explicitly approves.**
> This checkout has no remote and no published release. The commands below are a checklist for later.

## 1. Pre-flight

```powershell
npm test
npm run build
npm pack --dry-run
git status --short
```

Confirm:

- `lib/client.js` matches `src/client.js` (`npm run build` leaves a clean diff).
- The packed file list contains `src/`, `lib/client.js`, `cordis.patch.yml`, `locale/*.json`, `docs/`, `icon.svg`, `README.md`, `LICENSE`, and `CHANGELOG.md`.
- No `node_modules/`, `work/`, logs, session samples, or credentials are tracked.
- `locale/en.json` and `locale/zh.json` carry the current title, description, and detail paths.
- `docs/DETAIL.md` / `docs/DETAIL.zh.md` each contain exactly one image line, and `docs/preview.svg` exists.
- `engines.dsh` and the README compatibility sections match the DSH version you actually tested.

## 2. Version and changelog

1. Bump `version` in `package.json`.
2. Move the unreleased changelog entries under the new version in `CHANGELOG.md`.
3. Commit both together:

```powershell
git add package.json CHANGELOG.md
git commit -m "Release vX.Y.Z"
```

## 3. Create the annotated tag

```powershell
git tag -a vX.Y.Z -m "NextLine vX.Y.Z"
```

## 4. Push (only after approval)

Create the GitHub repository and push `main` with tags:

```powershell
gh repo create Basspoom/dsh-nextline --public --source . --remote origin --push
git push origin main --tags
```

Or, if the repository already exists:

```powershell
git remote add origin https://github.com/Basspoom/dsh-nextline.git
git push -u origin main --tags
```

## 5. Verify the Git install

Use a profile you can reset (or remove the plugin afterwards):

```powershell
dsh plugin --profile desktop add "github:Basspoom/dsh-nextline#vX.Y.Z"
```

Then in DSH:

1. Confirm **NextLine 下一句** is enabled and the Host row is active.
2. Complete a normal text turn; confirm a suggestion appears in the empty composer.
3. Check Tab, →, editing before send, Esc, direct typing, session switching, Chinese IME, and disabling the plugin.
4. Uninstall and confirm the ghost layer and listeners are gone.

A Git install runs `prepare`, which rebuilds `lib/client.js`. The committed bundle also supports installs with `--ignore-scripts`.

## 6. GitHub release

Create a release from the tag, paste the matching `CHANGELOG.md` section, and link the install command. Installing from a tag is preferred over `main` so users get a tested build.

## 7. npm (optional)

The plugin is installable from GitHub and does not require an npm release. If you also publish it:

```powershell
npm publish --access public
```

Check the package name first and keep the `dsh` manifest fields. Do not publish `work/` or local session data.
