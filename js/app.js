// app.js — entry point / composition root.
// The only file that: wires onAuthStateChanged, wires document-level
// listeners, and exposes every function any inline onclick handler
// (anywhere in index.html or any render...() template string) calls,
// via the single window-exposure call at the bottom of this file. Keep
// that list authoritative — see ARCHITECTURE.md for the audit script
// that checks it against index.html.

import { fbAuth, onAuthStateChanged, signOut } from './firebase.js';
import { S, isAdmin, loadVocabSets, ensureSeedVocabSets, loadProgress, loadUserProfile, saveUserProfile } from './data.js';
import { navTo, applyRoleUI, buildGameGrid } from './nav.js';
import { toggleAuthMode, submitAuth, requestPasswordReset } from './auth.js';
import { buildStars } from './utils.js';
import { enterQuest, questBackToApp, startQuiz, selectOpt, showCodex } from './quest.js';
import { enterDashboard, dashboardBackToApp } from './dashboard.js';

function togglePinyin() {
  S.pinyinOn = !S.pinyinOn;
  document.getElementById('pinyin-btn').textContent = '拼音 ' + (S.pinyinOn ? 'ON' : 'OFF');
  try { localStorage.setItem('pinyin_on', S.pinyinOn); } catch (e) {}
  for (var i = 0; i < S.pinyinListeners.length; i++) S.pinyinListeners[i]();
}

function doLogout() {
  signOut(fbAuth);
}

function setChromeVisible(visible) {
  var display = visible ? '' : 'none';
  document.getElementById('pinyin-btn').style.display = display;
  document.getElementById('logout-btn').style.display = display;
  document.getElementById('who-badge').style.display = display;
}

function onSignedOut() {
  S.uid = null; S.user = ''; S.email = ''; S.role = 'student';
  setChromeVisible(false);
  navTo('auth');
}

function onSignedIn(user) {
  S.uid = user.uid;
  S.email = user.email;
  S.role = isAdmin(user.email) ? 'admin' : 'student';
  setChromeVisible(true);

  loadUserProfile(user.uid).then(function(profile) {
    S.user = (profile && profile.displayName) || user.displayName || user.email.split('@')[0];
    if (!profile) {
      // first login after a signup that predates the profile write, or an
      // account created outside the app — self-heal so the dashboard has a name
      saveUserProfile(user.uid, { displayName: S.user, email: user.email });
    }
    applyRoleUI();
  });

  loadVocabSets().then(function() {
    if (S.role === 'admin') return ensureSeedVocabSets();
  }).then(function() {
    return loadProgress();
  }).then(function() {
    buildGameGrid();
    applyRoleUI();
    navTo('home');
  });
}

function boot() {
  try { S.pinyinOn = localStorage.getItem('pinyin_on') !== 'false'; } catch (e) {}
  document.getElementById('pinyin-btn').textContent = '拼音 ' + (S.pinyinOn ? 'ON' : 'OFF');
  buildStars();

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    // collect every popup's close function here as features add popups
  });

  onAuthStateChanged(fbAuth, function(user) {
    if (user) onSignedIn(user); else onSignedOut();
  });
}

Object.assign(window, {
  toggleAuthMode: toggleAuthMode,
  submitAuth: submitAuth,
  requestPasswordReset: requestPasswordReset,
  togglePinyin: togglePinyin,
  doLogout: doLogout,
  navTo: navTo,
  enterQuest: enterQuest,
  questBackToApp: questBackToApp,
  startQuiz: startQuiz,
  selectOpt: selectOpt,
  showCodex: showCodex,
  enterDashboard: enterDashboard,
  dashboardBackToApp: dashboardBackToApp
});

boot();
