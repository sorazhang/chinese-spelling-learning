// stub-firebase.js — fake window.firebase injected into the page via
// page.addInitScript BEFORE js/firebase.js runs, per ARCHITECTURE.md §10.
// It never talks to a real Firebase project: every db read/write is
// forwarded to window.__dbRead / window.__dbWrite, which the Node test
// script exposes (page.exposeFunction) so multiple simulated "logged in"
// pages can share one in-memory store and get real permission-denied
// rejections from a re-implementation of database.rules.json.
//
// Must be fully self-contained (no references to outer closure variables) —
// Playwright serializes this function's source to run it in the page.
export function installFakeFirebase(identity) {
  var currentUser = identity || null; // {uid, email, displayName} | null
  var authListeners = [];

  function Snapshot(val) { this._val = val; }
  Snapshot.prototype.val = function() { return this._val === undefined ? null : this._val; };

  function DbRef(path) { this.path = path; }
  DbRef.prototype.push = function(val) {
    var key = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var childPath = this.path + '/' + key;
    var p = window.__dbWrite(childPath, val === undefined ? null : val).then(function() {
      return new DbRef(childPath);
    });
    p.key = key;
    return p;
  };
  DbRef.prototype.set = function(val) { return window.__dbWrite(this.path, val === undefined ? null : val); };
  DbRef.prototype.once = function() { return window.__dbRead(this.path).then(function(val) { return new Snapshot(val); }); };
  DbRef.prototype.on = function(eventType, cb) {
    window.__dbRead(this.path).then(function(val) { cb(new Snapshot(val)); });
  };
  DbRef.prototype.off = function() {};

  function Database() {}
  Database.prototype.ref = function(path) { return new DbRef(path); };

  function Auth() {}
  Auth.prototype.onAuthStateChanged = function(cb) {
    authListeners.push(cb);
    setTimeout(function() { cb(currentUser); }, 0);
    return function() {};
  };
  Auth.prototype.signInWithEmailAndPassword = function() {
    return Promise.reject(new Error('sign-in form is not exercised by the stub harness'));
  };
  Auth.prototype.createUserWithEmailAndPassword = function() {
    return Promise.reject(new Error('sign-up form is not exercised by the stub harness'));
  };
  Auth.prototype.signOut = function() {
    currentUser = null;
    for (var i = 0; i < authListeners.length; i++) authListeners[i](null);
    return Promise.resolve();
  };
  Auth.prototype.sendPasswordResetEmail = function() { return Promise.resolve(); };

  window.firebase = {
    initializeApp: function() { return {}; },
    auth: function() { return new Auth(); },
    database: function() { return new Database(); }
  };
}
