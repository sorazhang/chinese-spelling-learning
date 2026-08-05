// nav.js — view routing + role-based UI toggling.

import { S } from './data.js';

// One entry per ported game. Each game exposes window['enter_'+id]() to
// build its home screen when navigated to; app.js wires that exposure.
export var GAMES = [
  { id: 'quest', icon: '🎯', name: '汉字 QUEST', sub: 'flashcard quiz' }
];

export function navTo(viewId) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
  var target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
}

export function applyRoleUI() {
  var isAdminRole = S.role === 'admin';
  document.getElementById('home-student').style.display = isAdminRole ? 'none' : 'block';
  document.getElementById('home-admin').style.display = isAdminRole ? 'block' : 'none';
  document.getElementById('home-sub').textContent = isAdminRole ? 'TEACHER MODE' : 'CHOOSE A GAME';
  document.getElementById('who-badge').textContent = (S.user || S.email || '') + (isAdminRole ? ' · ADMIN' : '');
}

export function buildGameGrid() {
  var grid = document.getElementById('game-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var i = 0; i < GAMES.length; i++) {
    (function(g) {
      var card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = '<div class="game-icon">' + g.icon + '</div><div><div class="game-name">' + g.name + '</div><div class="game-sub">' + g.sub.toUpperCase() + '</div></div>';
      card.onclick = function() {
        navTo(g.id);
        var enterFn = window['enter_' + g.id];
        if (enterFn) enterFn();
      };
      grid.appendChild(card);
    })(GAMES[i]);
  }
}
