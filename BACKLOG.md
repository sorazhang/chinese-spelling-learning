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

### F-015 · Spaceship game-select hub (replace the flat game grid)
- **Status:** Backlog — standalone prototype exists, not wired into the real app
- **Priority:** _unset — set when you triage_
- **Acceptance:**
  - [ ] Home screen's `game-grid` (currently a plain list of cards, `js/nav.js`) becomes a fly-between-planets hub: one planet per game, landing on it opens that game
  - [ ] Still reachable/skippable quickly — a returning student shouldn't be forced to fly every single time to reach a game they already know they want
  - [ ] Keeps XP/progress display working per game (currently shown on each game's own home screen, unaffected either way)
  - [ ] Deep-link support: landing on a planet should open straight into that game's own home screen, not just the app's top-level home (needs a small addition — right now `nav.js`'s `navTo()` + each game's `enter_<id>` already do this together, so landing can call the same pair)
- **Notes:** Prototype sent as a standalone demo (`space-hub.html`, not yet in the deployed app) — canvas-drawn pseudo-3D (glowing sphere that scales up as you "approach", radial starfield, steerable ship), no 3D library, so it's light enough to run anywhere. The prototype's "PLAY" button just links out to the live site since it has no Firebase login of its own; the real version would call straight into `navTo('<game>')` + `enter_<id>()` like the existing game-grid cards do. Worth deciding: full replacement of the grid, or an optional "fly there" mode alongside the quick grid for when time's short.

### F-014 · 拼音 RUNNER — T-Rex-style pinyin dodge game
- **Status:** Backlog — draft, mechanic not yet chosen
- **Priority:** _unset — set when you triage_
- **Acceptance:**
  - [ ] Chrome-dinosaur-style endless runner (single character/sprite auto-running left-to-right, jump on tap)
  - [ ] Obstacles are shaped like the classic cactus but labeled with a pinyin syllable instead
  - [ ] One of two mechanics below is picked and implemented (see Notes)
  - [ ] Speed ramps up over time / distance like the original, for difficulty progression
  - [ ] XP + a session log entry on run end, same pattern as the other 5 games
- **Notes:** Two ways to make the obstacles actually test pinyin instead of just being reskinned cacti — needs a decision before building:
  - **A — Target-match:** current vocab word (character or English meaning) shown at the top; obstacles carry random pinyin, jump only the ones that *don't* match the target, get hit by a matching one you failed to jump (or duck under the wrong ones — reverse framing also works). Closer to the original's pure-reflex feel.
  - **B — Read-and-react:** no jump/no-jump choice, obstacle pinyin always has to be jumped, but landing triggers a flash of "was that 声调 right?" style micro-quiz on the syllable just cleared — reflexes now, recall right after.
  - Needs its own vocab-set read (reuses `S.vocabSets`, no new data shape) and a canvas-based render loop closer to Wall's (`js/wall.js`) than Quest's — Wall is probably the better template to fork from.

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
