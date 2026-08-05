// data.js — the only file that knows about Firebase paths.
// Every feature file works with plain objects on S and calls a named
// save/load function here without knowing where things live in the DB.
//
// Firebase shape (see ARCHITECTURE.md and database.rules.json):
//   vocabSets/{setId}                  -- shared, admin-writable, everyone-readable
//   users/{uid}                        -- {displayName, email} — personal, admin can read all
//   progress/{uid}/{setId_gameId}      -- {xp, streak, correct, updatedAt} — personal, admin can read all
//   sessions/{uid}/{sessionId}         -- {setId, game, score, total, xpEarned, ts} — personal, admin can read all

import { fbAuth, fbDb, ADMIN_EMAIL, ref, get, set, push, onValue } from './firebase.js';

export var S = {
  user: '',          // display name
  email: '',
  role: 'student',    // 'admin' | 'student'
  uid: null,
  pinyinOn: true,
  pinyinListeners: [], // fns to call when pinyin is toggled (each feature registers its own refresh)
  vocabSets: {},      // setId -> {label, vocab:[...], sentences:[...]}
  progress: {},        // recordId ("c4_quest") -> {xp,streak,correct,updatedAt} — current user only
  dashboard: {         // admin-only aggregate view
    users: {},          // uid -> {displayName,email}
    progress: {},        // uid -> { recordId -> record }
    sessions: {}          // uid -> { sessionId -> record }
  }
};

function progressKey(setId, game) { return setId + '_' + game; }

// ── vocab sets ──────────────────────────────────────────────────────────────
export function loadVocabSets() {
  return get(ref(fbDb, 'vocabSets')).then(function(snap) {
    S.vocabSets = snap.val() || {};
    return S.vocabSets;
  });
}

export function saveVocabSet(setId, data) {
  return set(ref(fbDb, 'vocabSets/' + setId), data);
}

// Seed data for a fresh Firebase project (nothing under vocabSets/ yet).
// The admin's first login writes these once; every login after that just reads.
export var DEFAULT_VOCAB_SETS = {
  c4: {
    label: 'Char 4 · 环境篇',
    vocab: [
      { char: '环保袋', py: 'huán bǎo dài', en: 'eco / reusable bag' },
      { char: '组屋楼下', py: 'zǔ wū lóu xià', en: 'downstairs of the flat' },
      { char: '停车场', py: 'tíng chē chǎng', en: 'car park' },
      { char: '几辆汽车', py: 'jǐ liàng qì chē', en: 'several cars' },
      { char: '灯一直亮着', py: 'dēng yī zhí liàng zhe', en: 'lights kept on' },
      { char: '所以', py: 'suǒ yǐ', en: 'therefore / so' },
      { char: '一张纸', py: 'yī zhāng zhǐ', en: 'a piece of paper' },
      { char: '日用品', py: 'rì yòng pǐn', en: 'daily necessities' },
      { char: '认为', py: 'rèn wéi', en: 'to think / believe' },
      { char: '责任感', py: 'zé rèn gǎn', en: 'sense of responsibility' }
    ]
  }
};

export function ensureSeedVocabSets() {
  if (Object.keys(S.vocabSets).length > 0) return Promise.resolve(S.vocabSets);
  var writes = [];
  for (var setId in DEFAULT_VOCAB_SETS) {
    writes.push(saveVocabSet(setId, DEFAULT_VOCAB_SETS[setId]));
  }
  return Promise.all(writes).then(loadVocabSets);
}

// ── user profile ────────────────────────────────────────────────────────────
export function saveUserProfile(uid, profile) {
  return set(ref(fbDb, 'users/' + uid), profile);
}

export function loadUserProfile(uid) {
  return get(ref(fbDb, 'users/' + uid)).then(function(snap) { return snap.val(); });
}

// ── per-user progress (xp/streak/correct) ───────────────────────────────────
export function loadProgress() {
  if (!S.uid) return Promise.resolve({});
  return get(ref(fbDb, 'progress/' + S.uid)).then(function(snap) {
    S.progress = snap.val() || {};
    return S.progress;
  });
}

export function getProgressRecord(setId, game) {
  return S.progress[progressKey(setId, game)] || { xp: 0, streak: 0, correct: 0 };
}

export function saveProgressRecord(setId, game, record) {
  var key = progressKey(setId, game);
  record.updatedAt = Date.now();
  S.progress[key] = record;
  if (!S.uid) return Promise.resolve();
  return set(ref(fbDb, 'progress/' + S.uid + '/' + key), record);
}

// ── session history log (append-only) ───────────────────────────────────────
export function logSession(entry) {
  if (!S.uid) return Promise.resolve();
  entry.ts = Date.now();
  return push(ref(fbDb, 'sessions/' + S.uid), entry);
}

// ── admin dashboard reads (whole-collection, admin-only per rules) ─────────
export function loadDashboard() {
  return Promise.all([
    get(ref(fbDb, 'users')).then(function(snap) { S.dashboard.users = snap.val() || {}; }),
    get(ref(fbDb, 'progress')).then(function(snap) { S.dashboard.progress = snap.val() || {}; }),
    get(ref(fbDb, 'sessions')).then(function(snap) { S.dashboard.sessions = snap.val() || {}; })
  ]).then(function() { return S.dashboard; });
}

// ── auth helpers used by auth.js/app.js ─────────────────────────────────────
export function isAdmin(email) { return email === ADMIN_EMAIL; }
