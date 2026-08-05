// auth.js — login/signup/reset-password forms.

import { fbAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from './firebase.js';
import { saveUserProfile } from './data.js';
import { toast } from './utils.js';

var mode = 'login'; // 'login' | 'signup'

export function toggleAuthMode() {
  mode = mode === 'login' ? 'signup' : 'login';
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'LOGIN' : 'SIGN UP';
  document.getElementById('auth-switch-label').textContent = mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in';
  document.getElementById('auth-name-field').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-error').textContent = '';
}

export function submitAuth() {
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  var errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Enter email and password.'; return; }

  if (mode === 'login') {
    signInWithEmailAndPassword(fbAuth, email, password).catch(function(e) {
      errEl.textContent = e.message;
    });
  } else {
    var name = document.getElementById('auth-name').value.trim() || email.split('@')[0];
    createUserWithEmailAndPassword(fbAuth, email, password).then(function(cred) {
      return updateProfile(cred.user, { displayName: name }).then(function() {
        return saveUserProfile(cred.user.uid, { displayName: name, email: email });
      });
    }).catch(function(e) {
      errEl.textContent = e.message;
    });
  }
}

export function requestPasswordReset() {
  var email = document.getElementById('auth-email').value.trim();
  var errEl = document.getElementById('auth-error');
  if (!email) { errEl.textContent = 'Enter your email first.'; return; }
  sendPasswordResetEmail(fbAuth, email).then(function() {
    toast('Password reset email sent');
  }).catch(function(e) {
    errEl.textContent = e.message;
  });
}
