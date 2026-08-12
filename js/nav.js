// nav.js — view routing + role-based UI toggling.

import { S } from './data.js';

// One entry per ported game. Each game exposes window['enter_'+id]() to
// build its home screen when navigated to; app.js wires that exposure.
// `color` is each game's accent — used here for the grid, and by the
// space hub (js/spacehub.js) for each planet, so there's one place that
// defines a game's identity instead of two color lists drifting apart.
export var GAMES = [
  { id: 'quest', icon: '🎯', name: '汉字 QUEST', sub: 'flashcard quiz', color: '#00f5ff' },
  { id: 'recall', icon: '📖', name: '段落 RECALL', sub: 'sentence builder', color: '#8844ff' },
  { id: 'wall', icon: '🧱', name: '汉字 WALL', sub: 'character shooter', color: '#ff6b35' },
  { id: 'handwrite', icon: '✍️', name: '手写 TRACE', sub: 'handwriting + AI', color: '#22ffaa' },
  { id: 'dictation', icon: '🔊', name: '听写 DICTATION', sub: 'audio + handwriting', color: '#ffa500' },
  { id: 'dino', icon: '🦖', name: '拼音 DINO', sub: 'jump the pinyin', color: '#ffd700' }
];

export function navTo(viewId) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
  var target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
}

// Generic screen switcher for nested screens within a single view (scoped
// to that view's own .screen siblings) — used by inline handlers that
// navigate within a game's own view rather than between top-level views.
export function showScreen(id) {
  var target = document.getElementById(id);
  if (!target) return;
  var view = target.closest('.view');
  var siblings = view ? view.querySelectorAll('.screen') : [target];
  for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove('active');
  target.classList.add('active');
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
