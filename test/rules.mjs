// rules.mjs — Node-side re-implementation of database.rules.json, used by
// the test harness's fake backend to reject reads/writes the same way the
// real Firebase rules would. Keep this in sync with database.rules.json
// whenever that file changes — that's the whole point of this test (§10.3:
// "re-implement the rules' logic ... if this is properly denied, your
// rules design is sound").

export var ADMIN_EMAIL = 'sorazhang@gmail.com';

export function pathParts(path) {
  return String(path).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

function isAdmin(email) { return email === ADMIN_EMAIL; }

export function checkRead(parts, uid, email) {
  var authed = uid != null;
  var admin = authed && isAdmin(email);
  var top = parts[0];
  if (top === 'vocabSets') return authed;
  if (top === 'users' || top === 'progress' || top === 'sessions') {
    if (parts.length <= 1) return admin; // whole-collection read = admin only
    var ownerUid = parts[1];
    return authed && (ownerUid === uid || admin);
  }
  return false; // deny by default
}

export function checkWrite(parts, uid, email) {
  var authed = uid != null;
  var admin = authed && isAdmin(email);
  var top = parts[0];
  if (top === 'vocabSets') return admin;
  if (top === 'users' || top === 'progress' || top === 'sessions') {
    if (parts.length <= 1) return admin; // whole-collection write = admin only
    var ownerUid = parts[1];
    return authed && (ownerUid === uid || admin);
  }
  return false;
}

export function getAtPath(store, parts) {
  var node = store;
  for (var i = 0; i < parts.length; i++) {
    if (node == null || typeof node !== 'object') return null;
    node = node[parts[i]];
  }
  return node === undefined ? null : node;
}

export function setAtPath(store, parts, val) {
  if (parts.length === 0) return;
  var node = store;
  for (var i = 0; i < parts.length - 1; i++) {
    var k = parts[i];
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  var lastKey = parts[parts.length - 1];
  if (val === null || val === undefined) delete node[lastKey];
  else node[lastKey] = val;
}
