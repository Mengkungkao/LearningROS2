# Releasing

Versions live in three files that must always agree:

| File | Field |
|---|---|
| `VERSION` | the bare version string |
| `package.json` | `"version"` |
| `js/version.js` | `APP_INFO.version` (this is what the UI shows) |

## Steps

1. Bump those three files.
2. Add a section to `CHANGELOG.md`.
3. `npm test` — the suite must be 50/50 with no page errors.
4. Commit: `Release vX.Y.Z: <one line>`
5. Tag and push:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z — <one line>"
git push origin HEAD
git push origin vX.Y.Z
```

## A note on tags

The commits were authored in a sandboxed environment whose git proxy rejects
pushes to `refs/tags/*` with HTTP 403 — it only accepts the working branch. So
the tags below are **not on the remote yet**. Each version's commit is recorded
here; to create the tags, clone the repo and run:

```bash
git tag -a v1.0.0 e82ee11 -m "v1.0.0 — the first complete course: 24 lessons, zero to custom message types"
git push origin --tags
```

| Version | Commit | Summary |
|---|---|---|
| v1.3.0 | `854790c` | QoS in the simulator, plus QoS and namespace lessons |
| v1.2.0 | `55fa87e` | Challenge mode: 12 open-ended puzzles |
| v1.1.0 | `2e8fbbb` | Syntax highlighting and a live read of your code |
| v1.0.0 | `e82ee11` | First complete course: 24 lessons, zero to custom message types |
