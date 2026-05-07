# Publish & CI hook-up plan

End-to-end checklist for taking `hook-o-gnese` from `mvp-implementation` branch to a tagged release on JSR + npm with green CI.

**Prereqs you (the human) must do before any of this:**
- Decide the real npm/JSR scope (replaces `@your-scope`)
- Have a GitHub repo created (e.g. `your-scope/hook-o-gnese`)
- Have npm + JSR accounts with publish rights to that scope
- Local `deno` ≥ 2, `node` ≥ 20.18, `npm` ≥ 10

---

## Phase A — Scope rename (one-shot find/replace)

The placeholder `@your-scope` appears in code, docs, and config. Pick the real scope (call it `@actualscope`) and replace.

**Files to edit:**
- `package.json` — `"name": "@actualscope/hook-o-gnese"`
- `deno.json` — `"name": "@actualscope/hook-o-gnese"`
- `src/index.ts` — `recommended.jsPlugins` path: `"./node_modules/@actualscope/hook-o-gnese/dist/index.mjs"` (also fix `.js` → `.mjs` to match the bundle)
- `README.md` — every `@your-scope` instance + GitHub URL `your-scope/hook-o-gnese`
- `docs/cli.md`, `docs/rule-reference.md` — `@your-scope` references
- `.github/workflows/ci.yml` — npm smoke test uses `your-scope-hook-o-gnese-*.tgz` tarball name; the `npm pack` output is `<scope-without-@>-<name>-<version>.tgz`, so update to `actualscope-hook-o-gnese-*.tgz`
- `tests/integration/*.ts` — grep for `@your-scope`
- Any SARIF `informationUri` in `src/formatters/sarif.ts` pointing at `github.com/your-scope/...`

**Single command to find them all:**
```bash
grep -rln "your-scope" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=bin --exclude-dir=.git
```

**Verify after rename:**
```bash
deno task test           # 53 tests must still pass
deno run -A npm:tsdown   # bundle still builds
deno publish --dry-run   # JSR still happy
```

Commit: `chore: replace @your-scope placeholder with @actualscope`.

---

## Phase B — GitHub remote setup

```bash
# Create GitHub repo at github.com/actualscope/hook-o-gnese (manual, via gh or web UI)
gh repo create actualscope/hook-o-gnese --public --source=. --remote=origin
git remote -v   # verify origin set
```

---

## Phase C — Branch consolidation

The work is on `mvp-implementation`. Consolidate to `master` (the repo's default branch).

```bash
git checkout master
git merge --ff-only mvp-implementation   # fast-forward only; no merge commit
# If FF fails (master diverged), rebase mvp-implementation onto master first
git branch -d mvp-implementation         # delete local branch after merge
```

**Tag is already at v0.0.1** (created in Task 21 Step 4, on the merged commit after FF).

---

## Phase D — First push (CI bake)

```bash
git push -u origin master
git push origin v0.0.1
```

Watch the CI run at `https://github.com/actualscope/hook-o-gnese/actions`. The workflow has three jobs:

1. **`test`** (ubuntu): `deno fmt --check`, `deno task test`, `tsdown`, `deno publish --dry-run`
2. **`smoke-cli-binary`** (ubuntu/macos/windows matrix): `deno task build:bin` then `--help` + run on a fixture
3. **`smoke-npm`** (ubuntu): `tsdown`, `npm pack`, install in `/tmp/smoke`, exercise lib import + `npx hook-o-gnese`

**Likely issues on first push (and fixes):**

- **Windows binary path** — `deno compile` on windows produces `bin/hook-o-gnese.exe`. The workflow runs `./bin/hook-o-gnese --help`. On windows shell that may need `./bin/hook-o-gnese.exe` or a step-level `shell: bash`. **Fix:** set `shell: bash` on the windows steps so `./bin/hook-o-gnese` resolves either binary.
- **`deno fmt --check`** may flag files we haven't formatted. **Fix:** run `deno fmt` locally and commit the diff before pushing.
- **JSR slow-types check** caught us once already in Task 17. If `deno publish --dry-run` complains, add explicit return types to whatever it points at.

**Do not proceed to Phase E until all three jobs are green.** No publishing on broken CI — that's how Vought wins.

---

## Phase E — npm publish

npm publishes from a clean tarball, not from git.

```bash
# 1. Clean build
rm -rf dist node_modules
deno install   # pulls all peers

# 2. Build the bundle
deno run -A npm:tsdown
ls dist/   # should contain index.mjs, cli.mjs, engine.mjs + their .d.mts

# 3. Verify pack contents
npm pack --dry-run
# Expected: package.json, README.md, LICENSE, dist/**

# 4. Smoke-test the tarball locally one more time
npm pack
mkdir /tmp/he-final && cd /tmp/he-final && npm init -y
npm install $OLDPWD/actualscope-hook-o-gnese-0.0.1.tgz
node -e "import('@actualscope/hook-o-gnese').then(m => console.log(Object.keys(m.default.rules)))"
# Expected: [ 'no-fat-effects', 'state-scatter', 'hook-coupling', 'custom-hook-depth' ]
npx hook-o-gnese --help
cd - && rm -rf /tmp/he-final actualscope-hook-o-gnese-0.0.1.tgz

# 5. Login + publish
npm login
npm publish --access public
```

**Verify it landed:** `npm view @actualscope/hook-o-gnese`. Tarball URL should resolve, version should match.

---

## Phase F — JSR publish

JSR publishes from source, not a bundle.

```bash
# 1. Final dry run
deno publish --dry-run
# Expected: include list = src/, deno.json, README.md, LICENSE only
# NOT included: tests/, scripts/, tsdown.config.ts, tsconfig.json, *.test.ts (per deno.json publish.exclude)

# 2. Login + publish
deno publish
# Will open browser for OAuth flow on first run
```

**Verify:** visit `https://jsr.io/@actualscope/hook-o-gnese`. Module should be browseable, doc symbols should render.

---

## Phase G — GitHub release

Tie the v0.0.1 tag to a GitHub release with binaries attached so people who can't run `deno compile` themselves can still grab the standalone binary.

```bash
# 1. Build cross-platform binaries locally
mkdir -p release
deno compile --allow-read --allow-env --allow-sys --allow-ffi \
  --target x86_64-unknown-linux-gnu --output release/hook-o-gnese-linux-x64 src/cli.ts
deno compile --allow-read --allow-env --allow-sys --allow-ffi \
  --target x86_64-apple-darwin --output release/hook-o-gnese-macos-x64 src/cli.ts
deno compile --allow-read --allow-env --allow-sys --allow-ffi \
  --target aarch64-apple-darwin --output release/hook-o-gnese-macos-arm64 src/cli.ts
deno compile --allow-read --allow-env --allow-sys --allow-ffi \
  --target x86_64-pc-windows-msvc --output release/hook-o-gnese-windows-x64.exe src/cli.ts

# 2. Compress (binaries are ~180MB each; gz them)
gzip -9 release/hook-o-gnese-*

# 3. Create the release
gh release create v0.0.1 \
  --title "v0.0.1 — initial release" \
  --notes-file CHANGELOG.md \
  release/*.gz
```

(Optional v1.5: automate this in CI by adding a `release` job triggered on tag push.)

---

## Phase H — Post-publish smoke

```bash
# In a fresh directory unrelated to the repo
cd /tmp && mkdir live-smoke && cd live-smoke

# npm path
npm init -y
npm install @actualscope/hook-o-gnese
echo 'import { useEffect, useState } from "react"; export function X() { const [a,b,c,d,e,f,g] = [useState(0),useState(0),useState(0),useState(0),useState(0),useState(0),useState(0)]; return null; }' > src.tsx
npx hook-o-gnese src.tsx
# Expected: state-scatter warning fires

# JSR path
deno run -A "jsr:@actualscope/hook-o-gnese/cli" src.tsx
# Expected: same warning fires
```

If both fire, it's properly shipped.

---

## Branch protection (recommended after first publish)

Once master is the canonical branch:

```bash
gh api -X PUT repos/actualscope/hook-o-gnese/branches/master/protection \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["test", "smoke-cli-binary (ubuntu-latest)", "smoke-npm"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

Now nothing lands on master without green CI. The supes don't get to push broken code.

---

## Rollback plan

If v0.0.1 turns out to be diabolical and needs unpublishing:

```bash
# Within 72 hours of publish, npm allows unpublish:
npm unpublish @actualscope/hook-o-gnese@0.0.1

# JSR doesn't support unpublish — you'd publish 0.0.2 with the fix.
```

Better play: don't ship broken code. That's what the CI gates are for.

---

## Sign-off checklist (tick before announcing)

- [ ] All `@your-scope` placeholders replaced
- [ ] `master` is FF-merged from `mvp-implementation`, branch deleted
- [ ] CI green on master and on the v0.0.1 tag
- [ ] `npm view @actualscope/hook-o-gnese` resolves with v0.0.1
- [ ] `https://jsr.io/@actualscope/hook-o-gnese` renders
- [ ] GitHub release created with cross-platform binaries
- [ ] Live smoke (Phase H) passes from npm AND JSR
- [ ] Branch protection enabled on master
- [ ] README badges resolve (npm, JSR, CI, license)
