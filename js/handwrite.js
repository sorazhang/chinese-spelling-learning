// handwrite.js — 手写 TRACE, ported from char4-handwrite.html.
// AI grading now goes through /api/grade (server-side Anthropic key) instead
// of calling api.anthropic.com directly from the browser — see api/grade.js.
// Falls back to the existing self-grade buttons if that call fails for any
// reason (endpoint not deployed, ANTHROPIC_API_KEY not configured, network).

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { shuffle, esc } from './utils.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'handwrite';

var queue = [], qIdx = 0, results = [];
var drawing = false, lastX = 0, lastY = 0, erasing = false, hasDrawn = false, eraserSz = 40;
var peeking = false;
var sessionXpEarned = 0;

function vocab() {
  var set = S.vocabSets[SET_ID];
  return (set && set.vocab) || [];
}

function showHwScreen(id) {
  var screens = document.querySelectorAll('#view-handwrite .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterHandwrite() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('hw-xp-val').innerHTML = rec.xp + ' <span style="font-size:12px;color:#44667a">XP</span>';
  buildCx();
  showHwScreen('hw-home');
}

export function hwBackToApp() {
  navTo('home');
}

export function showCx() {
  buildCx();
  showHwScreen('hw-codex2');
}

function buildCx() {
  var list = document.getElementById('hw-cx2-list');
  list.innerHTML = '';
  var v = vocab();
  for (var i = 0; i < v.length; i++) {
    var item = v[i];
    var card = document.createElement('div');
    card.className = 'cx2-card';
    card.innerHTML = '<div style="font-family:serif;font-size:20px;color:#fff;min-width:90px;line-height:1.4">' + esc(item.char) + '</div><div>' +
      (S.pinyinOn ? '<div style="font-size:11px;color:#00cfff;margin-bottom:2px">' + esc(item.py) + '</div>' : '') +
      '<div style="font-size:11px;color:#44667a">' + esc(item.en) + '</div></div>';
    list.appendChild(card);
  }
}
S.pinyinListeners.push(function() {
  buildCx();
  if (queue[qIdx]) renderPromptText();
});

export function startSession() {
  if (vocab().length === 0) return;
  queue = shuffle(vocab());
  qIdx = 0;
  results = [];
  sessionXpEarned = 0;
  showHwScreen('hw-write');
  renderItem();
}

function renderPromptText() {
  var item = queue[qIdx];
  document.getElementById('hw-prompt-meaning').textContent = item.en.toUpperCase();
  document.getElementById('hw-prompt-py').textContent = S.pinyinOn ? item.py : '';
}

function renderItem() {
  var item = queue[qIdx];
  document.getElementById('hw-prog-fill').style.width = (qIdx / queue.length * 100) + '%';
  renderPromptText();
  peeking = false;
  document.getElementById('hw-peek-char').style.display = 'none';
  document.getElementById('hw-peek-btn').textContent = '👁️ Peek answer';
  clearCanvas();
  hasDrawn = false;
  erasing = false;
  document.getElementById('hw-erase-btn').style.background = 'rgba(255,255,255,.04)';
  document.getElementById('hw-erase-btn').style.color = '#6688aa';
  document.getElementById('hw-erase-btn').style.borderColor = 'rgba(255,255,255,.15)';
  document.getElementById('hw-eraser-slider').style.display = 'none';
  document.getElementById('hw-ai-btn').disabled = true;
  document.getElementById('hw-ai-btn').style.background = 'rgba(255,255,255,.03)';
  document.getElementById('hw-ai-btn').style.borderColor = 'rgba(255,255,255,.1)';
  document.getElementById('hw-ai-btn').style.color = '#334d5c';
  document.getElementById('hw-self-grade-row').style.display = 'none';
  document.getElementById('hw-feedback-card').style.display = 'none';
  document.getElementById('hw-next-btn2').style.display = 'none';
  document.getElementById('hw-canvas-wrap').style.borderColor = 'rgba(255,255,255,.12)';
  document.getElementById('hw-canvas-wrap').style.boxShadow = 'none';

  var n = item.char.length;
  var overlay = document.getElementById('hw-box-overlay');
  overlay.innerHTML = '';
  for (var i = 0; i < n; i++) {
    var d = document.createElement('div');
    d.style.cssText = 'flex:1;border-right:' + (i < n - 1 ? '1px dashed rgba(0,245,255,.1)' : 'none') + ';display:flex;align-items:flex-start;justify-content:center;padding-top:6px';
    d.innerHTML = '<span style="font-size:9px;color:rgba(0,245,255,.15)">' + (i + 1) + '</span>';
    overlay.appendChild(d);
  }
}

export function togglePeek() {
  peeking = !peeking;
  var item = queue[qIdx];
  document.getElementById('hw-peek-char').textContent = peeking ? item.char : '';
  document.getElementById('hw-peek-char').style.display = peeking ? 'block' : 'none';
  document.getElementById('hw-peek-btn').textContent = peeking ? '🙈 Hide answer' : '👁️ Peek answer';
}

export function toggleErase() {
  erasing = !erasing;
  var btn = document.getElementById('hw-erase-btn');
  btn.textContent = erasing ? '✏️ Draw' : '⬜ Erase';
  btn.style.background = erasing ? 'rgba(255,204,0,.18)' : 'rgba(255,255,255,.04)';
  btn.style.color = erasing ? '#ffcc00' : '#6688aa';
  btn.style.borderColor = erasing ? '#ffcc00' : 'rgba(255,255,255,.15)';
  document.getElementById('hw-eraser-slider').style.display = erasing ? 'flex' : 'none';
}

// ── canvas ───────────────────────────────────────────────────────────────
var cv, ctx;

function getPos(e) {
  var r = cv.getBoundingClientRect();
  var src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - r.left) * (cv.width / r.width), y: (src.clientY - r.top) * (cv.height / r.height) };
}

export function clearCanvas() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawGrid();
  hasDrawn = false;
  document.getElementById('hw-ai-btn').disabled = true;
  document.getElementById('hw-ai-btn').style.background = 'rgba(255,255,255,.03)';
  document.getElementById('hw-ai-btn').style.borderColor = 'rgba(255,255,255,.1)';
  document.getElementById('hw-ai-btn').style.color = '#334d5c';
  document.getElementById('hw-self-grade-row').style.display = 'none';
}

function drawGrid() {
  if (!queue[qIdx]) return;
  var n = queue[qIdx].char.length;
  var cw = cv.width / n;
  ctx.strokeStyle = 'rgba(0,245,255,.08)';
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

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  var p = getPos(e);
  lastX = p.x; lastY = p.y;
  if (!erasing) {
    hasDrawn = true;
    document.getElementById('hw-ai-btn').disabled = false;
    document.getElementById('hw-ai-btn').style.background = 'rgba(0,245,255,.1)';
    document.getElementById('hw-ai-btn').style.borderColor = '#00f5ff';
    document.getElementById('hw-ai-btn').style.color = '#00f5ff';
    document.getElementById('hw-self-grade-row').style.display = 'block';
  }
}
function moveDraw(e) {
  e.preventDefault();
  if (!drawing) return;
  var p = getPos(e);
  if (erasing) {
    ctx.clearRect(p.x - eraserSz / 2, p.y - eraserSz / 2, eraserSz, eraserSz);
  } else {
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
  }
  lastX = p.x; lastY = p.y;
}
function endDraw(e) { e.preventDefault(); drawing = false; }

export function initCanvas() {
  if (cv) return; // already wired
  cv = document.getElementById('hw-draw-canvas');
  ctx = cv.getContext('2d');
  cv.addEventListener('mousedown', startDraw);
  cv.addEventListener('mousemove', moveDraw);
  cv.addEventListener('mouseup', endDraw);
  cv.addEventListener('mouseleave', endDraw);
  cv.addEventListener('touchstart', startDraw, { passive: false });
  cv.addEventListener('touchmove', moveDraw, { passive: false });
  cv.addEventListener('touchend', endDraw, { passive: false });
  var es = document.getElementById('hw-eraser-size');
  es.addEventListener('input', function() {
    eraserSz = parseInt(es.value);
    document.getElementById('hw-eraser-lbl').textContent = eraserSz + 'px';
  });
}

// ── AI grading (via api/grade.js) ───────────────────────────────────────
function buildPrompt(item) {
  return 'A 9-year-old child attempted to write the Chinese phrase ' + JSON.stringify(item.char) + ' (pinyin: ' + item.py + ') across ' + item.char.length + ' boxes on a dark canvas. Be the most generous marker possible. Mark a box correct if ANY strokes exist in it. Only mark incorrect if completely empty. Overall: correct = all boxes have strokes, partial = most boxes have strokes, incorrect = canvas basically empty. Default to correct. Reply ONLY with valid JSON: {"grade":"correct","chars":["correct","correct"],"comment":"Warm praise max 8 words."}';
}

export async function checkHandwriting() {
  var overlay = document.getElementById('hw-checking-overlay');
  overlay.style.display = 'flex';
  try {
    var b64 = cv.toDataURL('image/png').split(',')[1];
    var item = queue[qIdx];
    var resp = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64, prompt: buildPrompt(item) })
    });
    if (!resp.ok) throw new Error('grade endpoint returned ' + resp.status);
    var data = await resp.json();
    var raw = (data.content || []).find(function(b) { return b.type === 'text'; });
    var parsed = JSON.parse((raw ? raw.text : '{}').replace(/```json/g, '').replace(/```/g, '').trim());
    showFeedback(parsed.grade || 'incorrect', parsed.comment || 'Keep going!', Array.isArray(parsed.chars) ? parsed.chars : []);
  } catch (e) {
    showFeedback('error', 'Could not check — use self-grade.', []);
  }
  overlay.style.display = 'none';
}

export function selfGrade(g) {
  var c = { correct: 'Great job! You wrote it correctly!', partial: 'Good effort — keep practising!', incorrect: 'Keep going — check the codex!' };
  showFeedback(g, c[g], []);
}

function showFeedback(grade, comment, charGrades) {
  var GC = { correct: '#00ff88', partial: '#ffcc00', incorrect: '#ff4466', error: '#ff9900' };
  var GE = { correct: '⭐', partial: '💪', incorrect: '❌', error: '⚠️' };
  var GL = { correct: 'CORRECT! +30 XP', partial: 'PARTIAL! +10 XP', incorrect: 'KEEP PRACTISING', error: 'CHECK BELOW' };
  var col = GC[grade] || '#ff9900';

  var rec = getProgressRecord(SET_ID, GAME_ID);
  var earned = grade === 'correct' ? 30 : grade === 'partial' ? 10 : 0;
  rec.xp += earned;
  rec.correct += grade === 'correct' ? 1 : 0;
  saveProgressRecord(SET_ID, GAME_ID, rec);
  sessionXpEarned += earned;
  document.getElementById('hw-xp-val').innerHTML = rec.xp + ' <span style="font-size:12px;color:#44667a">XP</span>';

  document.getElementById('hw-canvas-wrap').style.borderColor = col;
  document.getElementById('hw-canvas-wrap').style.boxShadow = '0 0 20px ' + col + '33';

  var item = queue[qIdx];
  var n = item.char.length;
  var overlay = document.getElementById('hw-box-overlay');
  overlay.innerHTML = '';
  for (var i = 0; i < n; i++) {
    var cg = charGrades[i];
    var d = document.createElement('div');
    d.style.cssText = 'flex:1;border-right:' + (i < n - 1 ? (cg === 'incorrect' ? '3px solid rgba(255,68,102,.85)' : cg === 'correct' ? '3px solid rgba(0,255,136,.6)' : '1px dashed rgba(0,245,255,.1)') : 'none') + ';background:' + (cg === 'incorrect' ? 'rgba(255,68,102,.08)' : cg === 'correct' ? 'rgba(0,255,136,.06)' : 'transparent') + ';display:flex;align-items:flex-start;justify-content:center;padding-top:6px;transition:all .4s';
    overlay.appendChild(d);
  }

  var fc = document.getElementById('hw-feedback-card');
  fc.style.display = 'block';
  fc.style.background = 'rgba(255,255,255,.04)';
  fc.style.border = '1px solid ' + col + '55';
  document.getElementById('hw-fb-emoji').textContent = GE[grade] || '⚠️';
  document.getElementById('hw-fb-label').textContent = GL[grade] || 'SEE BELOW';
  document.getElementById('hw-fb-label').style.color = col;
  document.getElementById('hw-fb-comment').textContent = comment;
  document.getElementById('hw-fb-char').textContent = item.char;
  document.getElementById('hw-fb-char').style.color = col;
  document.getElementById('hw-fb-char').style.textShadow = '0 0 16px ' + col + '66';
  document.getElementById('hw-fb-py').textContent = S.pinyinOn ? item.py + ' · ' + item.en : '';

  var nb = document.getElementById('hw-next-btn2');
  nb.style.display = 'block';
  nb.textContent = qIdx + 1 < queue.length ? 'NEXT CHARACTER →' : 'FINISH MISSION ✓';
  document.getElementById('hw-ai-btn').disabled = true;
  results.push({ item: item, grade: grade });
}

export function nextItem() {
  if (qIdx + 1 < queue.length) {
    qIdx++;
    renderItem();
  } else {
    showSummary2();
  }
}

function showSummary2() {
  var correct = results.filter(function(r) { return r.grade === 'correct'; }).length;
  var partial = results.filter(function(r) { return r.grade === 'partial'; }).length;
  var total = results.length;
  var pct = Math.round((correct + partial * .5) / total * 100);
  var levels = [{ min: 90, text: 'FLAWLESS WRITER! 🏆', col: '#ffd700' }, { min: 70, text: 'EXCELLENT! 🌟', col: '#00ff88' }, { min: 50, text: 'GOOD EFFORT! 💪', col: '#ffa500' }, { min: 0, text: 'KEEP TRAINING! ✊', col: '#ff9900' }];
  var h = levels[levels.length - 1];
  for (var i = 0; i < levels.length; i++) if (pct >= levels[i].min) { h = levels[i]; break; }

  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('hw-sum2-title').textContent = h.text;
  document.getElementById('hw-sum2-title').style.color = h.col;
  document.getElementById('hw-sum2-title').style.textShadow = '0 0 20px ' + h.col;
  document.getElementById('hw-sum2-score').innerHTML = correct + '<span style="font-size:40%;color:#44667a">/' + total + '</span>';
  document.getElementById('hw-sum2-score').style.color = h.col;
  document.getElementById('hw-sum2-score').style.textShadow = '0 0 28px ' + h.col;
  document.getElementById('hw-sum2-sub').textContent = 'correct · ' + partial + ' partial';
  document.getElementById('hw-sum2-xp').textContent = '⚡ ' + rec.xp + ' XP total';

  var list = document.getElementById('hw-sum2-list');
  list.innerHTML = '<div style="font-family:Orbitron,monospace;font-size:9px;color:#44667a;letter-spacing:3px;margin-bottom:12px">MISSION REVIEW</div>';
  var GC = { correct: '#00ff88', partial: '#ffcc00', incorrect: '#ff4466' };
  var GE = { correct: '✅', partial: '💪', incorrect: '❌' };
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var row = document.createElement('div');
    row.className = 's2row';
    var gc = GC[r.grade] || '#44667a';
    var ge = GE[r.grade] || '⏭';
    var xpE = r.grade === 'correct' ? '+30' : r.grade === 'partial' ? '+10' : '0';
    row.innerHTML = '<span>' + ge + '</span><div style="flex:1"><div style="font-family:serif;font-size:22px;color:#fff">' + esc(r.item.char) + '</div><div style="font-size:10px;color:#44667a">' + esc(r.item.en) + '</div></div><div style="font-family:Orbitron,monospace;font-size:11px;color:' + gc + ';font-weight:700">' + xpE + '</div>';
    list.appendChild(row);
  }

  logSession({ setId: SET_ID, game: GAME_ID, score: correct, total: total, xpEarned: sessionXpEarned });
  showHwScreen('hw-summary2');
}
