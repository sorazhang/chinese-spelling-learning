// app.js — entry point / composition root.
// The only file that: wires onAuthStateChanged, wires document-level
// listeners, and exposes every function any inline onclick handler
// (anywhere in index.html or any render...() template string) calls,
// via the single window-exposure call at the bottom of this file. Keep
// that list authoritative — see ARCHITECTURE.md for the audit script
// that checks it against index.html.
//
// nav.js's game grid looks up window['enter_' + game.id] to build a game's
// home screen when its card is tapped — every game's enter function MUST be
// exposed under that exact enter_<id> key (not camelCase) or the card will
// silently no-op on tap.

import { fbAuth, onAuthStateChanged, signOut } from './firebase.js';
import { S, isAdmin, loadVocabSets, ensureSeedVocabSets, loadProgress, loadUserProfile, saveUserProfile } from './data.js';
import { navTo, showScreen, applyRoleUI, buildGameGrid } from './nav.js';
import { toggleAuthMode, submitAuth, requestPasswordReset } from './auth.js';
import { buildStars } from './utils.js';
import { enterQuest, questBackToApp, startQuiz, selectOpt, showCodex } from './quest.js';
import { enterRecall, recallBackToApp, showStudy, navFocus, readThrough, startDrill, restartDrill, undoLast, showHint, nextPhrase } from './recall.js';
import { enterWall, wallBackToApp, startGame } from './wall.js';
import {
  enterHandwrite, hwBackToApp, showCx, startSession, togglePeek, toggleErase,
  clearCanvas, checkHandwriting, selfGrade, nextItem, initCanvas as initHwCanvas
} from './handwrite.js';
import {
  enterDictation, dictBackToApp, startDictation, clearAll, toggleEraseDict,
  speak, toggleHint, doCheck, grade, next as dictNext, initCanvas as initDictCanvas
} from './dictation.js';
import { enterDino, dinoBackToApp, startDinoRun, initCanvas as initDinoCanvas } from './dino.js';
import { enterSpaceHub, spaceHubBackToApp, hubPlay, hubContinue, initCanvas as initHubCanvas } from './spacehub.js';
import {
  enterClaw, clawBackToApp, startClawRound, startListening, clawSelfGrade,
  nextClawRound, initCanvas as initClawCanvas
} from './claw.js';
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
  initHwCanvas();
  initDictCanvas();
  initDinoCanvas();
  initHubCanvas();
  initClawCanvas();

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
  showScreen: showScreen,
  enterDashboard: enterDashboard,
  dashboardBackToApp: dashboardBackToApp,

  // Quest
  enter_quest: enterQuest,
  questBackToApp: questBackToApp,
  startQuiz: startQuiz,
  selectOpt: selectOpt,
  showCodex: showCodex,

  // Recall
  enter_recall: enterRecall,
  recallBackToApp: recallBackToApp,
  showStudy: showStudy,
  navFocus: navFocus,
  readThrough: readThrough,
  startDrill: startDrill,
  restartDrill: restartDrill,
  undoLast: undoLast,
  showHint: showHint,
  nextPhrase: nextPhrase,

  // Wall
  enter_wall: enterWall,
  wallBackToApp: wallBackToApp,
  startGame: startGame,

  // Handwrite
  enter_handwrite: enterHandwrite,
  hwBackToApp: hwBackToApp,
  showCx: showCx,
  startSession: startSession,
  togglePeek: togglePeek,
  toggleErase: toggleErase,
  clearCanvas: clearCanvas,
  checkHandwriting: checkHandwriting,
  selfGrade: selfGrade,
  nextItem: nextItem,

  // Dictation
  enter_dictation: enterDictation,
  dictBackToApp: dictBackToApp,
  startDictation: startDictation,
  clearAll: clearAll,
  toggleEraseDict: toggleEraseDict,
  speak: speak,
  toggleHint: toggleHint,
  doCheck: doCheck,
  grade: grade,
  next: dictNext,

  // Dino
  enter_dino: enterDino,
  dinoBackToApp: dinoBackToApp,
  startDinoRun: startDinoRun,

  // Space hub (alternate navigation)
  enterSpaceHub: enterSpaceHub,
  spaceHubBackToApp: spaceHubBackToApp,
  hubPlay: hubPlay,
  hubContinue: hubContinue,

  // Claw
  enter_claw: enterClaw,
  clawBackToApp: clawBackToApp,
  startClawRound: startClawRound,
  startListening: startListening,
  clawSelfGrade: clawSelfGrade,
  nextClawRound: nextClawRound
});

boot();
