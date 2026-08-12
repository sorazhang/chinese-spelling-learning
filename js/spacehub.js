// spacehub.js — 星际 HUB, ported from space-hub.html into the module
// pattern. An alternate way to pick a game: fly a ship toward a planet
// (one per entry in nav.js's GAMES list, using each game's real color),
// dodging asteroids along the way. Landing offers to actually launch that
// game (navTo + enter_<id>, the same call the flat grid card makes) or
// keep flying toward the next one.

import { navTo, GAMES } from './nav.js';

function hubScreen(id) {
  var screens = document.querySelectorAll('#view-space-hub .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

var cv, ctx, W, H, CX, HORIZON, SHIP_Y;
var planetIdx, approach, shipX, steerTarget, stars, visited, arriving, raf, lastTs;
var LIVES_MAX = 3;
var lives, asteroids, astSpawnCd, hitFlashMs;
var ASTEROID_RATE = 0.0005;

function rnd01() { return Math.random(); }

export function initCanvas() {
  if (cv) return;
  cv = document.getElementById('hub-cv');
  ctx = cv.getContext('2d');
  W = cv.width; H = cv.height;
  CX = W/2; HORIZON = H*0.42; SHIP_Y = H - 46;

  stars = [];
  for (var i = 0; i < 140; i++) {
    stars.push({ a: Math.random()*Math.PI*2, r: Math.random()*260, speed: 0.6 + Math.random()*1.8 });
  }

  var dragging = false, dragStartX = 0, dragStartSteer = 0;
  cv.addEventListener('mousedown', function(e) { dragging = true; dragStartX = e.clientX; dragStartSteer = steerTarget; });
  window.addEventListener('mousemove', function(e) { if (!dragging) return; steerTarget = Math.max(-1, Math.min(1, dragStartSteer + (e.clientX - dragStartX)/120)); });
  window.addEventListener('mouseup', function() { dragging = false; });
  cv.addEventListener('touchstart', function(e) { dragging = true; dragStartX = e.touches[0].clientX; dragStartSteer = steerTarget; }, { passive: true });
  cv.addEventListener('touchmove', function(e) { if (!dragging) return; steerTarget = Math.max(-1, Math.min(1, dragStartSteer + (e.touches[0].clientX - dragStartX)/120)); }, { passive: true });
  cv.addEventListener('touchend', function() { dragging = false; });
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('view-space-hub').classList.contains('active')) return;
    if (e.code === 'ArrowLeft') steerTarget = Math.max(-1, steerTarget - 0.34);
    if (e.code === 'ArrowRight') steerTarget = Math.min(1, steerTarget + 0.34);
  });
}

export function enterSpaceHub() {
  planetIdx = 0; approach = 0; shipX = 0; steerTarget = 0;
  visited = []; arriving = false; lastTs = null;
  lives = LIVES_MAX; asteroids = []; astSpawnCd = 900; hitFlashMs = 0;
  buildLives();
  buildTrail();
  hubScreen('hub-fly');
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

export function spaceHubBackToApp() {
  arriving = true; // stop the loop
  cancelAnimationFrame(raf);
  navTo('home');
}

function buildLives() {
  var el = document.getElementById('hub-lives');
  el.innerHTML = '';
  for (var i = 0; i < LIVES_MAX; i++) {
    var d = document.createElement('span');
    d.className = 'life-icon' + (i < lives ? ' on' : '');
    d.textContent = '🛡️';
    el.appendChild(d);
  }
}

function buildTrail() {
  var t = document.getElementById('hub-trail');
  t.innerHTML = '';
  for (var i = 0; i < GAMES.length; i++) {
    var g = GAMES[i];
    var d = document.createElement('div');
    d.className = 'trail-dot' + (visited.indexOf(g.id) > -1 ? ' visited' : '') + (i === planetIdx ? ' current' : '');
    d.style.color = g.color;
    d.textContent = g.icon;
    t.appendChild(d);
  }
}

function hubToast(msg) {
  var t = document.getElementById('hub-toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(hubToast._t);
  hubToast._t = setTimeout(function() { t.style.opacity = '0'; }, 900);
}

function drawStarfield(dt) {
  ctx.fillStyle = '#010306';
  ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.translate(CX, HORIZON);
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.r += s.speed * dt * 0.06 * (1 + approach*1.6);
    if (s.r > 300) { s.r = 10; s.a = Math.random()*Math.PI*2; }
    var x = Math.cos(s.a) * s.r;
    var y = Math.sin(s.a) * s.r * 0.5;
    var sz = Math.max(0.5, s.r/300*2.2);
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, s.r/120) + ')';
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.restore();
}

function drawPlanet(p, dt) {
  approach = Math.min(1, approach + dt * 0.00028);
  var radius = 8 + approach*approach*150;
  var px = CX + shipX*40*(1-approach);
  var py = HORIZON - 20 - (1-approach)*30;

  var grad = ctx.createRadialGradient(px, py, radius*0.2, px, py, radius*1.6);
  grad.addColorStop(0, p.color + 'aa');
  grad.addColorStop(1, p.color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(px, py, radius*1.6, 0, Math.PI*2);
  ctx.fill();

  var sphereGrad = ctx.createRadialGradient(px - radius*0.35, py - radius*0.35, radius*0.1, px, py, radius);
  sphereGrad.addColorStop(0, '#ffffff');
  sphereGrad.addColorStop(0.25, p.color);
  sphereGrad.addColorStop(1, '#050912');
  ctx.fillStyle = sphereGrad;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI*2);
  ctx.fill();

  if (radius > 26) {
    ctx.font = (radius*0.4) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.icon, px, py);
    if (radius > 60) {
      ctx.font = "700 12px 'Orbitron', monospace";
      ctx.fillStyle = p.color;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.name, px, py + radius + 22);
    }
  }
  return approach >= 0.985;
}

function astScale(p) { return 0.12 + p*p*1.05; }
function astX(p, lane) { return CX + lane * (W*0.32) * p; }
function astY(p) { return HORIZON + (SHIP_Y - HORIZON) * p; }

function spawnAsteroid() {
  var jitter = [];
  for (var i = 0; i < 8; i++) jitter.push(0.7 + Math.random()*0.45);
  asteroids.push({
    p: 0,
    lane: (rnd01()*2 - 1) * 0.9,
    size: 13 + Math.random()*9,
    rot: Math.random()*Math.PI*2,
    spin: (Math.random()-0.5)*0.0035,
    jitter: jitter,
    resolved: false
  });
}

function drawAsteroid(a) {
  var scale = astScale(a.p);
  var px = astX(a.p, a.lane);
  var py = astY(a.p);
  var r = a.size * scale;
  a.rot += a.spin * 16;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a.rot);
  ctx.fillStyle = '#5a4636';
  ctx.strokeStyle = '#a88a68';
  ctx.lineWidth = Math.max(0.6, r*0.05);
  ctx.beginPath();
  for (var i = 0; i < a.jitter.length; i++) {
    var ang = (i/a.jitter.length) * Math.PI*2;
    var rr = r * a.jitter[i];
    var x = Math.cos(ang)*rr, y = Math.sin(ang)*rr;
    if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function updateAsteroids(dt, shipScreenX) {
  astSpawnCd -= dt;
  if (astSpawnCd <= 0) {
    spawnAsteroid();
    astSpawnCd = 700 + Math.random()*700;
  }

  for (var i = asteroids.length - 1; i >= 0; i--) {
    var a = asteroids[i];
    a.p += ASTEROID_RATE * dt;
    drawAsteroid(a);

    if (!a.resolved && a.p >= 0.95) {
      a.resolved = true;
      var hitRadius = a.size*astScale(a.p)*0.7 + 15;
      if (Math.abs(astX(a.p, a.lane) - shipScreenX) < hitRadius) {
        lives = Math.max(0, lives - 1);
        buildLives();
        hitFlashMs = 220;
        hubToast('💥 HIT! shield ' + lives + '/' + LIVES_MAX);
        if (lives === 0) {
          setTimeout(function() {
            if (arriving) return;
            lives = LIVES_MAX;
            approach = 0;
            asteroids = [];
            buildLives();
            hubToast('🛠️ SHIELDS RESTORED — RE-APPROACHING');
          }, 260);
        }
      }
    }

    if (a.p > 1.2) asteroids.splice(i, 1);
  }
}

function drawShip() {
  var sx = CX + shipX * (W*0.32);
  var sy = H - 46;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(shipX * 0.35);
  var flick = 6 + Math.random()*8;
  var fg = ctx.createLinearGradient(0, 14, 0, 14+flick);
  fg.addColorStop(0, '#00f5ffcc');
  fg.addColorStop(1, '#00f5ff00');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-6, 14); ctx.lineTo(6, 14); ctx.lineTo(0, 14+flick); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8f6ff';
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(14, 14); ctx.lineTo(-14, 14); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#00f5ff';
  ctx.beginPath();
  ctx.arc(0, -2, 5, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function loop(ts) {
  if (arriving) return;
  var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
  lastTs = ts;

  shipX += (steerTarget - shipX) * 0.06;
  var shipScreenX = CX + shipX * (W*0.32);

  drawStarfield(dt);
  var arrived = drawPlanet(GAMES[planetIdx], dt);
  updateAsteroids(dt, shipScreenX);
  drawShip();

  if (hitFlashMs > 0) {
    hitFlashMs -= dt;
    ctx.fillStyle = 'rgba(255,30,60,' + Math.max(0, hitFlashMs/220*0.35) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  if (arrived) { doArrive(); return; }
  raf = requestAnimationFrame(loop);
}

function doArrive() {
  arriving = true;
  var g = GAMES[planetIdx];
  if (visited.indexOf(g.id) === -1) visited.push(g.id);
  buildTrail();
  document.getElementById('hub-arrive-icon').textContent = g.icon;
  document.getElementById('hub-arrive-title').textContent = g.name;
  document.getElementById('hub-arrive-title').style.color = g.color;
  var btn = document.getElementById('hub-arrive-play');
  btn.style.background = g.color + '22';
  btn.style.border = '1.5px solid ' + g.color;
  btn.style.color = g.color;
  document.getElementById('hub-arrive').classList.add('show');
}

export function hubPlay() {
  var g = GAMES[planetIdx];
  document.getElementById('hub-arrive').classList.remove('show');
  navTo(g.id);
  var enterFn = window['enter_' + g.id];
  if (enterFn) enterFn();
}

export function hubContinue() {
  document.getElementById('hub-arrive').classList.remove('show');
  planetIdx = (planetIdx + 1) % GAMES.length;
  approach = 0;
  asteroids = [];
  astSpawnCd = 900;
  arriving = false;
  lastTs = null;
  buildTrail();
  raf = requestAnimationFrame(loop);
}
