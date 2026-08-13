# Architecture

This app is being rebuilt as a **static PWA backed by Firebase** (Auth +
Realtime Database + Hosting, no custom server) following the "Static PWA +
Firebase" guide. This supersedes the earlier single-file-per-game approach
described at the bottom of this document — see "Migration status" for what's
been ported so far and what's still on the old approach.

Two roles: **admin** (parent/teacher, identified by `ADMIN_EMAIL`) and
**student** (Owen, and any future siblings/classmates — the data shape
already supports many). Progress now lives in Firebase instead of
per-device `localStorage`, so it syncs across devices and the admin can see
it from anywhere.

## 1. File layout

No build step. No framework. ES modules loaded natively.

```
index.html            -- markup only + <link rel=stylesheet> + one <script type=module>
css/styles.css         -- all styles (design system: dark space theme, neon accents, Orbitron font)
js/
  firebase.js          -- SDK init, exports fbAuth, fbDb, ADMIN_EMAIL (see §2 on why compat SDK)
  data.js              -- shared app state (S) + all Firebase read/write functions
  utils.js             -- esc/date/toast/stars/shuffle — stateless helpers used by multiple features
  auth.js              -- login/signup/reset-password forms
  nav.js               -- view routing, role-based UI toggling (applyRoleUI), game grid
  quest.js             -- 汉字 QUEST game (reference implementation — copy this pattern for the rest)
  dashboard.js          -- admin view: student XP + session history
  app.js               -- ENTRY POINT / composition root (see §3)
database.rules.json    -- Firebase Realtime Database security rules (source of truth, paste into console)
test/
  stub-firebase.js      -- fake window.firebase injected into a page (no real project needed)
  rules.mjs              -- Node re-implementation of database.rules.json, kept in sync by hand
  run.mjs                 -- Playwright script: two simulated logged-in pages share one in-memory
                             backend, proves the app's read/writes work AND that isolation holds
                             against a page calling the database directly. Run: node test/run.mjs
```

`data.js` is the one place that knows about Firebase paths — every other
file works with plain in-memory objects (`S`) and calls a named function
(`saveProgressRecord(...)`) without knowing where it lives in the database.

## 2. Why `firebase.js` uses the compat SDK, not modular v9 imports

`js/firebase.js` reads `window.firebase` (the classic global object) rather
than `import ... from 'https://www.gstatic.com/.../firebase-app.js'`. This
is deliberate: `index.html` loads the real compat SDK via `<script>` tags
*only if `window.firebase` isn't already defined* — which means
`test/stub-firebase.js` can inject a fake `window.firebase` before
`firebase.js` ever runs, and the rest of the app can't tell the difference.
`firebase.js` adapts the compat call shapes (`ref.once('value')`,
`ref.set(val)`, ...) to the same modular-style function signatures
(`get(ref)`, `set(ref, val)`, ...) used throughout `data.js`/`auth.js`, so
no other file needs to know which SDK shape is underneath.

## 3. The entry point / "expose to window" pattern

No framework, no build step → markup uses plain inline event handlers:
`onclick="doThing('a','b')"`. Inline handlers run in the global scope, but
ES module code is module-scoped — so every function an inline handler
calls (anywhere in `index.html` or in a `render...()` template string) must
be attached to `window`. `app.js` is the only file that does this, via one
`Object.assign(window, {...})` call. Keep that list authoritative — audit
it after adding any feature with new inline handlers:

```bash
grep -oE 'on(click|change|error|input|mouseup|touchend)="[^"]*"' index.html js/*.js \
  | sed -E 's/^[^:]*:on[a-z]+="//' | sed 's/"$//' \
  | grep -oE '[a-zA-Z_][a-zA-Z0-9_]*\(' | tr -d '(' | sort -u \
  > /tmp/needed.txt
sed -n '/Object.assign(window, {/,/});/p' js/app.js \
  | grep -oE '[a-zA-Z_][a-zA-Z0-9_]*' | grep -vE '^(Object|assign|window)$' | sort -u \
  > /tmp/exposed.txt
diff /tmp/needed.txt /tmp/exposed.txt
```
Anything in `needed.txt` missing from `exposed.txt` means a button will
silently no-op (`ReferenceError` in console). Extra names in `exposed.txt`
are harmless (e.g. functions only ever wired via `el.onclick = fn` in JS,
which this grep can't see).

## 4. State and rendering pattern

One shared, mutable state object exported from `data.js`:

```js
export var S = { uid:null, email:'', role:'student', vocabSets:{}, progress:{}, dashboard:{...} };
```

Each feature file (`quest.js`, future `recall.js`/`wall.js`/etc.) owns
render functions that rebuild a DOM subtree's `innerHTML` from `S`, plus
action functions that mutate `S`, save via `data.js`, then re-render. No
virtual DOM — regenerate the HTML string, reassign `.innerHTML`.

## 5. Role-based UI

`S.role` is derived at login from `email === ADMIN_EMAIL` (`isAdmin()` in
`data.js`) — never stored as a separate writable field, so it can't be
spoofed client-side. `#home-student` / `#home-admin` are parallel
sub-containers inside `#view-home`, toggled by `applyRoleUI()`
(`js/nav.js`) on login.

## 6. Firebase data shape

```
vocabSets/{setId}                   -- shared vocab+meaning content. Admin-writable, any authed user can read.
users/{uid}                         -- {displayName, email}. Owner-or-admin read/write.
progress/{uid}/{setId_gameId}       -- {xp, streak, correct, updatedAt}. Owner-or-admin read/write.
sessions/{uid}/{sessionId}          -- {setId, game, score, total, xpEarned, ts}. Owner-or-admin read/write, append-only.
```

`progress` and `sessions` are keyed by `uid` first (not nested under a
shared parent with a `uid` field) specifically so the admin's dashboard can
read the whole collection in one call while a student's own reads/writes
are confined to their own subtree — see `database.rules.json` for the
actual rule, and `test/run.mjs`'s "Hostile checks" step for the isolation proof. This is the
"shared collection with a personal sub-part" pattern — putting the owner's
id in the *path*, not just a field, is what makes the isolation real
instead of just something the app's own UI happens not to expose.

`progress`'s record id is `<setId>_<gameId>` (e.g. `c4_quest`) — same
naming idea as the old `localStorage` convention below, just moved into
the Firebase path instead of a flat key string.

Nothing is stored as a single array value that gets overwritten wholesale
— `vocabSets`, `progress`, and `sessions` are all keyed by id, so an edit
to one record never risks clobbering another client's concurrent edit to a
different one.

## 7. AI grading: server-side proxy, not a client-side API key

Handwrite, Dictation, and Claw each grade something via the Anthropic
Messages API. The client **never** calls `api.anthropic.com` directly and
never holds a real API key — `js/handwrite.js`, `js/dictation.js`, and
`js/claw.js` all `fetch('/api/grade', {...})` instead, a same-origin
Vercel serverless function (`api/grade.js`) that reads `ANTHROPIC_API_KEY`
from a server-side environment variable and proxies the request. A real
key embedded in shipped browser JS would be extractable via view-source
by any visitor and usable to run up charges on whoever's account it
belongs to — this is the one place in the app where "no custom server"
(§1) still gets a one-file serverless exception, because the alternative
is a leaked credential.

`api/grade.js` accepts two request shapes: `{image, prompt}` for a photo
of handwriting (Handwrite, Dictation), or `{prompt}` alone for text-only
grading — Claw sends a Web Speech API transcript plus the target word
instead of an image, since there's nothing to photograph for a
pronunciation check.

Every AI-graded game is written to degrade gracefully: if `/api/grade`
errors for any reason (key not configured yet, network failure, malformed
response, or — for Claw specifically — speech recognition itself being
unsupported or never responding), it falls back to the existing manual
self-grade buttons rather than blocking play. Claw goes a step further and
keeps those buttons visible from the start rather than only revealing them
on failure, since mic/speech support varies far more across browsers and
devices than canvas drawing does. See §9 for the Vercel environment
variable setup this still needs.

## 8. Testing without a real Firebase project

`test/run.mjs` (`node test/run.mjs`) spins up a static file server for this
repo, launches two Chromium pages via Playwright — one "logged in" as the
admin, one as a student — both pointed at `test/stub-firebase.js`'s fake
`window.firebase`, which forwards every read/write through
`page.exposeFunction` into one shared in-memory store on the Node side.
`test/rules.mjs` re-implements `database.rules.json`'s logic so the fake
backend rejects reads/writes the same way the real rules would.

It exercises: admin login seeds `vocabSets` → student plays a full Quest
round → progress/session get written under the student's own uid → admin
dashboard reads them → and, crucially, the student page calling the
database *directly* (bypassing the app's UI) is denied reading the whole
`progress` collection, denied reading another uid's data, and denied
writing admin-only `vocabSets` content — while its own data and the
admin's cross-user reads are allowed. Re-run this after any change to
`database.rules.json` or to what `data.js` reads/writes.

**Keep `test/rules.mjs` in sync with `database.rules.json` by hand** —
they're independent re-implementations on purpose (so the test doesn't
just trivially agree with itself), but that also means a rules change
needs both files updated.

## 9. Deployment

Live at `chinese-spelling-learning.com`, hosted on Vercel (zero-config
static deploy from `main` — no build command, no output directory) with
DNS pointed at Vercel from Namecheap. Firebase project `chinese-spelling-learing`
is live: Email/Password auth enabled, Realtime Database created
(`asia-southeast1`), `database.rules.json` published to its Rules tab, and
`js/firebase.js` has the real `firebaseConfig` filled in. `ADMIN_EMAIL` in
`js/firebase.js` and the admin checks baked into `database.rules.json` must
always match exactly.

**AI grading needs one more manual step**: `api/grade.js` (a Vercel
serverless function, see §6.1) reads `ANTHROPIC_API_KEY` from the
environment — until that's set in Vercel → Project → Settings →
Environment Variables (get a key at console.anthropic.com, then redeploy),
Handwrite/Dictation's 🤖 AI CHECK button will fail and both games fall back
to their manual self-grade buttons, which work with no configuration.

Real accounts already exist in the live project, so per §10 below, further
merges to `main` need a human OK before pushing, not just a passing test
run.

## 10. Git workflow

- Develop on a feature branch, run `node test/run.mjs` before merging.
- Only pause for human confirmation before merging once real user data
  exists in the real Firebase project — until then this is a solo
  low-stakes app and merging after a passing test run is fine. (This
  project has crossed that line — see §9.)

## 11. Migration status (old single-file games → new PWA)

| Game | Status |
|---|---|
| 汉字 QUEST | ✅ Ported to `js/quest.js` — reference implementation |
| 段落 RECALL | ✅ Ported to `js/recall.js` |
| 汉字 WALL | ✅ Ported to `js/wall.js` |
| 手写 TRACE | ✅ Ported to `js/handwrite.js` — AI grading via `api/grade.js` (§7), see §9 for the env var it needs |
| 听写 DICTATION | ✅ Ported to `js/dictation.js` — same AI-grading path as Handwrite |

All five games are now ported and pass `test/run.mjs`. The old
`char4-*.html` files and `_template.html` are still left in the repo
(harmless, unreferenced by `index.html`) — safe to delete once you've
confirmed the live site covers everything you need from them, at which
point the "Superseded" section below can go too. Each port follows the
same pattern as `quest.js`: read vocab from `S.vocabSets`, save progress
via `saveProgressRecord`, log a session via `logSession`, expose its
handlers in `app.js`.

---

# Superseded: single-file-per-game architecture (pre-Firebase)

The following was the original architecture, used for a target device (an
Android phone's built-in **HTML Viewer app**) that only runs vanilla
HTML/CSS/JS with no confirmed way to load multiple files or use a
framework — so every game was a fully self-contained `.html` file with
`localStorage` for score persistence. `_template.html` was the copy-paste
starting point for new games under this approach.

## Design system (still reused as-is in `css/styles.css`)

- **Theme**: dark space background, neon accent `#00f5ff` (cyan) primary,
  `#8844ff` (purple) secondary, `#00ff88` green correct, `#ff4466` red
  wrong, `#ffd700` gold "perfect".
- **Fonts**: `Orbitron` (700/900) headings/numbers/buttons, `Exo 2`
  (400/600) body text.
- Animated stars background, `.screen`/`.screen.active` pattern,
  `#pinyin-btn` toggle, `#xp-panel`, `.stat-row`, `.btn-primary`/`.btn-secondary`,
  `.cx-card` vocab codex.

## Storage key convention (superseded by Firebase paths, §6 above)

Two categories of `localStorage` keys were used:
1. **Global preferences**, unprefixed: `pinyin_on`.
2. **Per-game progress**: `cls_<charset>_<game>_<metric>` (e.g. `cls_c4_quest_xp`).

### Legacy keys (Char 4 games not yet ported — still live on `localStorage`)

| File | Legacy key(s) |
|---|---|
| `char4-quest.html` | `cq4_xp`, `cq4_streak`, `cq4_correct` |
| `char4-recall.html` | `pr4_xp` |
| `char4-wall.html` | `wall4_hi`, `wall4_xp` |
| `char4-handwrite.html` | `hw4_xp` |
| `char4-dictation.html` | `dict4_xp`, `d4xp` |

These predate the `cls_*` convention and are left as-is — renaming them
would silently reset Owen's XP on a device that's still using the old
single-file version.

## Vocab data schemas (same shapes, now stored in Firebase instead of a hardcoded JS array)

**Word list** (`VOCAB`):
```js
{ char: "环保袋", py: "huán bǎo dài", en: "eco / reusable bag" }
```

**Sentence list** (`SENTENCES`):
```js
{ chars: ["环","保","袋"], py: ["huán","bǎo","dài"], en: "eco / reusable bag", full: "环保袋" }
```
