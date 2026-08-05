// dashboard.js — teacher/admin view: XP per student + recent session history.
// Reads the admin-only whole-collection view of progress/ and sessions/
// (see database.rules.json — only the ADMIN_EMAIL account can read these roots).

import { S, loadDashboard } from './data.js';
import { esc, fmtDate } from './utils.js';
import { navTo } from './nav.js';

export function enterDashboard() {
  navTo('dashboard');
  var listEl = document.getElementById('dash-list');
  listEl.innerHTML = '<div class="dash-row"><span class="dash-name">Loading…</span></div>';
  loadDashboard().then(renderDashboard);
}

export function dashboardBackToApp() {
  navTo('home');
}

export function renderDashboard() {
  var listEl = document.getElementById('dash-list');
  var sessEl = document.getElementById('dash-sessions');
  listEl.innerHTML = '';
  sessEl.innerHTML = '';

  var users = S.dashboard.users || {};
  var progress = S.dashboard.progress || {};
  var sessions = S.dashboard.sessions || {};

  // No "list all users" API without the Admin SDK — the real roster is
  // whichever uids have actually written a progress record.
  var uids = Object.keys(progress);
  if (uids.length === 0) {
    listEl.innerHTML = '<div class="dash-row"><span class="dash-name">No student activity yet.</span></div>';
  }
  for (var i = 0; i < uids.length; i++) {
    var uid = uids[i];
    var profile = users[uid] || {};
    var name = profile.displayName || profile.email || uid.slice(0, 6);
    var recs = progress[uid] || {};
    var totalXp = 0;
    for (var key in recs) totalXp += (recs[key].xp || 0);
    var row = document.createElement('div');
    row.className = 'dash-row';
    row.innerHTML = '<span class="dash-name">' + esc(name) + '</span><span class="dash-xp">' + totalXp + ' XP</span>';
    listEl.appendChild(row);
  }

  var allSessions = [];
  for (var uid2 in sessions) {
    var profile2 = users[uid2] || {};
    var name2 = profile2.displayName || uid2.slice(0, 6);
    var userSessions = sessions[uid2] || {};
    for (var sid in userSessions) {
      var s = userSessions[sid];
      allSessions.push({ name: name2, game: s.game, score: s.score, total: s.total, xpEarned: s.xpEarned, ts: s.ts });
    }
  }
  allSessions.sort(function(a, b) { return b.ts - a.ts; });

  if (allSessions.length === 0) {
    sessEl.innerHTML = '<div class="session-row"><span>No sessions logged yet.</span></div>';
  }
  for (var i2 = 0; i2 < Math.min(30, allSessions.length); i2++) {
    var s2 = allSessions[i2];
    var row2 = document.createElement('div');
    row2.className = 'session-row';
    row2.innerHTML = '<span>' + esc(s2.name) + ' · ' + esc(s2.game) + '</span><span>' + s2.score + '/' + s2.total + ' · +' + s2.xpEarned + 'XP · ' + fmtDate(s2.ts) + '</span>';
    sessEl.appendChild(row2);
  }
}
