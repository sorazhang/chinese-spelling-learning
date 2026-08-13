// test/run.mjs — end-to-end architecture check per ARCHITECTURE.md §10.
// No real Firebase project involved. Run: node test/run.mjs
//
// What this proves:
//  1. A student can play Quest and its XP/session gets written to the
//     shared fake backend under their own uid.
//  2. The admin dashboard can read every student's progress + sessions.
//  3. A non-admin page directly calling the database (bypassing the app's
//     own UI entirely) is denied reading another user's data or the whole
//     progress/sessions collections — proving database.rules.json's
//     isolation actually works, not just that the app never displays it.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { installFakeFirebase } from './stub-firebase.js';
import { ADMIN_EMAIL, pathParts, checkRead, checkWrite, getAtPath, setAtPath } from './rules.mjs';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.resolve(__dirname, '..');

var MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

function startServer() {
  return new Promise(function(resolve) {
    var server = http.createServer(function(req, res) {
      var reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      var filePath = path.join(ROOT, reqPath);
      fs.readFile(filePath, function(err, data) {
        if (err) { res.writeHead(404); res.end('not found: ' + reqPath); return; }
        var ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, function() { resolve(server); });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
  console.log('  ok — ' + msg);
}

// Holds a mouse button down over `selector` for `ms`, then releases —
// mirrors how a real press-and-hold works for js/claw.js's left/right
// buttons (mousedown on the button, mouseup listened for on document).
async function holdButton(page, selector, ms) {
  var box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function wireFakeBackend(page, identity, store) {
  await page.exposeFunction('__dbRead', function(dbPath) {
    var parts = pathParts(dbPath);
    if (!checkRead(parts, identity.uid, identity.email)) {
      return Promise.reject(new Error('PERMISSION_DENIED: read ' + dbPath + ' as ' + identity.email));
    }
    return Promise.resolve(getAtPath(store, parts));
  });
  await page.exposeFunction('__dbWrite', function(dbPath, val) {
    var parts = pathParts(dbPath);
    if (!checkWrite(parts, identity.uid, identity.email)) {
      return Promise.reject(new Error('PERMISSION_DENIED: write ' + dbPath + ' as ' + identity.email));
    }
    setAtPath(store, parts, val);
    return Promise.resolve();
  });
  await page.addInitScript(installFakeFirebase, identity);
}

function watchConsoleErrors(page, label) {
  var errors = [];
  page.on('pageerror', function(err) { errors.push(label + ': ' + err.message); });
  page.on('console', function(msg) {
    if (msg.type() !== 'error') return;
    var text = msg.text();
    // Google Fonts' CDN is unreachable inside this sandbox's network — not a
    // real app bug, and irrelevant to what this test is checking.
    if (text.indexOf('Failed to load resource') !== -1) return;
    errors.push(label + ' console.error: ' + text);
  });
  return errors;
}

async function main() {
  var server = await startServer();
  var port = server.address().port;
  var baseUrl = 'http://localhost:' + port + '/index.html';
  var store = {}; // the one shared "backend" both pages read/write

  var browser = await chromium.launch();
  var admin = { uid: 'admin-uid', email: ADMIN_EMAIL, displayName: 'Parent' };
  var student = { uid: 'owen-uid', email: 'owen@example.com', displayName: 'Owen' };

  console.log('\n[1] Admin logs in first — seeds vocabSets (self-healing seed, ARCHITECTURE §7 pattern)');
  var adminPage = await browser.newPage();
  var adminErrors = watchConsoleErrors(adminPage, 'admin');
  await wireFakeBackend(adminPage, admin, store);
  await adminPage.goto(baseUrl);
  await adminPage.waitForSelector('#view-home.active', { timeout: 10000 });
  for (var tries = 0; tries < 50 && !(store.vocabSets && store.vocabSets.c4); tries++) {
    await adminPage.waitForTimeout(100);
  }
  assert(store.vocabSets && store.vocabSets.c4 && store.vocabSets.c4.vocab.length === 10, 'vocabSets/c4 seeded by admin login with 10 words');
  assert(store.users && store.users['admin-uid'] && store.users['admin-uid'].displayName === 'Parent', 'admin profile self-healed into users/admin-uid');

  console.log('\n[2] Student logs in, plays a full Quest round');
  var studentPage = await browser.newPage();
  var studentErrors = watchConsoleErrors(studentPage, 'student');
  await wireFakeBackend(studentPage, student, store);
  await studentPage.goto(baseUrl);
  await studentPage.waitForSelector('#view-home.active', { timeout: 10000 });
  assert((await studentPage.locator('.game-card').count()) === 7, 'game grid shows all 7 games');
  await studentPage.click('.game-card:has-text("QUEST")');
  await studentPage.waitForSelector('#quest-home.active');
  await studentPage.click('#quest-home .btn-primary');
  await studentPage.waitForSelector('#quest-quiz.active');

  for (var q = 0; q < 5; q++) {
    await studentPage.click('#options .opt');
    await studentPage.waitForTimeout(1600);
  }
  await studentPage.waitForSelector('#quest-result.active', { timeout: 5000 });

  assert(store.progress && store.progress['owen-uid'] && store.progress['owen-uid']['c4_quest'], 'progress/owen-uid/c4_quest written after finishing the quiz');
  var rec = store.progress['owen-uid']['c4_quest'];
  var sessionKeys = Object.keys((store.sessions && store.sessions['owen-uid']) || {});
  assert(sessionKeys.length === 1, 'exactly one session logged under sessions/owen-uid');
  var sessionEntry = store.sessions['owen-uid'][sessionKeys[0]];
  assert(sessionEntry.total === 5 && sessionEntry.score >= 0 && sessionEntry.score <= 5, 'session score is well-formed (score=' + sessionEntry.score + '/' + sessionEntry.total + ')');
  var expectedXp = sessionEntry.score * 20 + (sessionEntry.score === 5 ? 50 : 0);
  assert(sessionEntry.xpEarned === expectedXp, 'session xpEarned matches score*20(+50 perfect bonus) formula (xpEarned=' + sessionEntry.xpEarned + ')');
  assert(rec.xp === sessionEntry.xpEarned, 'progress xp total matches the one session\'s xpEarned (rec.xp=' + rec.xp + ')');
  await studentPage.click('#quest-result button:has-text("HOME BASE")');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[3] Student plays a full Recall round (Character Drill, all phrases)');
  await studentPage.click('.game-card:has-text("RECALL")');
  await studentPage.waitForSelector('#recall-home.active');
  await studentPage.click('#recall-home >> text=CHARACTER DRILL');
  await studentPage.waitForSelector('#recall-drill.active');
  var sentences = store.vocabSets.c4.sentences;
  for (var si = 0; si < sentences.length; si++) {
    var expectedChars = sentences[si].chars;
    for (var ci = 0; ci < expectedChars.length; ci++) {
      var nextChar = expectedChars[ci];
      await studentPage.locator('#recall-bank-tiles .bank-tile .t-ch', { hasText: nextChar }).first().click();
    }
    await studentPage.waitForSelector('#recall-next-btn:visible');
    await studentPage.click('#recall-next-btn');
  }
  await studentPage.waitForSelector('#recall-summary.active', { timeout: 5000 });
  assert(store.progress['owen-uid']['c4_recall'] && store.progress['owen-uid']['c4_recall'].xp > 0, 'progress/owen-uid/c4_recall written with xp > 0 (xp=' + store.progress['owen-uid']['c4_recall'].xp + ')');
  var recallSessions = Object.keys(store.sessions['owen-uid']).length;
  await studentPage.click('#recall-summary >> text=HOME BASE');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[4] Student plays Wall until natural game-over (no taps — tiles escape and deplete hp)');
  await studentPage.click('.game-card:has-text("WALL")');
  await studentPage.waitForSelector('#wall-home.active');
  await studentPage.click('#wall-home >> text=LAUNCH');
  await studentPage.waitForSelector('#wall-game.active');
  await studentPage.waitForSelector('#wall-over.active', { timeout: 45000 });
  assert(store.progress['owen-uid']['c4_wall'] !== undefined, 'progress/owen-uid/c4_wall written after game over');
  assert(Object.keys(store.sessions['owen-uid']).length === recallSessions + 1, 'exactly one new session logged for wall');
  await studentPage.click('#wall-over >> text=HOME');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[5] Student plays a full Handwrite round via self-grade (AI endpoint not configured in this stub)');
  await studentPage.click('.game-card:has-text("TRACE")');
  await studentPage.waitForSelector('#hw-home.active');
  await studentPage.click('#hw-home >> text=START MISSION');
  await studentPage.waitForSelector('#hw-write.active');
  var vocabCount = store.vocabSets.c4.vocab.length;
  for (var vi = 0; vi < vocabCount; vi++) {
    var canvasBox = await studentPage.locator('#hw-draw-canvas').boundingBox();
    await studentPage.mouse.move(canvasBox.x + 20, canvasBox.y + 20);
    await studentPage.mouse.down();
    await studentPage.mouse.move(canvasBox.x + 60, canvasBox.y + 60);
    await studentPage.mouse.up();
    await studentPage.click('#hw-self-grade-row >> text=Got it');
    await studentPage.waitForSelector('#hw-next-btn2:visible');
    await studentPage.click('#hw-next-btn2');
  }
  await studentPage.waitForSelector('#hw-summary2.active', { timeout: 5000 });
  assert(store.progress['owen-uid']['c4_handwrite'] && store.progress['owen-uid']['c4_handwrite'].xp === vocabCount * 30, 'progress/owen-uid/c4_handwrite xp = ' + vocabCount + ' × 30 (all self-graded correct)');
  await studentPage.click('#hw-summary2 >> text=HOME BASE');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[6] Student plays a full Dictation round via self-grade');
  await studentPage.click('.game-card:has-text("DICTATION")');
  await studentPage.waitForSelector('#dict-home.active');
  await studentPage.click('#dict-home >> text=START LISTENING MISSION');
  await studentPage.waitForSelector('#dict-practice.active');
  for (var di = 0; di < vocabCount; di++) {
    var dictCanvasBox = await studentPage.locator('#dict-cv').boundingBox();
    await studentPage.mouse.move(dictCanvasBox.x + 20, dictCanvasBox.y + 20);
    await studentPage.mouse.down();
    await studentPage.mouse.move(dictCanvasBox.x + 60, dictCanvasBox.y + 60);
    await studentPage.mouse.up();
    await studentPage.click('#dict-self-grade-row >> text=Got it');
    await studentPage.waitForSelector('#dict-next-btn:visible');
    await studentPage.click('#dict-next-btn');
  }
  assert(store.progress['owen-uid']['c4_dictation'] && store.progress['owen-uid']['c4_dictation'].xp === vocabCount * 30, 'progress/owen-uid/c4_dictation xp = ' + vocabCount + ' × 30 (all self-graded correct)');
  await studentPage.evaluate(function() { window.dictBackToApp(); });
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[7] Student plays Dino until natural game-over (no jumps — first cactus ends the run)');
  await studentPage.click('.game-card:has-text("DINO")');
  await studentPage.waitForSelector('#dino-home.active');
  await studentPage.click('#dino-home >> text=START RUN');
  await studentPage.waitForSelector('#dino-game.active');
  await studentPage.waitForSelector('#dino-over.active', { timeout: 8000 });
  assert(store.progress['owen-uid']['c4_dino'] !== undefined, 'progress/owen-uid/c4_dino written after game over');
  await studentPage.click('#dino-over >> text=HOME BASE');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[8] Student flies the space hub and lands on a real game');
  await studentPage.click('#home-student >> text=FLY THERE');
  await studentPage.waitForSelector('#hub-fly.active');
  await studentPage.waitForSelector('#hub-arrive.show', { timeout: 8000 });
  var arrivedTitle = await studentPage.textContent('#hub-arrive-title');
  assert(arrivedTitle.indexOf('QUEST') !== -1, 'ship lands on the first planet in GAMES order (Quest): got "' + arrivedTitle + '"');
  await studentPage.click('#hub-arrive-play');
  await studentPage.waitForSelector('#quest-home.active', { timeout: 3000 });
  assert(true, 'landing on the planet actually launched Quest (navTo + enter_quest), not just a placeholder link');
  await studentPage.click('#quest-home .back-btn');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[9] Student plays Claw: catches all 10 words via self-grade (SpeechRecognition isn\'t available in headless Chromium, so this exercises the always-visible self-grade path)');
  await studentPage.click('.game-card:has-text("CLAW")');
  await studentPage.waitForSelector('#claw-home.active');
  await studentPage.click('#claw-home >> text=START MACHINE');
  await studentPage.waitForSelector('#claw-game.active');

  // 5 columns of tiles, 2 stacked per column (10 total), spread across the
  // 40-560px clamped range. Rather than timing a claw move to land exactly
  // on a column (fragile — real setTimeout/rAF jitter of even ~100ms is
  // enough to blow past the 46px catch radius), reset to the left clamp
  // (timing-independent — any hold long enough guarantees the same exact
  // position) and sweep right in small steps dense enough that at least
  // two stops fall within radius of every column, dropping at each one.
  async function clawSweep(page) {
    await holdButton(page, '#claw-left-btn', 1700);
    var stepMs = 125; // ~40px per step — denser than the 46px catch radius
    var maxSteps = 14; // 40 + 14×40 = 600px, covers the full clamped range
    for (var step = 0; step <= maxSteps; step++) {
      if (await page.locator('#claw-summary.active').count()) return;
      if (!(await page.locator('#claw-game.active').count())) return;
      if (step > 0) await holdButton(page, '#claw-right-btn', stepMs);
      await page.click('#claw-drop-btn');
      await page.waitForTimeout(1000);
      if (await page.locator('#claw-speak.active').count()) {
        await page.click('#claw-speak >> text=Got it');
        await page.waitForSelector('#claw-next-btn:visible');
        await page.click('#claw-next-btn');
        await page.waitForTimeout(150);
      }
    }
  }
  await clawSweep(studentPage);
  if (!(await studentPage.locator('#claw-summary.active').count())) {
    await clawSweep(studentPage); // mop-up pass for anything the first sweep's steps straddled
  }
  await studentPage.waitForSelector('#claw-summary.active', { timeout: 5000 });
  assert(store.progress['owen-uid']['c4_claw'] && store.progress['owen-uid']['c4_claw'].xp === 10 * 30, 'progress/owen-uid/c4_claw xp = 10 × 30 (all 10 words caught and self-graded correct)');
  var clawSessionKeys = Object.keys(store.sessions['owen-uid']).filter(function(k) { return store.sessions['owen-uid'][k].game === 'claw'; });
  assert(clawSessionKeys.length === 1, 'exactly one claw session logged, only after the full round completed');
  await studentPage.click('#claw-summary >> text=HOME BASE');
  await studentPage.waitForSelector('#view-home.active');

  console.log('\n[10] Admin dashboard sees the student\'s progress + sessions across all 7 games');
  await adminPage.click('#home-admin .btn-primary');
  await adminPage.waitForSelector('#view-dashboard.active');
  await adminPage.waitForFunction(function() {
    return document.getElementById('dash-list').textContent.indexOf('Owen') !== -1;
  }, { timeout: 5000 });
  var dashText = await adminPage.textContent('#dash-list');
  assert(dashText.includes('Owen'), 'dashboard student list shows "Owen"');
  var sessText = await adminPage.textContent('#dash-sessions');
  for (var gi = 0; gi < ['quest', 'recall', 'wall', 'handwrite', 'dictation', 'dino', 'claw'].length; gi++) {
    var gname = ['quest', 'recall', 'wall', 'handwrite', 'dictation', 'dino', 'claw'][gi];
    assert(sessText.includes(gname), 'dashboard session history shows a ' + gname + ' session');
  }

  console.log('\n[11] Hostile checks — student page calls the database directly, bypassing all app UI');
  var deniedWholeProgress = await studentPage.evaluate(function() {
    return window.firebase.database().ref('progress').once('value').then(function() { return 'ALLOWED'; }).catch(function(e) { return 'DENIED: ' + e.message; });
  });
  assert(deniedWholeProgress.startsWith('DENIED'), 'student reading whole progress/ collection is denied: ' + deniedWholeProgress);

  var deniedOtherUser = await studentPage.evaluate(function() {
    return window.firebase.database().ref('progress/admin-uid').once('value').then(function() { return 'ALLOWED'; }).catch(function(e) { return 'DENIED: ' + e.message; });
  });
  assert(deniedOtherUser.startsWith('DENIED'), 'student reading progress/admin-uid (not their own) is denied: ' + deniedOtherUser);

  var allowedOwnPath = await studentPage.evaluate(function() {
    return window.firebase.database().ref('progress/owen-uid').once('value').then(function(snap) { return 'ALLOWED:' + JSON.stringify(snap.val() != null); }).catch(function(e) { return 'DENIED: ' + e.message; });
  });
  assert(allowedOwnPath.startsWith('ALLOWED'), 'student reading their own progress/owen-uid is allowed: ' + allowedOwnPath);

  var adminAllowedOther = await adminPage.evaluate(function() {
    return window.firebase.database().ref('progress/owen-uid').once('value').then(function(snap) { return 'ALLOWED:' + JSON.stringify(snap.val() != null); }).catch(function(e) { return 'DENIED: ' + e.message; });
  });
  assert(adminAllowedOther.startsWith('ALLOWED'), 'admin reading progress/owen-uid (not their own) is allowed: ' + adminAllowedOther);

  var studentDeniedVocabWrite = await studentPage.evaluate(function() {
    return window.firebase.database().ref('vocabSets/c4').set({ hacked: true }).then(function() { return 'ALLOWED'; }).catch(function(e) { return 'DENIED: ' + e.message; });
  });
  assert(studentDeniedVocabWrite.startsWith('DENIED'), 'student writing vocabSets/c4 (admin-only content) is denied: ' + studentDeniedVocabWrite);

  console.log('\n[12] No uncaught JS errors on either page across the whole run');
  assert(adminErrors.length === 0, 'admin page had no console/page errors' + (adminErrors.length ? ':\n    ' + adminErrors.join('\n    ') : ''));
  assert(studentErrors.length === 0, 'student page had no console/page errors' + (studentErrors.length ? ':\n    ' + studentErrors.join('\n    ') : ''));

  await browser.close();
  server.close();
  console.log('\nALL CHECKS PASSED\n');
}

main().catch(function(err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
