# Playground Sharing & Collaboration — Design Document

**Status:** Shipped end-to-end as of 2026-06-15. Real-git architecture, OAuth device flow via CORS proxy worker, OPFS-backed local saves, Pull-then-Publish workflow with 3-way diff3 merge, Monaco diff viewer for previewing changes.
**Scope:** Multi-user collaboration, project backup, and version history for the browser Playground, with **minimal infrastructure** — a single stateless Cloudflare Worker that holds no credentials.

> **Design history.** Four pivots:
>
> 1. **Drive → GitHub (2026-05-27).** Original Drive design failed the
>    `drive.file` cascade spike — a collaborator who picked a shared folder got
>    404 on files inside it that were uploaded by others. Stepping up to the
>    full `drive` scope would gate the app behind Google's CASA annual review.
> 2. **GitHub Releases → GitHub Contents API for blobs (2026-05-28).**
>    `uploads.github.com` doesn't set CORS headers, so browser uploads to
>    release assets are blocked at preflight. We moved blobs into the repo
>    itself, base64-encoded under `objects/<ab>/<hash>` via the Contents API.
> 3. **Custom-manifest layer → lean on real git (2026-05-28).** With GitHub as
>    a permanent backend, our hand-rolled `HEAD`-file + `commits/<sha256>.json`
>    + `objects/<ab>/<hash>` layer was double-bookkeeping the same things git
>    already records (refs, commits, trees, blobs). We collapsed it: files
>    live at their natural paths, each "fake commit" is a real git commit
>    written via the **Git Data API**, history is browseable on github.com,
>    and CAS comes from git's fast-forward rule on `updateBranch`.
> 4. **PAT paste → OAuth device flow via tiny CORS proxy (2026-06-15).**
>    `github.com/login/*` endpoints don't send CORS headers, but the device
>    flow's token endpoint accepts only `client_id` + `device_code` — no
>    `client_secret`. So we stand up a stateless Cloudflare Worker that
>    relays exactly those two endpoints with CORS headers attached. Holds
>    no credentials, stores nothing, ~150 lines total. Users get a real
>    "Sign in with GitHub" button + short-lived refreshable tokens; we
>    keep "zero-secrets-in-storage" except for the user-access token
>    itself (now in sessionStorage instead of localStorage).
>
> Each pivot reused most of the previous turn's UI code — the adapter and
> engine got rewritten in pivot 3; the auth surface got rewritten in pivot 4;
> but `monaco-gutter`, `line-diff`, `file-status`, `opfs-working-tree`,
> `diff3`, and the conflict-editor carried through unchanged.

---

## Table of contents

1. [Goals & non-goals](#1-goals--non-goals)
2. [Where we landed (and what we rejected)](#2-where-we-landed-and-what-we-rejected)
3. [Core model — three layers: working tree, local saves, remote git](#3-core-model)
4. [Repository layout on GitHub](#4-repository-layout-on-github)
5. [Wire types](#5-wire-types)
6. [Auth — OAuth device flow via CORS proxy](#6-auth--oauth-device-flow-via-cors-proxy)
7. [The GitAdapter interface](#7-the-gitadapter-interface)
8. [Operations & flows](#8-operations--flows)
9. [Concurrency & merge model](#9-concurrency--merge-model)
10. [Garbage collection & retention](#10-garbage-collection--retention)
11. [Integration with the existing Playground](#11-integration-with-the-existing-playground)
12. [Caveats & risks](#12-caveats--risks)
13. [Implementation phases](#13-implementation-phases)
14. [Testing strategy](#14-testing-strategy)
15. [Open questions](#15-open-questions)

---

## 1. Goals & non-goals

### Goals
- **Collaboration:** multiple people work on one project; each can see and contribute changes.
- **Backup:** a project's full state lives off-device and survives a browser/OPFS wipe.
- **Local checkpointing:** the user can hit Save often — fast, local, no network — and have a real "undo a session" affordance independent of publish.
- **Version history:** intentional, commit-like checkpoints on the remote with the ability to look back, diff, and restore.
- **Minimal infrastructure:** one stateless Cloudflare Worker that holds no credentials and serves only OAuth device-flow CORS relay. Free-tier, 100k req/day cap, auditable in ~150 lines.
- **One identity / one access model:** lean on GitHub's own auth and repo-collaborator permissions.

### Non-goals (for now)
- True real-time co-editing (CRDT/OT). We do checkpoint-based sync, not live cursors.
- Branches. The model supports them (the adapter takes a `branch` parameter); v1 is single-line history on `main`.
- True transactional atomicity. We get *effective* atomicity via git's own commit semantics + the fast-forward CAS rule.
- Server-side merge. All merging is client-side, line-level via diff3 for text and conflict-copies for binary (see §9).

---

## 2. Where we landed (and what we rejected)

**Decision: lean on GitHub as a real git host, with one CORS proxy worker for auth.** Each Fade workspace project maps to one GitHub repo. Project files live at their natural paths. Each **published commit** is a real git commit, written through the Git Data API. The Repo engine ([`src/sharing/repo.ts`](src/sharing/repo.ts)) orchestrates the writes; the adapter ([`src/sharing/github-adapter.ts`](src/sharing/github-adapter.ts)) is a thin wire wrapper. **Local saves** live in OPFS — they don't touch the network. Pull does the 3-way merge; Publish requires a fast-forwardable state.

### Alternatives considered

| Option | Why we rejected it |
|---|---|
| **Google Drive** | The cascade spike showed `drive.file` doesn't extend to a Picker-selected folder's children when uploaded by other collaborators. The fix (full `drive` scope) gates the app behind CASA. |
| **GitHub Releases for blobs (`uploads.github.com`)** | CORS-blocked on the uploads host. Worker proxy would work but is more infra than the path we took. |
| **Custom-manifest layer over GitHub Contents API** | Path B we shipped briefly. Worked, but duplicated everything git already stores (commits, trees, refs) and made the repo unbrowseable on github.com. |
| **GitHub + Git LFS** | LFS endpoints aren't browser-CORS. No browser LFS client exists. |
| **PAT-paste (forever)** | What we shipped initially. Works, but UX cliff (open settings, generate token, paste, hope you got the scopes right) + the token is long-lived and powerful. Replaced by device flow once we built the proxy. |
| **PKCE for the OAuth web flow** | GitHub shipped PKCE on 2025-07-14 — but `client_secret` is still listed as Required at the token-exchange endpoint, per their own docs. PKCE is defense-in-depth for existing backends, not a way to enable browser-only OAuth. |
| **OneDrive / Dropbox / Box** | Various combinations of: scope cascade questions, duplicated-quota in shared folders, smaller free tier, weaker browser-API posture, or a verification gate. |
| **S3 / R2 / B2 + signer Worker** | Real infra. Cleanest of the infra options if we ever cross that line. |

### Why "real git + device flow + tiny CORS proxy" won

- **No verification gate.** GitHub OAuth Apps and GitHub Apps both require no Marketplace listing for normal use. Personal Access Tokens require no app registration at all.
- **CORS is fine on `api.github.com`** — every Git Data API endpoint and `/user` works from a browser directly.
- **github.com browsability for free.** The repo looks like a normal project; collaborators can review history, see diffs, comment on commits without our app.
- **CAS via fast-forward.** `PATCH /git/refs/heads/{branch}` with `force: false` rejects (422) when the new commit isn't a descendant of the current ref. The Repo engine writes a commit whose parent IS the ref's expected value, so the FF check IS the compare-and-swap.
- **GC is GitHub's problem.** No app-side mark-and-sweep needed.
- **One tier on the server, two on the client.** Server side: just git. Client side: OPFS working tree + local saves (snapshots of OPFS, content-addressed in OPFS again).
- **Token blast radius is bounded.** Device flow → user-access token in `sessionStorage` (per-tab, cleared on close) → short-lived (~8h for `ghu_*` GitHub-App tokens; refreshed transparently). Even the OAuth-App `gho_*` tokens are scoped by whichever scope we request — `public_repo` if you want zero-private-data, `repo` if you need private repos.

### What we gave up

- **Pure zero-infra.** We now operate one Cloudflare Worker. It holds no secrets, has no state, but it does exist. We pay for the convenience of in-browser OAuth with that ~150-line worker.
- **Per-blob hash determinism across providers.** Our content-addressed sha256 is gone — git uses SHA-1 over a `blob ${size}\0${content}` envelope. Fine, just different.
- **100 MB per-blob cap.** The Git Data API caps blobs at 100 MB.

---

## 3. Core model

Three layers, ordered by "how often does this change":

| Concept | Lives in | Mutable? | Network? |
|---|---|---|---|
| **Working tree** — files the editor touches (`src.fbasic`, `assets/hero.png`) | **OPFS** (`workspace/<project>/…`) | yes (every keystroke; autosaved 600ms after idle) | no |
| **Local saves** — snapshots of the working tree, kept as a chain (newest first, capped at 10) | **OPFS** (`fade-saves/<project>.json` — one JSON file per project) | append-only from user POV; LRU-trimmed | no |
| **Repository** — git objects (blobs, trees, commits) + branch ref | **A real GitHub repository** | refs mutable, objects immutable | yes (per Save? **no**. Per Publish? yes.) |
| **Bridge — `sync-index`** — `path → blob SHA at last synced commit` | localStorage | rebuilt on every Pull / Publish | n/a |

The mental model is **two-tier client + remote**:

- **Save** = local snapshot. Hit it often; it's free, it's instant, it doesn't touch GitHub. Each Save captures the full OPFS state + the `treeHashes` (path → git-blob-sha) at save time. Used for "undo my last 5 minutes of work" and for the gutter's "this is what I've changed since I last saved" indication.
- **Publish** = squash + push. Takes everything that's accumulated locally (saves + current working tree) and writes it as a *single* git commit on the remote branch. After Publish, the local save chain is cleared — the published commit captures their net result.
- **Pull** = merge remote → working tree. If the working tree is clean, fast-forward. If dirty (unsaved edits OR unpublished saves OR both), runs a **3-way merge** in place: text via diff3 (with conflict markers for overlapping regions), binary via sibling conflict-copy. After Pull, the user resolves conflicts, then Publishes.

The user-facing chips (in the app header) reflect these layers:
- `● N unsaved` — working-tree diff vs latest save
- `↑ N unpublished` — local saves not yet rolled into a publish
- `↓ N remote` — remote-tree diff vs our last synced commit (detected by the 30s background poll)
- `⚠ N conflicts` — overlapping text or binary changes from the last merge, awaiting user resolution

Clicking any chip opens the Collaboration tab.

---

## 4. Repository layout on GitHub

The repo looks like a normal software project:

```
github.com/<owner>/<project>/
  README.md                  # boilerplate, not read by the engine
  fade.json                  # project manifest (Fade-specific, treated as any other text file)
  src.fbasic                 # source files at their natural paths
  assets/
    hero.png
    bounce.wav
  ...
```

There's no `HEAD` file, no `commits/` directory, no `objects/` directory. Git already records all of those. Open the repo on github.com and you'll see a normal commits feed, a normal file tree, and per-file blame / history that we get for free.

### Browser side (OPFS layout)

```
<opfs-root>/
  workspace/<project>/        # working tree — what the editor sees
    fade.json
    src.fbasic
    assets/hero.png

  fade-saves/<sanitized-key>.json    # save chains (one file per project)
```

Plus a **per-project sync index** in localStorage (under key `fade-sharing:project-v3:<projectName>`):

```ts
{
  remoteRepo: { owner, name, branch },
  syncedCommitSha: "<git commit sha at last sync>",
  syncedTreeSha:   "<git tree sha at that commit>",      // lets createTree use base_tree
  baseTree:        { "<path>": "<git blob sha>" }        // for status + conflict detection
}
```

The index is a **cache** — never authoritative. Losing it just means a re-clone or a re-walk of the branch HEAD.

### Local saves on OPFS

The earlier design stored saves in `localStorage`. That broke once any binary asset was included — base64 encoding inflates ~33% and localStorage's ~5MB quota fills almost immediately. We migrated to OPFS (gigabytes of capacity, browser-managed quota). One JSON file per project under `<opfs-root>/fade-saves/<sanitised-key>.json` containing the newest-first save chain. On first load, the panel runs a one-shot migration from any legacy localStorage save chains. See [`src/sharing/local-saves.ts`](src/sharing/local-saves.ts).

Each `LocalSave` record:
```ts
{
  id: '<timestamp>-<rand>',
  message: '...',              // user-typed or auto-generated ("Save 14:32 · ~2 +1 · main.fbasic, fade.json")
  time: '<ISO-8601>',
  files: { '<path>': '<base64>' },           // raw bytes per path
  treeHashes: { '<path>': '<git-blob-sha>' } // for fast unsaved-vs-saved comparison
}
```

A future optimization (called out in §15) is content-addressed dedup — `treeHashes` is already 90% of the way there — but the current design works fine for the typical playground size.

---

## 5. Wire types

The engine and adapter speak git's data model directly. The types live in [`src/sharing/git-types.ts`](src/sharing/git-types.ts):

```ts
interface GitTreeEntry {
    blobSha: string;          // git blob SHA-1
    size?: number;
    mode?: '100644' | '100755' | '120000';
}

type GitTree = Record<string, GitTreeEntry>;   // path → entry; flat, recursive

interface GitCommitMeta {
    sha: string;
    parents: string[];         // root commit has []; merges have 2+
    treeSha: string;
    message: string;
    author: string;
    time: string;              // ISO-8601
}

interface TreeDiff {
    added: string[];
    modified: string[];
    deleted: string[];
}
```

**Token types** ([`src/sharing/github-auth.ts`](src/sharing/github-auth.ts)):

```ts
interface TokenSet {
    accessToken: string;              // ghu_* (GitHub App) or gho_* (OAuth App)
    refreshToken?: string;            // ghr_* — exchange for a new access token; absent for non-expiring tokens
    expiresIn?: number;               // seconds until accessToken expires
    refreshTokenExpiresIn?: number;   // seconds until refreshToken expires
    scope?: string;
    tokenType?: string;               // 'bearer' typically
}

interface StoredTokenSet {            // persisted shape: relative expiries → absolute timestamps
    accessToken: string;
    refreshToken?: string;
    accessExpiresAt?: number;         // ms since epoch
    refreshExpiresAt?: number;
    scope?: string;
    tokenType?: string;
}
```

**Hashing.** Blob SHAs are git's standard `sha1("blob " + length + "\0" + bytes)`. Computed locally by [`gitBlobSha`](src/sharing/hash.ts) so the file-status and conflict-detection paths don't need to upload to find out whether content changed.

---

## 6. Auth — OAuth device flow via CORS proxy

### Identity
Each user authenticates with their own GitHub account through the OAuth device flow. No PAT pasting; no copying tokens out of github.com settings.

### The CORS landscape (still annoying)

| Host | CORS? |
|---|---|
| `api.github.com` | ✅ |
| `uploads.github.com` | ❌ (irrelevant — Git Data API is on api.github.com) |
| `github.com/login/device/code` | ❌ |
| `github.com/login/oauth/access_token` | ❌ |

The web OAuth flow is still browser-impossible (GitHub didn't ship a way to drop `client_secret`, even with PKCE). The device flow is technically fine — its protocol uses only `client_id` + `device_code`, no secret — but `github.com/login/*` doesn't send CORS headers, so a browser fetch is blocked by the user agent before the request leaves.

### The fix: a tiny CORS proxy worker

Live at [`oauth-proxy/`](../oauth-proxy/) — a stateless Cloudflare Worker that relays exactly two endpoints. ~150 lines including comments. It:

- **Holds no secrets.** No `client_secret`, no `client_id` (the client passes it), nothing in storage.
- **Stores no state.** No KV, no D1, no cookies. Requests flow through once and are forgotten.
- **Path-allowlists.** Only `/login/device/code` and `/login/oauth/access_token` are relayed; anything else returns 403.
- **Origin-allowlists.** Configured via `ALLOWED_ORIGINS` var in `wrangler.toml`. Supports exact match (`https://playground.example.com`) and per-host port wildcards (`http://localhost:*`).
- **Logs rejected origins** via `console.warn` so `wrangler tail` makes CORS mismatches a 2-second diagnosis.

Deploy: `npx wrangler login && npx wrangler deploy` from `oauth-proxy/`. Free tier covers 100k req/day.

### The full sign-in flow

1. User clicks **Sign in with GitHub** in the Collaboration panel.
2. Client (`auth-ui.ts`) calls `requestDeviceCode({ clientId, scope })` against the proxy.
3. Proxy relays to `github.com/login/device/code`; returns `{ user_code, verification_uri, device_code, expires_in, interval }`.
4. Dialog shows the `user_code` in a big copyable box + an "Open GitHub →" button that opens `verification_uri` in a new tab.
5. User authorizes on github.com (or denies / closes / lets it expire).
6. Client polls `requestForToken` against the proxy every `interval` seconds. Proxy relays to `github.com/login/oauth/access_token`.
7. On success: returns `{ access_token, refresh_token, expires_in, refresh_token_expires_in, scope, token_type }`.
8. Client wraps it in `StoredTokenSet` (relative expiries → absolute timestamps), persists to `sessionStorage` under `fade-playground:github-token-set:v1`.
9. Client calls `validateToken(accessToken)` against `api.github.com/user` (no proxy needed — `api.github.com` has CORS). Stores `{ login, id, scopes }` for the signed-in indicator.

### Token refresh

Access tokens are short-lived (`ghu_*` from GitHub Apps default to 8 hours; `gho_*` from OAuth Apps are long-lived but can still be revoked). The panel's `ensureFreshAccessToken()` helper:

1. Loads `StoredTokenSet` from sessionStorage.
2. If `accessExpiresAt` is within 60s of now AND `refreshToken` is still good → calls `refreshAccessToken({ clientId, refreshToken })` against the proxy with `grant_type=refresh_token`. Persists the new pair.
3. If refresh fails or `refreshToken` is also expired → wipes the store, returns null. Next user action shows the sign-in dialog.

`buildRepo()` (the engine builder) is async and awaits `ensureFreshAccessToken` on every call. Every adapter operation gets a fresh token transparently.

### Config

Two constants pinned at build time, both public information:

```ts
// src/sharing/github-auth-config.ts
export const OAUTH_PROXY_BASE_URL = 'https://fade-oauth-proxy.<account>.workers.dev';
export const GITHUB_APP_CLIENT_ID = 'Ov23li...';  // OAuth App; or 'Iv23...' for GitHub App
export const GITHUB_OAUTH_SCOPE   = 'repo';       // 'public_repo' for narrower; '' for GitHub Apps
```

OAuth App vs GitHub App is a config choice. We currently ship with an OAuth App + `repo` scope. The trade-offs (and the narrower options — `public_repo`, GitHub App with `Contents:RW + Administration:RW`, GitHub App with `Contents:RW`-only) are documented inline at the config module. GitHub-App migration is a path we know works — the `ghu_*` token shape, the 8h-with-refresh lifecycle, and the proxy already handle it; you'd update two config values and pick an install scope on your App's settings page.

### Storage decision: sessionStorage, not localStorage

`sessionStorage` clears when the tab closes and is isolated per tab. Combined with short-lived tokens via refresh, the worst-case credential lifetime is bounded by *whichever ends first* — tab close, browser restart, or `refreshExpiresAt`. The legacy `localStorage` PAT key is migrated once and removed on first load (see `SessionTokenStore.load`).

---

## 7. The GitAdapter interface

[`src/sharing/adapter.ts`](src/sharing/adapter.ts) defines the surface. The Repo engine talks only through this; tests use `MockAdapter`, production uses `GitHubAdapter`.

```ts
interface GitAdapter {
    // ─── reads ───
    branchHead(): Promise<string | null>;
    getCommit(sha: string): Promise<GitCommitMeta>;
    getTree(commitSha: string): Promise<GitTree>;      // does commit → tree resolution
    getBlob(blobSha: string): Promise<Uint8Array>;

    // ─── writes (Git Data API) ───
    createBlob(bytes: Uint8Array): Promise<{ sha: string }>;
    createTree(opts: { baseTreeSha?: string; entries: Array<{ path; blobSha: string | null }> }): Promise<{ sha: string }>;
    createCommit(opts: { message; treeSha; parents: string[]; author? }): Promise<{ sha: string }>;
    updateBranch(commitSha: string): Promise<void>;    // FF-checked; throws HeadConflictError on race

    // ─── log ───
    listCommits(opts?: { start?: string; limit?: number }): Promise<GitCommitMeta[]>;
}
```

### GitHub adapter endpoints

| Method | Endpoint |
|---|---|
| `branchHead` | `GET /repos/{owner}/{repo}/branches/{branch}` → `commit.sha` |
| `getCommit` | `GET /repos/{owner}/{repo}/git/commits/{sha}` |
| `getTree` | `getCommit` → `GET /repos/{owner}/{repo}/git/trees/{treeSha}?recursive=1` |
| `getBlob` | `GET /repos/{owner}/{repo}/git/blobs/{sha}` (base64 envelope) |
| `createBlob` | `POST /repos/{owner}/{repo}/git/blobs` with `{ content: base64, encoding: 'base64' }` |
| `createTree` | `POST /repos/{owner}/{repo}/git/trees` with `{ base_tree?, tree: [...] }` |
| `createCommit` | `POST /repos/{owner}/{repo}/git/commits` with `{ message, tree, parents }` |
| `updateBranch` | `PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}` with `{ sha, force: false }` |
| (`updateBranch` 404) | `POST /repos/{owner}/{repo}/git/refs` to create the ref first time |
| `listCommits` | `GET /repos/{owner}/{repo}/commits?sha={start}&per_page={limit}` |

### Why `getTree` is two steps
The Trees API endpoint accepts a tree SHA or a ref name. A commit SHA is *neither* — the endpoint silently returns an empty tree if you hand it a commit SHA, which is a real footgun. The adapter does `getCommit(commitSha)` first to get the tree SHA, then fetches the recursive tree explicitly.

### Why we don't pass an "expected old sha" to `updateBranch`
The GitHub Refs API doesn't take one. CAS comes from the fast-forward rule: our new commit's parent IS the expected old sha, and the FF check rejects (422) if the ref's current value isn't an ancestor of the new commit.

---

## 8. Operations & flows

### 8.1 First publish (author creates the repo)
1. Sign in via device flow (§6).
2. User clicks "Publish to GitHub" → prompted for repo name.
3. `POST /user/repos` with `auto_init: true` — creates the repo with a `main` branch + a README commit.
4. The engine calls `refreshSyncedHead()` to learn the auto-init commit's SHA as the parent.
5. Snapshot OPFS → publish-as-commit (§8.3).

### 8.2 Save (local snapshot)
**Trigger:** user clicks Save in the Collaboration panel (or types an optional message + Save).

1. **Flush autosave** — force any pending 600ms-debounced Monaco buffers to OPFS, so the working tree on disk is what the user sees.
2. **Snapshot OPFS** — list every non-hidden path, read bytes, compute `gitBlobSha` per file.
3. **Build the LocalSave record** — `{ id, message, time, files: { path → base64 }, treeHashes: { path → sha } }`. Default message is auto-generated: `Save 14:32 · ~2 +1 · main.fbasic, fade.json`.
4. **Persist to OPFS** — unshift onto the per-project chain (newest first), trim to `MAX_SAVES_PER_PROJECT` (10).
5. **Update UI** — chip flips to `↑ N unpublished`, header section repaints with the new save.

No network calls. Save is fast and idempotent.

### 8.3 Publish (the write path to remote)
**Trigger:** user has accumulated saves AND/OR uncommitted edits, clicks Publish. Publish is **blocked** if the polling tick detects the remote has changes the user hasn't pulled (`pendingPullPaths.size > 0`) — the button is disabled with tooltip "Remote has N changes you haven't pulled. Click Pull first."

1. **Flush autosave** — same as Save.
2. **Snapshot** — hash every file with `gitBlobSha`. Build the candidate tree.
3. **Diff** against `syncedTree`. If empty, no-op (and `clearSaves` since the local chain is moot).
4. **Upload changed blobs** — `createBlob` for each added/modified path. Idempotent on content.
5. **Create the new tree** — `createTree` with `base_tree = syncedHead.treeSha` and only the changed entries (added/modified with their `blobSha`, deleted with `blobSha: null`).
6. **Create the commit** — `createCommit` referencing the new tree + the synced commit as parent.
7. **Move the ref** — `updateBranch(newCommitSha)`. FF-checked; throws `HeadConflictError` if a third party pushed in the same window → falls through to §8.5.
8. **Advance synced state** — engine + sync-index now point at the new commit.
9. **Clear local saves** — the published commit captures their net result; the chain is no longer useful.

If the tab closes between any of steps 4–7, the orphan blobs/trees/commits are just unreferenced git objects. They never appear on the branch and git's own GC reclaims them eventually.

### 8.4 Clone (collaborator joins an existing repo)
1. Sign in via device flow.
2. User picks "Connect to existing repo" → types `owner/name`.
3. Adapter probes via `branchHead`; 404 → "you don't have access" message.
4. `checkout(wt, branchHead)` materializes the tree at branch HEAD into OPFS.
5. Sync-index records the synced commit + tree + flat `baseTree`.

### 8.5 Pull (the merge entry point)
**This is the only path that merges remote into local.** The earlier design ran the merge during Publish-on-race; we moved it to Pull so the merge result lands in the working tree BEFORE anything gets pushed. The user inspects, resolves conflicts, then Publishes the merged state. Pull-then-Publish, not Publish-then-merge.

**Detection.** Background poll (`checkRemote`) runs every 30s. Calls `branchHead()`; if the SHA differs from `index.syncedCommitSha`, fetches the remote tree and computes the diff against `index.baseTree` to populate `pendingPullPaths`. Polling is paused while `busy !== null` (an operation is in flight) to avoid a phantom-pull race during commit.

**On click.** The Pull button appears contextually inside a "↓ Remote has N changes for you" box when `pendingPullPaths.size > 0`. Each pending path has a `Show diff` button that opens a Monaco diff editor showing `working tree → remote HEAD` (see §8.7).

**Pull execution:**

1. **Flush autosave.**
2. **Try fast-forward** — `tryFastForward(wt)` checks the working tree is clean (snapshot equals `syncedTree`). If clean, fetch new tree → materialize → advance synced state → done.
3. **Otherwise, 3-way merge** — `mergeFromRemote(built, 'pull')` runs the conflict path (§9). Result: working tree contains merged state; `syncedHead` advances to the SHA we merged against; conflict markers (if any) surface for user resolution.

### 8.6 Publish-time race recovery
If a third party pushes between our last poll and our Publish click, `commit()` hits `HeadConflictError`. We fall back to `mergeFromRemote(built, 'publish-race')` — the same merge code path as Pull, just with different status banner wording. After merge resolves, the user clicks Publish again to push the merged result.

### 8.7 Diff viewer (Monaco diff editor in a dock tab)
Every "Show diff" button in the panels opens a read-only Monaco diff editor in its own dockview tab. One panel per (context, path); clicking the same button twice re-activates the existing tab. Source: [`src/sharing/diff-viewer.ts`](src/sharing/diff-viewer.ts) + the `'diff-viewer'` dock component registered in `main.ts`.

The controller resolves before/after content per context:

| Context | Before side | After side |
|---|---|---|
| `publish` | Published baseTree | Working tree |
| `save` | Predecessor save (or baseTree if oldest) | This save |
| `commit` | Parent commit | This commit |
| `pull` | Working tree | Remote HEAD |

`Show diff` appears in:
- Publish preview rows (Collaboration panel)
- Pending-pull list (Collaboration panel)
- Per-file rows in expanded save details (History panel)
- Per-file rows in expanded commit details (History panel)

### 8.8 History / restore / revert
- **Log:** `repo.log({ from, limit })` — wraps `listCommits` on the adapter.
- **History dockview panel:** [`history-panel.ts`](src/sharing/history-panel.ts) — a dedicated tab in the bottom group. Renders local saves above published commits with a divider. Each row expands to show per-file changes; saves get Revert / Drop actions, commits get Restore.
- **Per-line gutter diff:** [`monaco-gutter.ts`](src/sharing/monaco-gutter.ts) attaches Monaco decorations comparing current model text against the latest save (orange gutter = unsaved) and against the published baseTree (purple gutter = saved-but-not-published). Three-state gutter using `lineDiffTriState` in `line-diff.ts`.
- **Restore commit:** materializes the target tree into the working tree, then commits the result on top of the current branch HEAD with message `Restore to <sha> (<original message>)`. History is never rewritten — restore is just another forward commit.
- **Revert local changes:** the panel's "Unsaved changes" section has a per-row Revert button + a Revert-all button in the section header.

---

## 9. Concurrency & merge model

- **The branch ref is the single serialization point.** All ordering is decided by who moves `refs/heads/{branch}`.
- **True CAS via FF check.** Each commit's parent IS the expected old SHA. When the ref has moved, the commit doesn't descend from it, and `PATCH refs/...` with `force: false` returns 422. The adapter translates 422/409 into `HeadConflictError`.
- **Pull-first merge.** Pull is the merge entry point. Publish requires a fast-forwardable state and is button-disabled when the remote has un-pulled changes. Publish-race recovery (a true race, third party pushes during our publish round-trip) still triggers the same merge logic — but as a fallback, not the primary path.
- **3-way merge details** ([`mergeFromRemote`](src/sharing/collaboration-panel.ts)):
   - **Only-remote changes** → applied to OPFS automatically.
   - **Only-local changes** → kept intact.
   - **Both-side changes (same content)** → no-op.
   - **Both-side text** → LCS-anchored diff3 ([`src/sharing/diff3.ts`](src/sharing/diff3.ts)). Non-overlapping changes from both sides land cleanly. Overlapping regions get standard markers (`<<<<<<< ours`, `=======`, `>>>>>>> theirs (<short-sha>)`) embedded in the file. Conflict editor (§9.1) handles resolution.
   - **Both-side binary** → no line-level merge possible. Remote bytes go to `<path>.fade-conflict.<remote-sha-prefix>` as a sibling file; user picks via **Use mine** / **Use theirs**.
- **Post-merge race re-check.** After the 3-way merge writes the merged content, we call `setSyncedHead` to the exact SHA we merged against (rather than `refreshSyncedHead` which re-fetches and might race). Then we do one extra `branchHead()` check — if the remote moved AGAIN during our merge, surface "Pull once more before Publishing" in the info banner.
- **Mid-merge edit protection.** `mergeFromRemote` flushes any dirty Monaco buffers before reading working-tree bytes, so keystrokes that land between snapshot and write don't get clobbered when the next autosave fires.
- **Worst-case safety net.** If our commit succeeds but `updateBranch` fails permanently, the commit object is in git but no ref points at it. Git's server-side GC reclaims it eventually.

### 9.1 Conflict editor
Text conflicts show in the panel's Conflicts section with a **Resolve in editor →** primary button. Clicking opens a dedicated dockview tab — the [conflict editor](src/sharing/conflict-editor.ts) — bound to its own throwaway Monaco model. It shows:

- A header with the path, "N conflicts remaining" badge, and a **Save & close** button (disabled until zero markers remain).
- A toolbar listing every conflict region in the file: **Accept mine** / **Accept theirs** / **Accept both** / **Jump to**.
- The Monaco editor itself — fully editable, so the user can hand-merge any region in addition to the button actions.

After saving, the resolved content lands in OPFS, the panel's `refreshStatus` detects no more markers, the info banner clears automatically. The Publish button is hard-disabled while any text conflict is unresolved.

---

## 10. Garbage collection & retention

**Server-side: handled by GitHub.** Server-side git GC cleans unreferenced objects.

**Client-side saves: LRU-trimmed at 10 per project.** Older saves drop automatically. After a successful Publish, the entire save chain for that project is cleared — the published commit supersedes them. No app-side mark-and-sweep loop, no retention UI.

A future optimization is content-addressed dedup across saves (the `treeHashes` map already exists, so it's mostly a blob-store layer + reference counting). For a project with 30MB of binary assets and 10 saves of mostly the same content, current design stores ~400MB; with dedup it'd be ~30MB plus deltas. Worth doing when someone actually hits the OPFS ceiling.

---

## 11. Integration with the existing Playground

Module layout under [`src/sharing/`](src/sharing/):

| File | Role |
|---|---|
| `git-types.ts` | `GitTree`, `GitTreeEntry`, `GitCommitMeta`, `diffGitTrees` |
| `hash.ts` | `sha256`, `gitBlobSha`, hex utilities |
| `adapter.ts` | `GitAdapter` interface + `HeadConflictError` |
| `mock-adapter.ts` | In-memory `GitAdapter` for tests |
| `github-adapter.ts` | Production `GitAdapter` against the Git Data API |
| `repo.ts` | Engine: snapshot / commit / checkout / tryFastForward / log; emits `ProgressEvent` per phase |
| `working-tree.ts` | `WorkingTree` interface + `MemoryWorkingTree` |
| `opfs-working-tree.ts` | `OpfsWorkingTree` adapter + `isHiddenFromCommits` filter |
| `sync-index.ts` | localStorage-backed per-project sync state |
| `file-status.ts` | A/M/D computation against `baseTree` + `HashCache` |
| `local-saves.ts` | OPFS-backed save chain + `migrateLegacyLocalStorageSaves` |
| `token-store.ts` | `SessionTokenStore` (sessionStorage) + TokenSet helpers + legacy-PAT migration |
| `github-auth.ts` | Device flow client (requestDeviceCode, pollForToken, refreshAccessToken, validateToken) |
| `github-auth-config.ts` | Build-time config: proxy URL + client_id + scope |
| `auth-ui.ts` | Device-flow modal dialog (user_code + Open GitHub + cancel) |
| `diff3.ts` | LCS-anchored 3-way merge + `parseConflictRegions` |
| `conflict-editor.ts` | Per-file Monaco-backed conflict resolution tab |
| `diff-viewer.ts` | Read-only Monaco diff editor for Show-diff actions |
| `line-diff.ts` | LCS-based line diff + `lineDiffTriState` for the 3-state gutter |
| `monaco-gutter.ts` | Monaco decoration attachment per editor model (unsaved + saved-unpublished) |
| `collaboration-panel.ts` | The dockview panel — all UI for the sharing system (formerly `source-control-panel.ts`) |
| `history-panel.ts` | Recent History dockview panel (local saves + published commits) |

Plus, one level up:

| File | Role |
|---|---|
| [`oauth-proxy/`](../oauth-proxy/) | Cloudflare Worker: stateless CORS relay for `github.com/login/device/code` and `github.com/login/oauth/access_token`. Holds nothing. |

### App-wide integration

App-wide logging lives at [`src/log-bus.ts`](src/log-bus.ts) + [`src/logs-panel.ts`](src/logs-panel.ts). Sharing operations stream fine-grained events to the bus on channel `sharing`; the Logs dockview panel subscribes and renders a filterable terminal-style log. Each long operation also drives a progress bar in the Collaboration panel's busy banner via the engine's `onProgress` callback.

Touch points in [`main.ts`](src/main.ts):
- **`OpfsWorkspace`**: existing methods are consumed via the `OpfsWorkspaceLike` structural type, no changes needed.
- **`flushPendingSaves(workspace)`**: drains all dirty tabs to OPFS, exposed via `mountCollaboration`. Invalidates the panel's hash cache for each flushed path AND clears the `setHasDirtyTabs` signal.
- **`renderFileList`**: extended with A/M/D badges driven by `sharingController.onStatusChange`.
- **Sharing chips in the app header**: `<div id="sharing-chips">` next to "Ready"; `renderSharingChips()` subscribes to all four sharing signals (status, saves, pendingPull, conflicts) and paints pills. Each pill clicks → focuses the Collaboration tab (re-adding it if the user closed it).
- **Dockview**: registers `collaboration`, `logs`, `history`, `conflict-editor`, and `diff-viewer` components. Layout key bumped to `v6` after the `source-control` → `collaboration` rename.
- **Project switching**: `currentProjectRef = ...` calls `sharingController?.setActiveProject(name)`.
- **Monaco gutter**: `openFile` attaches `attachGutter` per model with three-state coloring (orange unsaved / purple saved-unpublished). Lifetime tied to the tab's `gutterHandle`.
- **Dirty-tab signal**: `onDidChangeContent` calls `sharingController.setHasDirtyTabs(true)` immediately so the Save button enables on the first keystroke (rather than after the 600ms autosave debounce + refreshStatus round-trip).

---

## 12. Caveats & risks

### 12.1 Real-time merge UX
Pull-then-Publish + the conflict editor handle the common cases cleanly. Non-overlapping edits on both sides auto-merge via diff3. Overlapping text edits get conflict markers + a dedicated resolution tab. Binary conflicts get sibling `.fade-conflict.<sha>` copies. The one thing we don't do: a live "diff viewer with cherry-pickable hunks" between branches. Likely not needed at playground scale.

### 12.2 Single-owner-of-repo
The repo is owned by whoever created it; if that account is deleted, the project disappears. Mitigation: encourage transferring ownership to an organization once a project has more than one regular collaborator, or do periodic "export and re-publish" as backup.

### 12.3 Polling, not push
GitHub has no longpoll/webhook to the browser. "Auto-sync" means "within a poll cycle" (30s). Fine for an editor. Polling is paused while operations are in flight (to avoid the phantom-pull race) and while the tab is backgrounded (visibilitychange handler).

### 12.4 Token security
- **What's stored:** the access token + refresh token in `sessionStorage` (per-tab, cleared on close).
- **What's NOT stored:** any client_secret (we don't have one — device flow doesn't use them). No long-lived PAT.
- **Worst-case scenario:** an XSS attacker who lands in the page can read `sessionStorage` and exfiltrate the access token. Mitigation: short access-token lifetime + sessionStorage clears on close + the OAuth scope is bounded by what we requested. A `gho_*` token with `repo` scope is broad but bounded to repos; switching to a GitHub App with per-repo install and `Contents:RW` narrows further (see §6 "Config" + open question #6).
- **Threat models we don't defend against:** an XSS attacker WHILE the user is signed in. Same as any other browser app holding a credential.

### 12.5 100 MB per-blob cap
Git Data API caps blobs at 100 MB. Comfortable for sprites, audio, modest assets. Long uncompressed WAV or video would hit it.

### 12.6 OPFS quota for local saves
OPFS quota is browser-managed and typically gigabytes — generous compared to localStorage's ~5MB. A project with 10 saves of 30MB of binary assets sits comfortably. The migration from localStorage to OPFS was triggered by exactly the "binary assets blow the 5MB cap" failure mode; we'd hit OPFS limits only at much higher scales.

### 12.7 Rate limits
Authenticated REST: 5,000 req/hr per user. The polling tick uses ETag conditional requests (`If-None-Match`) — 304 responses are cheap. Blob downloads cache by SHA. For typical playground sessions, comfortably under quota.

### 12.8 Binary files don't merge
Expected and handled (§9) via conflict copies.

### 12.9 GitHub Acceptable Use Policy
Using a GitHub repo to back a content-creation app is broadly on-label — we ARE storing software-shaped projects under version control. Don't market the playground as "free file hosting"; don't churn at firehose rates.

### 12.10 The CORS proxy is a dependency
If the worker goes down, sign-in breaks. Tokens already in sessionStorage keep working until they expire. To minimize this:
- The worker is stateless — redeployment is instant.
- Free tier covers 100k req/day, no payment method required.
- The worker URL is pinned at build time; switching domains requires a Playground rebuild.

If we ever wanted to remove the dependency entirely, the path is: ask GitHub to add CORS headers to `github.com/login/device/code` and `github.com/login/oauth/access_token`. There's no documented reason they can't.

---

## 13. Implementation phases

**All five phases shipped as of 2026-06-15.**

- ✅ **Phase 0 — local engine, no network.** Repo + OpfsWorkingTree + MockAdapter + tests.
- ✅ **Phase 1 — GitHub adapter, single user (PAT).** PAT auth, publish-new-repo, clone, fast-forward pull, commit.
- ✅ **Phase 2 — sharing & multi-user pull.** Collaborator-invite flow (via the GitHub UI), branch-SHA polling, file-list A/M/D badges, sync state UI.
- ✅ **Phase 3 — conflicts.** 3-way text merge via diff3 + conflict editor. Binary conflict-copy with Use-mine/Use-theirs.
- ✅ **Phase 4 — local saves + diff preview.** Two-tier client model (Save vs Publish), OPFS-backed save chain, Pull-then-Publish flow, history panel with restore, 3-state gutter, Monaco diff viewer with Show-diff buttons across publish/save/commit/pull contexts.
- ✅ **Phase 5 — OAuth device flow via CORS proxy.** Tiny Cloudflare Worker, device-flow + refresh, sessionStorage token store with legacy migration, error/info banner split, "Collaboration" rename pass.

---

## 14. Testing strategy

### 14.1 Unit tests
All under [`Playground/src/sharing/`](src/sharing/) `*.test.ts`. Covers:

- **Hashing** (`hash.test.ts`): `gitBlobSha` matches real git for known vectors (empty input, "hello\n").
- **Engine** (`repo.test.ts`): commit → checkout → identical tree. Unchanged blobs aren't re-uploaded. Clean FF advances; dirty refuses. HeadConflictError race. `setSyncedHead` rehydration.
- **GitHub adapter wire protocol** (`github-adapter.test.ts`): every endpoint's request shape and response parsing, including the commit→tree two-step in `getTree`, the truncation safeguard, the 422→`HeadConflictError` translation, the 404→POST-refs fallback.
- **Auth** (`github-auth.test.ts`): device-code request shape, scope optional behavior, four terminal error codes, AbortSignal cancellation, TokenSet response parsing including expires_in + refresh_token.
- **Line diff** (`line-diff.test.ts`): identical input → no marks; pure-add at end / start; pure-delete; modified runs; N-for-M replace; empty inputs. Plus `lineDiffTriState` for the 3-state gutter (unsaved vs saved-unpublished).
- **diff3** (`diff3.test.ts`): merging non-overlapping changes; conflict marker generation; `parseConflictRegions` for the conflict-editor toolbar.
- **File status** (`file-status.test.ts`): `computeStatus` with and without cache; HashCache invalidate semantics. Stale-cache documented as caller bug.
- **Local saves** (`local-saves.test.ts`): create/load/drop/clear/upgrade. LRU trim. Per-project scoping. Round-trip integration (modify→createSave→loadSaves→computeStatus reports unchanged).
- **Log bus** (`log-bus.test.ts`): channel filtering, subscription / unsubscription, retention.

**134 tests across 9 files, all passing.**

### 14.2 Integration (two real GitHub accounts, manual checklist)
End-to-end: A publishes → invites B (via github.com) → B clones via Connect Existing → both Save locally → both Publish non-overlapping changes → both Pull → both Save/Publish overlapping changes → conflict UI surfaces → conflict editor resolves → Publish succeeds. Browseable on github.com between every step.

### 14.3 Worker smoke tests
[`oauth-proxy/README.md`](../oauth-proxy/README.md) has a curl-based smoke test suite that exercises the three guards (origin allow-list, path allow-list, preflight) without hitting GitHub. The `wrangler dev` local mode runs this end-to-end in ~5 seconds.

---

## 15. Open questions

1. **Content-addressed save dedup.** `LocalSave.treeHashes` is most of the way there. With a per-project OPFS blob store keyed by sha, 10 saves of a 30MB project becomes ~30MB instead of ~400MB. Worth doing if anyone hits the OPFS quota.
2. **GitHub App migration.** Currently shipping an OAuth App with `repo` scope. GitHub App with `Contents:RW + Administration:RW` + "All repositories" install gives equivalent functionality with a narrower authorize screen ("Contents R/W on the 2 repositories you selected"). Two-line config change once the App is registered + installed.
3. **Per-collaborator quotas / project size warnings.** Surface git-storage usage in the panel when a project nears GitHub's ~5GB soft warning threshold.
4. **PKCE on the OAuth backend.** When (if) we ever stand up a real OAuth backend (vs the CORS-only proxy we have), PKCE is the right thing to enable. GitHub shipped support 2025-07-14; it's defense-in-depth over the existing client_secret flow, not a replacement.
5. **Conflict editor for binary files.** Currently Use-mine/Use-theirs only. An image-diff viewer that lets the user pick per-quadrant or per-frame is a real product feature, not a refactor.
6. **Sign-out UX clarity.** "Disconnect from repo" is well-marked. Full sign-out (clear sessionStorage entirely) is currently implicit via tab close. A "Sign out" button in the panel header is one-line addition.
7. **Worker monitoring.** No alerting if the worker dies. Cloudflare's dashboard has it; integrating a "proxy down" banner in the Playground when sign-in requests fail would make outages faster to diagnose.
