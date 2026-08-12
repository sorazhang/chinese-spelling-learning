# Feature Backlog

How this works: every feature — proposed, in progress, or done — gets one
entry below. When you think of something new, add it (or ask Claude to);
when priorities shift, edit the `Priority`/`Status` line; when it ships,
check off its acceptance criteria and flip `Status` to `Done`. Nothing
lives only in chat history — if it's not here, treat it as not tracked.

**Priority**: `P0` blocking/urgent · `P1` next up · `P2` nice to have, no rush
**Status**: `Backlog` → `Ready` → `In Progress` → `Done` (or `Blocked`, with why)

---

## Open

### F-009 · Stroke order hints
- **Status:** Backlog
- **Priority:** P2
- **Acceptance:**
  - [ ] Faint stroke-order guide renders inside each box on the Handwrite canvas
  - [ ] Doesn't interfere with drawing, erasing, or AI grading
  - [ ] Toggleable, or at least unobtrusive enough to ignore
- **Notes:** From the original recommended next steps. Needs a stroke-order data source per character (e.g. HanziWriter-style stroke data) — worth scoping the data source before estimating effort.

### F-010 · Richer teacher dashboard
- **Status:** Backlog
- **Priority:** P1
- **Acceptance:**
  - [ ] Per-session drill-down (not just aggregate XP/session list) — e.g. which questions Owen got wrong in a given Quest round
  - [ ] Filterable by game and/or date range
  - [ ] Still reads only from `progress`/`sessions` already being written — no new write paths needed
- **Notes:** `js/dashboard.js` currently shows total XP per student + a flat recent-sessions list. This extends it, doesn't replace it.

### F-011 · Add a new weekly vocab set without editing code
- **Status:** Backlog
- **Priority:** P1
- **Acceptance:**
  - [ ] Admin can add a new `vocabSets/{setId}` (word list + optional sentences) from the UI, not by hand-editing `js/data.js`
  - [ ] New set becomes selectable/playable across all 5 games without further code changes
  - [ ] Existing `c4` set and all students' progress under it are unaffected
- **Notes:** Right now `DEFAULT_VOCAB_SETS` in `js/data.js` is the only seed path, and there's no set-picker UI at all — every game hardcodes `SET_ID = 'c4'`. This is really two features (admin authoring UI + a set-picker for students); may be worth splitting once scoped.

### F-012 · Delete the legacy single-file games
- **Status:** Backlog
- **Priority:** P2
- **Acceptance:**
  - [ ] Confirm the live PWA fully covers what `char4-*.html` and `_template.html` provided
  - [ ] Remove those files and the "Superseded" section of `ARCHITECTURE.md`
- **Notes:** Deliberately left in place until the new PWA was proven out (see `ARCHITECTURE.md` §11). All 5 games are now ported and tested — this is just cleanup, do whenever.

---

## Done

### F-001 · Design system + storage-key foundation
- **Status:** Done
- **Priority:** —
- **Acceptance:**
  - [x] Shared theme/CSS/JS pattern documented (`_template.html`, superseded by `css/styles.css` once the PWA rewrite happened)
  - [x] `cls_<charset>_<game>_<metric>` localStorage convention documented (superseded by Firebase paths — see `ARCHITECTURE.md` §6)

### F-002 · Static PWA + Firebase architecture
- **Status:** Done
- **Priority:** —
- **Acceptance:**
  - [x] File layout, state pattern, window-exposure pattern documented and implemented
  - [x] `database.rules.json` implements owner-or-admin isolation for `progress`/`sessions`
  - [x] Verified without a real Firebase project via `test/run.mjs`

### F-003 · 汉字 QUEST ported to the PWA
- **Status:** Done — `js/quest.js`

### F-004 · 段落 RECALL ported to the PWA
- **Status:** Done — `js/recall.js`

### F-005 · 汉字 WALL ported to the PWA
- **Status:** Done — `js/wall.js`

### F-006 · 手写 TRACE ported to the PWA, AI grading working
- **Status:** Done — `js/handwrite.js` + `api/grade.js`
- **Notes:** AI grading proxies through a Vercel serverless function (`ANTHROPIC_API_KEY` server-side only) instead of the old client-side call. Confirmed working live.

### F-007 · 听写 DICTATION ported to the PWA
- **Status:** Done — `js/dictation.js` (same AI-grading path as Handwrite)

### F-008 · Teacher (admin) dashboard + score visibility
- **Status:** Done — `js/dashboard.js`
- **Notes:** Shows per-student total XP and a recent-sessions list across all games. See F-010 for the deeper version.

### F-013 · Deploy to a real domain
- **Status:** Done
- **Acceptance:**
  - [x] Hosted on Vercel from the `main` branch
  - [x] `chinese-spelling-learning.com` DNS pointed at Vercel via Namecheap
  - [x] Firebase Authorized Domains updated for the custom domain

### F-014 · 拼音 DINO — pinyin dodge game, 6th real game
- **Status:** Done — `js/dino.js`
- **Acceptance:**
  - [x] Perspective ("3D road") endless runner, jump every cactus, obstacles labeled with pinyin instead of blank
  - [x] Landed on mechanic B from the original draft: no jump/no-jump choice, every cactus must be jumped, the gold one matches the current target word for a score+XP bonus and picks a new target
  - [x] Speed ramps with score for difficulty progression
  - [x] XP (`floor(score/5)`) + high score + a session log entry, same pattern as Wall (`js/wall.js`)
- **Notes:** Prototyped first as standalone `dino-pinyin.html` (flat 2D) and `dino-pinyin-3d.html` (the perspective version that shipped), both still in the repo unlinked from the app. Two real bugs were caught in testing before it shipped: a units mismatch made the first cactus-speed tuning ~6x too fast, and the jump-arc physics briefly had duplicate/conflicting integration code.

### F-015 · Spaceship game-select hub — "Fly there" alternate navigation
- **Status:** Done — `js/spacehub.js`
- **Acceptance:**
  - [x] Added as a second option alongside the flat grid (a "🚀 OR FLY THERE INSTEAD" button on the home screen), not a full replacement — a returning student can still just tap a card
  - [x] One planet per entry in `nav.js`'s `GAMES` list (now includes Dino), using each game's real accent color
  - [x] Landing on a planet actually launches that game for real (`navTo(id)` + `enter_<id>()`, the exact same call the flat grid's cards make) — the prototype's version only linked out to the homepage
  - [x] Dodgeable asteroids with a 3-shield HUD; losing all shields resets the current approach rather than the whole journey
- **Notes:** Prototyped first as standalone `space-hub.html`, still in the repo unlinked from the app. One real bug caught in testing before it shipped: the "have you arrived" check compared the planet's rendered radius against a threshold it could mathematically never reach, so the ship would fly forever and never land.
