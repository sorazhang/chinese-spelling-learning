// wall.js — 汉字 WALL falling-character shooter, ported from char4-wall.html.

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { esc } from './utils.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'wall';
var GLOWS = ['#ff6b35', '#00f5ff', '#a855f7', '#22d3ee', '#f59e0b', '#ec4899'];

var g = {};
var raf = null;
var lastT = 0;

function vocab() {
  var set = S.vocabSets[SET_ID];
  return (set && set.vocab) || [];
}

function showWallScreen(id) {
  var screens = document.querySelectorAll('#view-wall .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterWall() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('wall-hi-val').textContent = rec.hi || 0;
  document.getElementById('wall-xp-val').textContent = rec.xp || 0;
  document.getElementById('wall-vocab-count').textContent = vocab().length;
  showWallScreen('wall-home');
}

export function wallBackToApp() {
  cancelAnimationFrame(raf);
  g.alive = false;
  navTo('home');
}

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pickTarget(excl) {
  var cands = vocab().filter(function(v) { return v.char !== (excl || '!!'); });
  return rnd(cands);
}

export function startGame() {
  if (vocab().length < 2) return;
  cancelAnimationFrame(raf);
  var arena = document.getElementById('wall-arena');
  var stale = arena.querySelectorAll('.tile,.explosion');
  for (var i = 0; i < stale.length; i++) stale[i].remove();
  g = { tiles: [], target: pickTarget(null), score: 0, combo: 0, maxCombo: 0, hp: 3, level: 1, hits: 0, spawnCd: 600, alive: true };
  lastT = 0;
  updateHUD();
  showWallScreen('wall-game');
  raf = requestAnimationFrame(tick);
}

function updateHUD() {
  var hearts = '';
  for (var i = 0; i < 3; i++) hearts += '<span style="font-size:20px;filter:' + (i < g.hp ? 'none' : 'grayscale(1) opacity(.2)') + '">❤️</span>';
  document.getElementById('wall-hearts').innerHTML = hearts;
  document.getElementById('wall-lv-badge').textContent = 'LV' + g.level;
  document.getElementById('wall-score-val').textContent = g.score;
  document.getElementById('wall-target-meaning').textContent = g.target.en.toUpperCase();
  document.getElementById('wall-target-py').textContent = S.pinyinOn ? g.target.py : '';
  var combo = document.getElementById('wall-combo-row');
  combo.textContent = g.combo >= 2 ? g.combo + '× COMBO!' : '';
}

function spawnTile() {
  var hasTarget = g.tiles.some(function(t) { return t.data.char === g.target.char && t.pct < 80; });
  var data;
  if (hasTarget) { do { data = rnd(vocab()); } while (data.char === g.target.char); } else { data = g.target; }
  var usedCols = {};
  g.tiles.forEach(function(t) { if (t.pct < 22) usedCols[t.col] = true; });
  var free = [0, 1, 2].filter(function(c) { return !usedCols[c]; });
  if (!free.length) return;
  var col = rnd(free);
  var arena = document.getElementById('wall-arena');
  var el = document.createElement('div');
  el.className = 'tile';
  var glow = GLOWS[Math.floor(Math.random() * GLOWS.length)];
  el.style.left = (col * 33.3 + 16.65) + '%';
  el.style.top = '-15%';
  el.style.borderColor = glow + '55';
  el.style.boxShadow = '0 0 10px ' + glow + '20';
  var cl = data.char.length;
  var fs = cl <= 2 ? 24 : cl <= 4 ? 18 : 13;
  el.innerHTML = (S.pinyinOn ? '<div class="tile-py" style="color:' + glow + '99">' + esc(data.py) + '</div>' : '') + '<div class="tile-char" style="font-size:' + fs + 'px;color:#fff">' + esc(data.char) + '</div>';
  arena.appendChild(el);
  var tile = { el: el, data: data, col: col, pct: -15, glow: glow, id: Math.random() };
  el.addEventListener('touchstart', function(e) { e.preventDefault(); shoot(tile); }, { passive: false });
  el.addEventListener('mousedown', function() { shoot(tile); });
  g.tiles.push(tile);
}

function tick(ts) {
  if (!g.alive) return;
  var dt = lastT ? Math.min(ts - lastT, 100) : 16;
  lastT = ts;
  g.spawnCd -= dt;
  if (g.spawnCd <= 0) { spawnTile(); g.spawnCd = Math.max(950, 2600 - g.level * 200); }
  var spd = (0.22 + g.level * 0.035) * (dt / 16);
  var escaped = [];
  for (var i = 0; i < g.tiles.length; i++) {
    var t = g.tiles[i];
    t.pct += spd;
    var isDanger = t.pct > 70;
    t.el.style.top = Math.min(91, t.pct) + '%';
    if (isDanger) { t.el.classList.add('danger-tile'); t.el.style.borderColor = 'rgba(255,60,60,.7)'; }
    if (t.pct >= 97 && t.data.char === g.target.char) escaped.push(t);
  }
  for (var j = 0; j < escaped.length; j++) {
    var et = escaped[j];
    g.hp = Math.max(0, g.hp - 1);
    g.combo = 0;
    et.el.remove();
    g.tiles = g.tiles.filter(function(x) { return x.id !== et.id; });
    if (g.hp <= 0) { endGame(); return; }
    g.target = pickTarget(g.target.char);
  }
  g.tiles = g.tiles.filter(function(t) { if (t.pct >= 100) { t.el.remove(); return false; } return true; });
  updateHUD();
  raf = requestAnimationFrame(tick);
}

function shoot(tile) {
  if (!g.alive) return;
  var arena = document.getElementById('wall-arena');
  var correct = tile.data.char === g.target.char;
  var ex = document.createElement('div');
  ex.className = 'explosion';
  ex.style.left = (tile.col * 33.3 + 16.65) + '%';
  ex.style.top = tile.pct + '%';
  if (correct) {
    ex.innerHTML = '<div class="exp-hit">💥</div><div style="font-family:Orbitron,monospace;font-size:12px;font-weight:700;color:#00ff88;white-space:nowrap">+' + Math.min(g.combo + 1, 5) * 10 + '</div>';
    g.combo++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.score += Math.min(g.combo, 5) * 10;
    g.hits++;
    tile.el.remove();
    g.tiles = g.tiles.filter(function(t) { return t.id !== tile.id; });
    if (g.hits % 6 === 0) g.level = Math.min(g.level + 1, 10);
    g.target = pickTarget(tile.data.char);
  } else {
    ex.innerHTML = '<div class="exp-miss">❌</div>';
    g.combo = 0;
    g.hp = Math.max(0, g.hp - 1);
    if (g.hp <= 0) {
      arena.appendChild(ex);
      setTimeout(function() { ex.remove(); }, 500);
      endGame();
      return;
    }
  }
  arena.appendChild(ex);
  setTimeout(function() { ex.remove(); }, 800);
}

function endGame() {
  g.alive = false;
  cancelAnimationFrame(raf);
  var earned = Math.floor(g.score / 5);
  var rec = getProgressRecord(SET_ID, GAME_ID);
  rec.xp += earned;
  var newHi = g.score > (rec.hi || 0);
  if (newHi) rec.hi = g.score;
  saveProgressRecord(SET_ID, GAME_ID, rec);
  logSession({ setId: SET_ID, game: GAME_ID, score: g.score, total: null, xpEarned: earned });

  document.getElementById('wall-hi-val').textContent = rec.hi || 0;
  document.getElementById('wall-xp-val').textContent = rec.xp;

  var grades = [{ min: 200, text: 'LEGENDARY! 🌟', col: '#ffd700' }, { min: 120, text: 'EXCELLENT! 🔥', col: '#00ff88' }, { min: 60, text: 'WELL DONE! 💪', col: '#00cfff' }, { min: 0, text: 'KEEP GOING! ✊', col: '#ff6b35' }];
  var grade = grades[grades.length - 1];
  for (var i = 0; i < grades.length; i++) if (g.score >= grades[i].min) { grade = grades[i]; break; }

  document.getElementById('wall-over-score').textContent = g.score;
  document.getElementById('wall-over-score').style.color = grade.col;
  document.getElementById('wall-over-score').style.textShadow = '0 0 28px ' + grade.col;
  document.getElementById('wall-over-grade').textContent = grade.text;
  document.getElementById('wall-over-grade').style.color = grade.col;
  document.getElementById('wall-over-hi').style.display = newHi ? 'block' : 'none';
  document.getElementById('wall-over-xp').textContent = '+' + earned + ' XP earned · Total: ' + rec.xp;
  document.getElementById('wall-os-hits').textContent = g.hits;
  document.getElementById('wall-os-lv').textContent = g.level;
  document.getElementById('wall-os-combo').textContent = (g.maxCombo || 1) + '×';
  document.getElementById('wall-os-hi').textContent = rec.hi || 0;
  showWallScreen('wall-over');
}
