// Firebase SDK init — the only file that knows about project config.
//
// Deliberately uses the Firebase COMPAT (v8-style) global `window.firebase`
// API, loaded via classic <script> tags in index.html, rather than modular
// v9 `import ... from 'https://www.gstatic.com/...'`. This is what makes the
// app testable per ARCHITECTURE.md §10: a test harness can inject a fake
// `window.firebase` (page.addInitScript) BEFORE this module runs, and this
// file — and everything importing from it — can't tell the difference. The
// functions below just adapt the compat call shapes to the same modular-style
// function signatures (`get(ref)`, `set(ref, val)`, ...) the rest of the app
// already uses, so app code never touches `window.firebase` directly.
//
// TODO before this app can run for real:
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. Enable Authentication → Email/Password sign-in method
//   3. Enable Realtime Database, then paste database.rules.json (repo root)
//      into the Rules tab in the console
//   4. Replace firebaseConfig below with your project's real config
//      (Project settings → General → Your apps → SDK setup and config)
//   5. Set ADMIN_EMAIL to the parent/teacher account's real login email
//      (must match database.rules.json's admin check exactly)

var firebaseConfig = {
  apiKey: 'TODO-REPLACE-ME',
  authDomain: 'TODO-REPLACE-ME.firebaseapp.com',
  databaseURL: 'https://TODO-REPLACE-ME-default-rtdb.firebaseio.com',
  projectId: 'TODO-REPLACE-ME',
  storageBucket: 'TODO-REPLACE-ME.appspot.com',
  messagingSenderId: 'TODO-REPLACE-ME',
  appId: 'TODO-REPLACE-ME'
};

export var ADMIN_EMAIL = 'sorazhang@gmail.com';

var app = window.firebase.initializeApp(firebaseConfig);

export var fbAuth = window.firebase.auth();
export var fbDb = window.firebase.database();

// ── DB adapter (compat ref/once/set/push -> modular-style functions) ───────
export function ref(db, path) { return db.ref(path); }
export function get(r) { return r.once('value'); }
export function set(r, val) { return r.set(val); }
export function push(r, val) { return r.push(val); }
export function onValue(r, cb) {
  var handler = function(snap) { cb(snap); };
  r.on('value', handler);
  return function() { r.off('value', handler); };
}

// ── Auth adapter ─────────────────────────────────────────────────────────
export function signInWithEmailAndPassword(auth, email, password) { return auth.signInWithEmailAndPassword(email, password); }
export function createUserWithEmailAndPassword(auth, email, password) { return auth.createUserWithEmailAndPassword(email, password); }
export function signOut(auth) { return auth.signOut(); }
export function onAuthStateChanged(auth, cb) { return auth.onAuthStateChanged(cb); }
export function sendPasswordResetEmail(auth, email) { return auth.sendPasswordResetEmail(email); }
export function updateProfile(user, data) { return user.updateProfile(data); }
