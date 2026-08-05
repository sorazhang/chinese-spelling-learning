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
  await wireFakeBackend(studentPage, student, store);
  await studentPage.goto(baseUrl);
  await studentPage.waitForSelector('#view-home.active', { timeout: 10000 });
  await studentPage.click('.game-card');
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

  console.log('\n[3] Admin dashboard sees the student\'s progress + session');
  await adminPage.click('#home-admin .btn-primary');
  await adminPage.waitForSelector('#view-dashboard.active');
  await adminPage.waitForFunction(function() {
    return document.getElementById('dash-list').textContent.indexOf('Owen') !== -1;
  }, { timeout: 5000 });
  var dashText = await adminPage.textContent('#dash-list');
  assert(dashText.includes('Owen'), 'dashboard student list shows "Owen"');
  var sessText = await adminPage.textContent('#dash-sessions');
  assert(sessText.includes('quest'), 'dashboard session history shows the quest session');

  console.log('\n[4] Hostile checks — student page calls the database directly, bypassing all app UI');
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

  await browser.close();
  server.close();
  console.log('\nALL CHECKS PASSED\n');
}

main().catch(function(err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
