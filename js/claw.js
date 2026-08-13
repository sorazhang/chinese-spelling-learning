// claw.js — 汉字 CLAW, ported from claw-machine-draft.html into the module
// pattern. Move/drop a claw to catch a face-down word tile from the pile,
// then read it aloud — speech-to-text via the Web Speech API, graded by
// Claude through /api/grade (text-only prompt, no image — see
// api/grade.js). Self-grade buttons are always available alongside the
// mic, not just as an error fallback, since mic/speech support varies a
// lot across browsers and devices.

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { shuffle, esc } from './utils.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'claw';

function vocab() {
  var set = S.vocabSets[SET_ID];
  return (set && set.vocab) || [];
}

function showClawScreen(id) {
  var screens = document.querySelectorAll('#view-claw .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterClaw() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('claw-xp-val').textContent = rec.xp || 0;
  document.getElementById('claw-best-val').textContent = rec.bestCaught || 0;
  document.getElementById('claw-vocab-count').textContent = vocab().length;
  showClawScreen('claw-home');
}

export function clawBackToApp() {
  cancelAnimationFrame(raf);
  navTo('home');
}

// ── canvas + machine geometry ────────────────────────────────────────────
var cv, ctx, W, H;
var RAIL_Y = 26, BIN_TOP = 190, BIN_BOTTOM = 270, CATCH_RADIUS = 46;

export function initCanvas() {
  if (cv) return;
  cv = document.getElementById('claw-cv');
  ctx = cv.getContext('2d');
  W = cv.width; H = cv.height;

  var leftBtn = document.getElementById('claw-left-btn');
  var rightBtn = document.getElementById('claw-right-btn');
  var dropBtn = document.getElementById('claw-drop-btn');

  leftBtn.addEventListener('mousedown', function() { movingDir = -1; });
  rightBtn.addEventListener('mousedown', function() { movingDir = 1; });
  document.addEventListener('mouseup', function() { movingDir = 0; });
  leftBtn.addEventListener('touchstart', function(e) { e.preventDefault(); movingDir = -1; }, { passive: false });
  rightBtn.addEventListener('touchstart', function(e) { e.preventDefault(); movingDir = 1; }, { passive: false });
  document.addEventListener('touchend', function() { movingDir = 0; });
  dropBtn.addEventListener('click', function() {
    if (clawState !== 'idle') return;
    clawState = 'dropping';
    document.getElementById('claw-state-lbl').textContent = 'DROPPING...';
  });
}

var pile, clawX, clawY, clawState, movingDir, caughtTile, results, raf, lastTs;
var queue, caughtCount, sessionXpEarned;

function layoutPile() {
  pile = [];
  var cols = 5, rows = 2, i = 0;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      if (i >= queue.length) break;
      var baseX = 60 + c * (W - 120) / (cols - 1);
      var baseY = BIN_TOP + 20 + r * 40;
      pile.push({
        item: queue[i],
        x: baseX + (Math.random() - 0.5) * 14,
        y: baseY + (Math.random() - 0.5) * 10,
        caught: false
      });
      i++;
    }
  }
}

export function startClawRound() {
  if (vocab().length === 0) return;
  queue = shuffle(vocab());
  caughtCount = 0;
  results = [];
  sessionXpEarned = 0;
  document.getElementById('claw-total-val').textContent = queue.length;
  document.getElementById('claw-caught-val').textContent = 0;
  clawX = W / 2; clawY = RAIL_Y; clawState = 'idle'; movingDir = 0; caughtTile = null;
  layoutPile();
  showClawScreen('claw-game');
  lastTs = null;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function drawCabinet() {
  ctx.clearRect(0, 0, W, H);
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a0f30'); bg.addColorStop(1, '#0a0518');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,68,170,.4)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, RAIL_Y - 6); ctx.lineTo(W, RAIL_Y - 6); ctx.stroke();

  ctx.fillStyle = 'rgba(255,68,170,.06)';
  ctx.fillRect(20, BIN_TOP, W - 40, BIN_BOTTOM - BIN_TOP);
  ctx.strokeStyle = 'rgba(255,68,170,.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, BIN_TOP, W - 40, BIN_BOTTOM - BIN_TOP);

  for (var i = 0; i < pile.length; i++) {
    var t = pile[i];
    if (t.caught) continue;
    // face-down — the catch is a surprise, revealed only after it's caught
    ctx.fillStyle = 'rgba(255,68,170,.1)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(t.x - 26, t.y - 16, 52, 32, 8); else ctx.rect(t.x - 26, t.y - 16, 52, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,68,170,.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = "700 15px 'Orbitron', monospace";
    ctx.fillStyle = 'rgba(255,68,170,.65)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', t.x, t.y);
  }
}

function drawClaw() {
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(clawX, RAIL_Y);
  ctx.lineTo(clawX, clawY);
  ctx.stroke();

  ctx.save();
  ctx.translate(clawX, clawY);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  var spread = clawState === 'closed' ? 5 : 13;
  ctx.beginPath(); ctx.moveTo(-spread, 0); ctx.lineTo(-spread * 0.4, 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(spread, 0); ctx.lineTo(spread * 0.4, 16); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = '#ffd700'; ctx.fill();
  ctx.restore();

  if (caughtTile) {
    ctx.font = "700 13px 'Orbitron', monospace";
    ctx.fillStyle = 'rgba(255,68,170,.8)';
    ctx.textAlign = 'center';
    ctx.fillText('?', clawX, clawY + 24);
  }
}

function loop(ts) {
  var dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
  lastTs = ts;

  if (clawState === 'idle' && movingDir !== 0) {
    clawX = Math.max(40, Math.min(W - 40, clawX + movingDir * 0.32 * dt));
  }
  if (clawState === 'dropping') {
    clawY += 0.42 * dt;
    if (clawY >= BIN_TOP + 30) {
      clawY = BIN_TOP + 30;
      tryCatch();
      clawState = 'rising';
    }
  }
  if (clawState === 'rising') {
    clawY -= 0.42 * dt;
    if (clawY <= RAIL_Y) {
      clawY = RAIL_Y;
      if (caughtTile) { onCaught(caughtTile); return; }
      clawState = 'idle';
      document.getElementById('claw-state-lbl').textContent = '';
    }
  }

  drawCabinet();
  drawClaw();
  raf = requestAnimationFrame(loop);
}

function tryCatch() {
  var best = null, bestDist = CATCH_RADIUS;
  for (var i = 0; i < pile.length; i++) {
    var t = pile[i];
    if (t.caught) continue;
    var d = Math.abs(t.x - clawX);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  if (best) { best.caught = true; caughtTile = best; clawState = 'closed'; }
}

var currentTile = null;

function onCaught(tile) {
  cancelAnimationFrame(raf);
  document.getElementById('claw-speak-char').textContent = tile.item.char;
  document.getElementById('claw-transcript-box').textContent = '';
  document.getElementById('claw-mic-status').textContent = 'Tap the mic and say the word';
  document.getElementById('claw-mic-btn').classList.remove('listening');
  document.getElementById('claw-feedback-card').style.display = 'none';
  document.getElementById('claw-next-btn').style.display = 'none';
  currentTile = tile;
  showClawScreen('claw-speak');
}

// ── speak + grade ────────────────────────────────────────────────────────
var SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
var micTimeout = null;

export function startListening() {
  if (!SpeechCtor) {
    document.getElementById('claw-mic-status').textContent = 'Speech recognition not available on this device — use self-grade below';
    return;
  }
  var rec = new SpeechCtor();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  document.getElementById('claw-mic-btn').classList.add('listening');
  document.getElementById('claw-mic-status').textContent = 'Listening...';

  var settled = false;
  function settle() {
    settled = true;
    clearTimeout(micTimeout);
    document.getElementById('claw-mic-btn').classList.remove('listening');
  }

  micTimeout = setTimeout(function() {
    if (settled) return;
    settle();
    try { rec.abort(); } catch (e) {}
    document.getElementById('claw-mic-status').textContent = "Didn't hear anything back — use self-grade below";
  }, 6000);

  rec.onresult = function(e) {
    if (settled) return;
    settle();
    var transcript = e.results[0][0].transcript;
    document.getElementById('claw-transcript-box').textContent = '"' + transcript + '"';
    gradeTranscript(transcript);
  };
  rec.onerror = function(e) {
    if (settled) return;
    settle();
    document.getElementById('claw-mic-status').textContent = 'Could not hear you (' + e.error + ') — use self-grade below';
  };
  rec.onend = function() {
    document.getElementById('claw-mic-btn').classList.remove('listening');
  };
  try { rec.start(); } catch (err) {
    settle();
    document.getElementById('claw-mic-status').textContent = 'Could not start microphone — use self-grade below';
  }
}

function buildPrompt(item, transcript) {
  return 'A 9-year-old learning Mandarin was shown the Chinese phrase ' + JSON.stringify(item.char) + ' (pinyin: ' + item.py + ') and asked to read it aloud. Speech-to-text transcribed what they said as: ' + JSON.stringify(transcript) + '. Be maximally generous — imperfect transcription is common even when pronunciation is correct. Mark correct if the transcript contains the target characters or a clearly phonetically-close reading. Mark partial if it is a reasonable attempt but clearly off. Mark incorrect only if totally unrelated or empty. Reply ONLY with valid JSON: {"grade":"correct","comment":"Short praise max 8 words."}';
}

async function gradeTranscript(transcript) {
  try {
    var resp = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: buildPrompt(currentTile.item, transcript), maxTokens: 200 })
    });
    if (!resp.ok) throw new Error('grade endpoint returned ' + resp.status);
    var data = await resp.json();
    var raw = (data.content || []).find(function(b) { return b.type === 'text'; });
    var parsed = JSON.parse((raw ? raw.text : '{}').replace(/```json/g, '').replace(/```/g, '').trim());
    showFeedback(parsed.grade || 'incorrect', parsed.comment || 'Keep going!');
  } catch (e) {
    document.getElementById('claw-mic-status').textContent = 'Could not reach AI grading — use self-grade below';
  }
}

export function clawSelfGrade(g) {
  var c = { correct: 'Great job!', partial: 'Good effort — keep practising!', incorrect: 'Keep going — you\'ll get it!' };
  showFeedback(g, c[g]);
}

function showFeedback(grade, comment) {
  var GC = { correct: '#00ff88', partial: '#ffcc00', incorrect: '#ff4466' };
  var GE = { correct: '⭐', partial: '💪', incorrect: '❌' };
  var GL = { correct: 'CORRECT! +30 XP', partial: 'PARTIAL! +10 XP', incorrect: 'KEEP PRACTISING' };
  var col = GC[grade] || '#ff9900';

  var rec = getProgressRecord(SET_ID, GAME_ID);
  var earned = grade === 'correct' ? 30 : grade === 'partial' ? 10 : 0;
  rec.xp += earned;
  rec.correct += grade === 'correct' ? 1 : 0;
  saveProgressRecord(SET_ID, GAME_ID, rec);
  sessionXpEarned += earned;
  document.getElementById('claw-xp-val').textContent = rec.xp;

  var fc = document.getElementById('claw-feedback-card');
  fc.style.display = 'block';
  fc.style.border = '1px solid ' + col + '55';
  document.getElementById('claw-fb-emoji').textContent = GE[grade] || '⚠️';
  document.getElementById('claw-fb-label').textContent = GL[grade] || '';
  document.getElementById('claw-fb-label').style.color = col;
  document.getElementById('claw-fb-comment').textContent = comment;
  document.getElementById('claw-fb-py').textContent = currentTile.item.py + ' · ' + currentTile.item.en;

  var nb = document.getElementById('claw-next-btn');
  nb.style.display = 'block';
  caughtCount++;
  document.getElementById('claw-caught-val').textContent = caughtCount;
  nb.textContent = caughtCount < queue.length ? 'NEXT CATCH →' : '🏁 FINISH ROUND';
  results.push({ item: currentTile.item, grade: grade });
}

export function nextClawRound() {
  if (caughtCount >= queue.length) {
    showClawSummary();
    return;
  }
  clawX = W / 2; clawY = RAIL_Y; clawState = 'idle'; movingDir = 0; caughtTile = null;
  showClawScreen('claw-game');
  lastTs = null;
  raf = requestAnimationFrame(loop);
}

function showClawSummary() {
  var correct = results.filter(function(r) { return r.grade === 'correct'; }).length;
  var rec = getProgressRecord(SET_ID, GAME_ID);
  if (caughtCount > (rec.bestCaught || 0)) {
    rec.bestCaught = caughtCount;
    saveProgressRecord(SET_ID, GAME_ID, rec);
  }
  document.getElementById('claw-best-val').textContent = rec.bestCaught || 0;
  document.getElementById('claw-sum-score').textContent = correct + '/' + results.length;

  var list = document.getElementById('claw-sum-list');
  list.innerHTML = '';
  var GE = { correct: '✅', partial: '💪', incorrect: '❌' };
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var row = document.createElement('div');
    row.className = 'sl-row';
    row.innerHTML = '<span>' + (GE[r.grade] || '⏭') + '</span><span style="font-family:serif;font-size:16px;flex:1">' + esc(r.item.char) + '</span><span style="font-size:10px;color:#7755aa">' + esc(r.item.py) + '</span>';
    list.appendChild(row);
  }

  logSession({ setId: SET_ID, game: GAME_ID, score: correct, total: results.length, xpEarned: sessionXpEarned });
  showClawScreen('claw-summary');
}
