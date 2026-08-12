// dino.js — 拼音 DINO, ported from the dino-pinyin-3d.html prototype into
// the module pattern. Perspective "road" runner: jump every cactus, the
// gold one matches the current target word for a bonus. Firebase-backed
// progress (xp + high score), same pattern as wall.js.

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'dino';

function vocab() {
  var set = S.vocabSets[SET_ID];
  return (set && set.vocab) || [];
}

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function showDinoScreen(id) {
  var screens = document.querySelectorAll('#view-dino .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterDino() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('dino-hi-val').textContent = rec.hi || 0;
  document.getElementById('dino-xp-val').textContent = rec.xp || 0;
  document.getElementById('dino-vocab-count').textContent = vocab().length;
  showDinoScreen('dino-home');
}

export function dinoBackToApp() {
  running = false;
  cancelAnimationFrame(raf);
  navTo('home');
}

// ── canvas + perspective helpers ────────────────────────────────────────
var cv, ctx, W, H, CX, HORIZON, CAMERA_Y;
var GRAVITY = 0.0034, JUMP_V = -0.95, CLEAR_HEIGHT = 46;

function scaleAt(p) { return 0.06 + p*p*1.15; }
function yAt(p) { return HORIZON + (CAMERA_Y - HORIZON) * p; }
function xAt(p, lane) { return CX + lane * 150 * p; }

export function initCanvas() {
  if (cv) return;
  cv = document.getElementById('dino-cv');
  ctx = cv.getContext('2d');
  W = cv.width; H = cv.height;
  CX = W/2; HORIZON = H*0.30; CAMERA_Y = H*0.90;

  document.addEventListener('keydown', function(e) {
    if (!running) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
  });
  cv.addEventListener('mousedown', function() { if (running) jump(); });
  cv.addEventListener('touchstart', function(e) { if (running) { e.preventDefault(); jump(); } }, { passive: false });
}

var dino, cacti, target, score, spawnCd, pRate, running, raf, lastTs, roadScroll, sessionEnded;

function pickTarget(exclChar) {
  var cands = vocab().filter(function(v) { return v.char !== exclChar; });
  target = rnd(cands.length ? cands : vocab());
  document.getElementById('dino-target-char').textContent = target.char;
  document.getElementById('dino-target-en').textContent = target.en.toUpperCase();
}

function toast(msg, color) {
  var t = document.getElementById('dino-toast');
  t.textContent = msg;
  t.style.color = color;
  t.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(function() { t.style.opacity = '0'; }, 700);
}

export function startDinoRun() {
  if (vocab().length === 0) return;
  dino = { vy: 0, jumping: false, frame: 0, jumpPx: 0 };
  cacti = [];
  score = 0;
  pRate = 0.00045;
  spawnCd = 55;
  running = true;
  sessionEnded = false;
  lastTs = null;
  roadScroll = 0;
  pickTarget(null);
  document.getElementById('dino-score-val').textContent = 0;
  showDinoScreen('dino-game');
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function jump() {
  if (!dino.jumping) { dino.jumping = true; dino.vy = JUMP_V; }
}

function spawnCactus() {
  var isTarget = Math.random() < 0.35;
  var data = isTarget ? target : rnd(vocab().filter(function(v) { return v.char !== target.char; }));
  cacti.push({
    p: 0,
    lane: (Math.random() - 0.5) * 0.55,
    h: 34 + Math.random()*18,
    py: data.py,
    isTarget: isTarget && data.char === target.char,
    resolved: false
  });
}

function drawSky() {
  var g = ctx.createLinearGradient(0,0,0,HORIZON);
  g.addColorStop(0, '#030710');
  g.addColorStop(1, '#0b1930');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,HORIZON);
  ctx.fillStyle = 'rgba(0,245,255,.5)';
  ctx.beginPath(); ctx.arc(W*0.18, HORIZON*0.4, 10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,153,0,.4)';
  ctx.beginPath(); ctx.arc(W*0.85, HORIZON*0.55, 15, 0, Math.PI*2); ctx.fill();
}

function drawGround(dt) {
  var terrain = ctx.createLinearGradient(0,HORIZON,0,H);
  terrain.addColorStop(0, '#0d1a2c');
  terrain.addColorStop(1, '#040810');
  ctx.fillStyle = terrain;
  ctx.fillRect(0, HORIZON, W, H-HORIZON);

  var bottomY = CAMERA_Y + 30;
  var leftBottom = xAt(1, -1), rightBottom = xAt(1, 1);

  var road = ctx.createLinearGradient(0,HORIZON,0,bottomY);
  road.addColorStop(0, '#1c2431');
  road.addColorStop(1, '#141a24');
  ctx.fillStyle = road;
  ctx.beginPath();
  ctx.moveTo(CX, HORIZON);
  ctx.lineTo(rightBottom, bottomY);
  ctx.lineTo(leftBottom, bottomY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,200,120,.8)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffa500';
  ctx.shadowBlur = 4;
  [-1, 1].forEach(function(side) {
    ctx.beginPath();
    ctx.moveTo(CX, HORIZON);
    ctx.lineTo(xAt(1, side), bottomY);
    ctx.stroke();
  });
  ctx.shadowBlur = 0;

  roadScroll = (roadScroll + pRate * dt * 2.4) % 1;
  for (var i = 0; i < 9; i++) {
    var t = (i/9 + roadScroll) % 1;
    var p2 = t*t;
    var y = yAt(p2);
    var w = 3 + 13*p2, h = 3 + 15*p2;
    ctx.fillStyle = 'rgba(255,225,150,' + (0.2 + 0.65*p2) + ')';
    ctx.fillRect(CX - w/2, y, w, h);
  }
}

function drawShadow(px, py, scale, jumpH) {
  var alpha = Math.max(0.08, 0.35 - jumpH*0.6);
  ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
  ctx.beginPath();
  ctx.ellipse(px, py, 16*scale*(1-jumpH*0.4), 6*scale*(1-jumpH*0.4), 0, 0, Math.PI*2);
  ctx.fill();
}

function drawDino() {
  var scale = scaleAt(1) * 1.05;
  var groundY = yAt(1);
  var jumpFrac = Math.min(1, dino.jumpPx / 130);
  var px = CX, py = groundY - dino.jumpPx;

  drawShadow(px, groundY + 4, scale, jumpFrac);

  var w = 44*scale, h = 46*scale;
  ctx.save();
  ctx.translate(px, py);

  ctx.fillStyle = '#0090a8';
  ctx.beginPath();
  ctx.moveTo(w*0.16, -h*0.85); ctx.lineTo(w*0.42, -h*0.7); ctx.lineTo(w*0.42, -h*0.1); ctx.lineTo(w*0.16, -h*0.25);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#00f5ff';
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.fillRect(-w*0.3, -h*0.85, w*0.5, h*0.62);
  ctx.fillRect(-w*0.1, -h, w*0.42, h*0.35);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#030912';
  ctx.fillRect(w*0.16, -h*0.92, 4, 4);

  var legOffset = dino.jumping ? 0 : (Math.sin(dino.frame) > 0 ? 5 : -5);
  ctx.fillStyle = '#009cb5';
  ctx.fillRect(-w*0.22 + legOffset*0.3, -h*0.24, 8, h*0.28);
  ctx.fillRect(w*0.02 - legOffset*0.3, -h*0.24, 8, h*0.28);

  ctx.restore();
}

function drawCactus(c) {
  var scale = scaleAt(c.p);
  var px = xAt(c.p, c.lane);
  var py = yAt(c.p);
  var w = 20*scale, h = c.h*scale;
  var color = c.isTarget ? '#ffd700' : '#ff6b35';

  drawShadow(px, py + 2, scale, 0);

  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = c.isTarget ? '#b89200' : '#b0451f';
  ctx.fillRect(w*0.15, -h, w*0.35, h);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6*scale;
  ctx.fillRect(-w*0.35, -h, w*0.5, h);
  ctx.fillRect(-w*0.6, -h*0.7, w*0.3, h*0.4);
  ctx.fillRect(w*0.15, -h*0.55, w*0.3, h*0.35);
  ctx.shadowBlur = 0;
  ctx.restore();

  if (scale > 0.28) {
    ctx.font = (10*Math.min(scale,1.15)) + "px 'Exo 2', sans-serif";
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(c.py, px, py - h - 6);
  }
}

function loop(ts) {
  if (!running) return;
  var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
  lastTs = ts;

  if (dino.jumping) {
    dino.vy += GRAVITY * dt;
    dino.jumpPx -= dino.vy * dt;
    if (dino.jumpPx <= 0) { dino.jumpPx = 0; dino.jumping = false; dino.vy = 0; }
  }
  dino.frame += 0.2;

  ctx.clearRect(0,0,W,H);
  drawSky();
  drawGround(dt);

  spawnCd -= 1;
  if (spawnCd <= 0) {
    spawnCactus();
    spawnCd = Math.max(30, 70 - score*0.05);
  }

  cacti.sort(function(a,b) { return a.p - b.p; });
  for (var i = 0; i < cacti.length; i++) {
    var c = cacti[i];
    c.p += pRate * dt;
    drawCactus(c);

    if (!c.resolved && c.p >= 0.97) {
      var cleared = dino.jumpPx > CLEAR_HEIGHT;
      if (!cleared) { gameOver(); return; }
      c.resolved = true;
      score += 10;
      if (c.isTarget) {
        score += 50;
        toast('✅ ' + c.py + ' — MATCH! +50', '#00ff88');
        pickTarget(target.char);
      } else {
        toast(c.py, '#7799aa');
      }
      document.getElementById('dino-score-val').textContent = score;
    }
  }
  cacti = cacti.filter(function(c) { return c.p < 1.15; });

  drawDino();

  pRate = Math.min(0.0011, 0.00045 + score * 0.000001);

  raf = requestAnimationFrame(loop);
}

function gameOver() {
  running = false;
  cancelAnimationFrame(raf);

  var earned = Math.floor(score / 5);
  var rec = getProgressRecord(SET_ID, GAME_ID);
  rec.xp += earned;
  var newHi = score > (rec.hi || 0);
  if (newHi) rec.hi = score;
  saveProgressRecord(SET_ID, GAME_ID, rec);
  if (!sessionEnded) {
    sessionEnded = true;
    logSession({ setId: SET_ID, game: GAME_ID, score: score, total: null, xpEarned: earned });
  }

  document.getElementById('dino-over-score').textContent = score;
  document.getElementById('dino-over-hi').textContent = 'BEST: ' + (rec.hi || 0);
  document.getElementById('dino-over-xp').textContent = '+' + earned + ' XP earned · total ' + rec.xp;
  showDinoScreen('dino-over');
}
