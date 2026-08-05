// dictation.js — 听写 DICTATION, ported from char4-dictation.html.
// speechSynthesis playback + canvas handwriting, same AI-grading path as
// handwrite.js (via /api/grade, falling back to self-grade on failure).

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { shuffle, esc } from './utils.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'dictation';

var queue = [], qi = 0, results = [];
var drawn = false, erasing = false, esz = 40, speaking = false, hinting = false;
var sessionXpEarned = 0;

function vocab() {
  var set = S.vocabSets[SET_ID];
  return (set && set.vocab) || [];
}

function showDictScreen(id) {
  var screens = document.querySelectorAll('#view-dictation .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterDictation() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('dict-xp-num').textContent = rec.xp;
  showDictScreen('dict-home');
}

export function dictBackToApp() {
  window.speechSynthesis && window.speechSynthesis.cancel();
  navTo('home');
}

export function startDictation() {
  if (vocab().length === 0) return;
  queue = shuffle(vocab());
  qi = 0;
  results = [];
  sessionXpEarned = 0;
  showDictScreen('dict-practice');
  loadWord();
}

// ── canvas ───────────────────────────────────────────────────────────────
var cv, ctx;
var drawing = false, lx = 0, ly = 0;

function getP(e) {
  var r = cv.getBoundingClientRect();
  var s = e.touches ? e.touches[0] : e;
  return { x: (s.clientX - r.left) * (cv.width / r.width), y: (s.clientY - r.top) * (cv.height / r.height) };
}

function doDraw(e) {
  var p = getP(e);
  if (erasing) {
    ctx.clearRect(p.x - esz / 2, p.y - esz / 2, esz, esz);
  } else {
    drawn = true;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.stroke();
  }
  lx = p.x; ly = p.y;
}

function enableCheck() {
  drawn = true;
  var b = document.getElementById('dict-ai-btn');
  b.className = 'ai-btn ready';
  b.disabled = false;
  document.getElementById('dict-self-grade-row').style.display = 'block';
}

export function clearAll() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawGrid();
  drawn = false;
  var b = document.getElementById('dict-ai-btn');
  b.className = 'ai-btn';
  b.disabled = true;
  document.getElementById('dict-self-grade-row').style.display = 'none';
  document.getElementById('dict-canvas-wrap').style.borderColor = 'rgba(255,165,0,.3)';
  document.getElementById('dict-canvas-wrap').style.boxShadow = 'none';
}

function drawGrid() {
  if (!queue[qi]) return;
  var n = queue[qi].char.length;
  var cw = cv.width / n;
  ctx.strokeStyle = 'rgba(255,165,0,.1)';
  ctx.lineWidth = 1;
  for (var i = 1; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, cv.height); ctx.stroke();
  }
  for (var j = 0; j < n; j++) {
    ctx.beginPath(); ctx.moveTo(j * cw, 0); ctx.lineTo((j + 1) * cw, cv.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((j + 1) * cw, 0); ctx.lineTo(j * cw, cv.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(j * cw, cv.height / 2); ctx.lineTo((j + 1) * cw, cv.height / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(j * cw + cw / 2, 0); ctx.lineTo(j * cw + cw / 2, cv.height); ctx.stroke();
  }
}

export function toggleEraseDict() {
  erasing = !erasing;
  var btn = document.getElementById('dict-erase-btn');
  btn.textContent = erasing ? '✏️ Draw' : '⬜ Erase';
  btn.style.color = erasing ? '#ffcc00' : '#888';
  btn.style.borderColor = erasing ? '#ffcc00' : 'rgba(255,255,255,.15)';
}

export function initCanvas() {
  if (cv) return;
  cv = document.getElementById('dict-cv');
  ctx = cv.getContext('2d');
  cv.onmousedown = function(e) { e.preventDefault(); drawing = true; var p = getP(e); lx = p.x; ly = p.y; if (!erasing) enableCheck(); };
  cv.onmousemove = function(e) { e.preventDefault(); if (!drawing) return; doDraw(e); };
  cv.onmouseup = cv.onmouseleave = function(e) { e.preventDefault(); drawing = false; };
  cv.addEventListener('touchstart', function(e) { e.preventDefault(); drawing = true; var p = getP(e); lx = p.x; ly = p.y; if (!erasing) enableCheck(); }, { passive: false });
  cv.addEventListener('touchmove', function(e) { e.preventDefault(); if (!drawing) return; doDraw(e); }, { passive: false });
  cv.addEventListener('touchend', function(e) { e.preventDefault(); drawing = false; }, { passive: false });
  var es = document.getElementById('dict-eraser-size');
  es.addEventListener('input', function() {
    esz = parseInt(es.value);
    document.getElementById('dict-eraser-lbl').textContent = esz + 'px';
  });
}

// ── speech ───────────────────────────────────────────────────────────────
export function speak() {
  var item = queue[qi];
  if (!item || speaking) return;
  speaking = true;
  document.getElementById('dict-play-lbl').textContent = 'Playing... tap to replay';
  if (!window.speechSynthesis) {
    speaking = false;
    document.getElementById('dict-play-lbl').textContent = 'Speech not available — use hint';
    return;
  }
  window.speechSynthesis.cancel();
  function go() {
    var u = new SpeechSynthesisUtterance(item.char);
    u.lang = 'zh-CN';
    u.rate = 0.5;
    var vv = window.speechSynthesis.getVoices();
    for (var i = 0; i < vv.length; i++) {
      if (vv[i].lang && vv[i].lang.indexOf('zh') === 0) { u.voice = vv[i]; break; }
    }
    u.onend = u.onerror = function() {
      speaking = false;
      document.getElementById('dict-play-lbl').textContent = 'Tap to replay';
    };
    window.speechSynthesis.speak(u);
    setTimeout(function() { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); }, 300);
  }
  var vv = window.speechSynthesis.getVoices();
  if (!vv.length) {
    var done = false;
    window.speechSynthesis.onvoiceschanged = function() { if (!done) { done = true; go(); } };
    setTimeout(function() { if (!done) { done = true; go(); } }, 800);
  } else {
    go();
  }
}

export function toggleHint() {
  hinting = !hinting;
  var item = queue[qi];
  document.getElementById('dict-hint-txt').textContent = hinting ? item.py : '';
  document.getElementById('dict-hint-btn').textContent = hinting ? '🙈 Hide hint' : '💡 Show pinyin hint';
}

// ── AI check (via api/grade.js) ─────────────────────────────────────────
export async function doCheck() {
  if (!drawn) return;
  document.getElementById('dict-checking-overlay').style.display = 'flex';
  try {
    var b64 = cv.toDataURL('image/png').split(',')[1];
    var item = queue[qi];
    var prompt = 'Child wrote ' + JSON.stringify(item.char) + ' (' + item.py + ') from audio across ' + item.char.length + ' boxes. Be maximally generous: correct if ANY strokes. Only incorrect if box totally blank. Default correct. Reply ONLY valid JSON: {"grade":"correct","comment":"Short praise max 6 words."}';
    var r = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64, prompt: prompt, maxTokens: 200 })
    });
    if (!r.ok) throw new Error('grade endpoint returned ' + r.status);
    var d = await r.json();
    var raw = (d.content || []).find(function(b) { return b.type === 'text'; });
    var p = JSON.parse((raw ? raw.text : '{}').replace(/```json/g, '').replace(/```/g, '').trim());
    grade(p.grade || 'incorrect', p.comment || 'Keep going!');
  } catch (e) {
    grade('error', 'Could not check — self-grade instead.');
  }
  document.getElementById('dict-checking-overlay').style.display = 'none';
}

export function grade(g, msg) {
  var GC = { correct: '#00ff88', partial: '#ffcc00', incorrect: '#ff4466', error: '#ff9900' };
  var GE = { correct: '⭐', partial: '💪', incorrect: '❌', error: '⚠️' };
  var GL = { correct: 'CORRECT! +30 XP', partial: 'PARTIAL! +10 XP', incorrect: 'KEEP PRACTISING', error: 'CHECK BELOW' };
  var col = GC[g] || '#ff9900';

  var rec = getProgressRecord(SET_ID, GAME_ID);
  var earned = g === 'correct' ? 30 : g === 'partial' ? 10 : 0;
  rec.xp += earned;
  rec.correct += g === 'correct' ? 1 : 0;
  saveProgressRecord(SET_ID, GAME_ID, rec);
  sessionXpEarned += earned;
  document.getElementById('dict-xp-num').textContent = rec.xp;

  document.getElementById('dict-canvas-wrap').style.borderColor = col;
  document.getElementById('dict-canvas-wrap').style.boxShadow = '0 0 18px ' + col + '44';

  var fb = document.getElementById('dict-feedback-card');
  fb.style.display = 'block';
  fb.style.background = 'rgba(255,255,255,.04)';
  fb.style.border = '1px solid ' + col + '55';
  document.getElementById('dict-fb-emoji').textContent = GE[g] || '⚠️';
  document.getElementById('dict-fb-label').textContent = GL[g] || '';
  document.getElementById('dict-fb-label').style.color = col;
  document.getElementById('dict-fb-comment').textContent = msg || '';
  var item = queue[qi];
  document.getElementById('dict-fb-char').textContent = item.char;
  document.getElementById('dict-fb-char').style.color = col;
  document.getElementById('dict-fb-py').textContent = item.py + ' · ' + item.en;
  document.getElementById('dict-ai-btn').style.display = 'none';
  document.getElementById('dict-self-grade-row').style.display = 'none';

  var nb = document.getElementById('dict-next-btn');
  nb.style.display = 'block';
  nb.textContent = qi + 1 < queue.length ? 'NEXT WORD →' : '🔁 START AGAIN';

  results.push({ item: item, grade: g });
  if (qi + 1 >= queue.length) {
    logSession({ setId: SET_ID, game: GAME_ID, score: results.filter(function(r) { return r.grade === 'correct'; }).length, total: results.length, xpEarned: sessionXpEarned });
  }
}

export function next() {
  if (qi + 1 < queue.length) {
    qi++;
    loadWord();
  } else {
    qi = 0;
    queue = shuffle(vocab());
    results = [];
    sessionXpEarned = 0;
    loadWord();
  }
}

function loadWord() {
  var item = queue[qi];
  document.getElementById('dict-word-num').textContent = 'WORD ' + (qi + 1) + ' / ' + queue.length;
  document.getElementById('dict-play-lbl').textContent = 'TAP TO HEAR THE WORD';
  document.getElementById('dict-hint-txt').textContent = '';
  hinting = false;
  document.getElementById('dict-hint-btn').textContent = '💡 Show pinyin hint';
  document.getElementById('dict-feedback-card').style.display = 'none';
  document.getElementById('dict-next-btn').style.display = 'none';
  document.getElementById('dict-ai-btn').style.display = 'block';
  var b = document.getElementById('dict-ai-btn');
  b.className = 'ai-btn';
  b.disabled = true;
  document.getElementById('dict-self-grade-row').style.display = 'none';
  clearAll();
}
