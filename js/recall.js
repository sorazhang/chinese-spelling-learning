// recall.js — 段落 RECALL, ported from char4-recall.html.
// Study / Character Drill / Full Recall modes over the current vocab set's
// sentence list.

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { shuffle, esc } from './utils.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'recall';

var focusIdx = 0, reads = 0;
var drillMode = true, sIdx = 0, bank = [], placed = [], mistakes = 0, results = [], dXpPer = 15;
var sessionXpEarned = 0;

function sentences() {
  var set = S.vocabSets[SET_ID];
  return (set && set.sentences) || [];
}

function showRecallScreen(id) {
  var screens = document.querySelectorAll('#view-recall .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterRecall() {
  refreshHome();
  showRecallScreen('recall-home');
}

export function recallBackToApp() {
  navTo('home');
}

function refreshHome() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('recall-xp-num').textContent = rec.xp;
  var sents = sentences();
  var total = sents.reduce(function(n, s) { return n + s.chars.length; }, 0);
  document.getElementById('recall-para-count').textContent = total + '字·' + sents.length + 'drills';
  document.getElementById('recall-para-preview').textContent = sents.map(function(s) { return s.full; }).join('　');
}
S.pinyinListeners.push(function() {
  if (document.getElementById('recall-study') && document.getElementById('recall-study').classList.contains('active')) renderStudy();
  if (document.getElementById('recall-drill') && document.getElementById('recall-drill').classList.contains('active')) renderDrill();
});

// ── STUDY ────────────────────────────────────────────────────────────────
export function showStudy() {
  focusIdx = 0;
  renderStudy();
  showRecallScreen('recall-study');
}

function renderStudy() {
  var inner = document.getElementById('recall-all-chars-inner');
  inner.innerHTML = '';
  var sents = sentences();
  for (var si = 0; si < sents.length; si++) {
    (function(s, si) {
      var span = document.createElement('span');
      span.style.cursor = 'pointer';
      span.style.display = 'inline-block';
      span.style.margin = '3px 5px';
      span.onclick = function() { focusIdx = si; renderFocus(); };
      for (var ci = 0; ci < s.chars.length; ci++) {
        var d = document.createElement('span');
        d.className = 'char-inline';
        d.innerHTML = (S.pinyinOn ? '<div class="py" style="color:' + (si === focusIdx ? '#8844ff' : '#2a3f55') + '">' + esc(s.py[ci]) + '</div>' : '') +
          '<div class="ch" style="color:' + (si === focusIdx ? '#fff' : '#5577aa') + '">' + esc(s.chars[ci]) + '</div>';
        span.appendChild(d);
      }
      inner.appendChild(span);
      if (si < sents.length - 1) {
        var dot = document.createElement('span');
        dot.textContent = '·';
        dot.style.color = '#2a3f55';
        dot.style.margin = '0 2px';
        inner.appendChild(dot);
      }
    })(sents[si], si);
  }
  renderFocus();
}

function renderFocus() {
  var sents = sentences();
  var s = sents[focusIdx];
  if (!s) return;
  document.getElementById('recall-focus-lbl').textContent = 'PHRASE ' + (focusIdx + 1) + ' / ' + sents.length;
  var fc = document.getElementById('recall-focus-chars');
  fc.innerHTML = '';
  for (var i = 0; i < s.chars.length; i++) {
    var d = document.createElement('div');
    d.className = 'fc';
    d.innerHTML = (S.pinyinOn ? '<div class="fc-py">' + esc(s.py[i]) + '</div>' : '') + '<div class="fc-ch">' + esc(s.chars[i]) + '</div>';
    fc.appendChild(d);
  }
  document.getElementById('recall-focus-en').textContent = s.en;
}

export function navFocus(dir) {
  var sents = sentences();
  focusIdx = Math.max(0, Math.min(sents.length - 1, focusIdx + dir));
  if (focusIdx === sents.length - 1 && dir === 1) {
    reads++;
    document.getElementById('recall-reads-badge').textContent = reads > 0 ? '✅ ×' + reads : '';
  }
  renderStudy();
}

export function readThrough() {
  reads++;
  focusIdx = 0;
  renderStudy();
  document.getElementById('recall-reads-badge').textContent = '✅ ×' + reads;
  document.getElementById('recall-read-btn').textContent = '↺ READ AGAIN';
}

// ── DRILL ────────────────────────────────────────────────────────────────
export function startDrill(guided) {
  if (sentences().length === 0) return;
  drillMode = guided;
  dXpPer = guided ? 15 : 25;
  sIdx = 0;
  results = [];
  placed = [];
  mistakes = 0;
  sessionXpEarned = 0;
  document.getElementById('recall-drill-label').textContent = guided ? 'CHARACTER DRILL' : 'FULL RECALL';
  document.getElementById('recall-drill-label').style.color = guided ? '#00cfff' : '#00ff88';
  document.getElementById('recall-progress-fill').style.background = guided ? 'linear-gradient(90deg,#00cfff,#00f5ff)' : 'linear-gradient(90deg,#00ff88,#00f5ff)';
  renderDrill();
  showRecallScreen('recall-drill');
}

export function restartDrill() {
  startDrill(drillMode);
}

function renderDrill() {
  var sents = sentences();
  var s = sents[sIdx];
  var total = sents.length;
  document.getElementById('recall-progress-fill').style.width = (sIdx / total * 100) + '%';
  document.getElementById('recall-drill-prog').textContent = (sIdx + 1) + '/' + total;

  var dots = document.getElementById('recall-phrase-dots');
  dots.innerHTML = '';
  for (var i = 0; i < total; i++) {
    var d = document.createElement('div');
    d.className = 'pdot' + (i < sIdx ? (drillMode ? ' done' : ' done-r') : i === sIdx ? ' active' : '');
    dots.appendChild(d);
  }

  var hb = document.getElementById('recall-hint-box');
  if (drillMode) {
    hb.style.cssText = 'background:rgba(0,207,255,.04);border:1px solid rgba(0,207,255,.2);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;';
    hb.innerHTML = '<span style="font-size:11px;color:#334d5c">Need a hint?</span><button onclick="showHint()" style="padding:4px 12px;background:rgba(0,207,255,.1);border:1px solid rgba(0,207,255,.4);border-radius:8px;color:#00cfff;font-size:11px;cursor:pointer">Show English</button>';
  } else {
    hb.innerHTML = '';
    hb.style.cssText = '';
  }

  document.getElementById('recall-placed-lbl').textContent = placed.length === s.chars.length ? '✅ COMPLETE' : 'BUILD · ' + placed.length + '/' + s.chars.length;
  renderPlaced();

  bank = shuffle(s.chars.map(function(c, i) { return { char: c, py: s.py[i], id: i + '_' + Math.random() }; }));
  bank = bank.filter(function(b) { return !placed.some(function(p) { return p.id === b.id; }); });
  renderBank();

  document.getElementById('recall-drill-feedback').textContent = '';
  document.getElementById('recall-next-btn').style.display = 'none';
}

function renderPlaced() {
  var sents = sentences();
  var s = sents[sIdx];
  var color = drillMode ? '#00cfff' : '#00ff88';
  var pt = document.getElementById('recall-placed-tiles');
  pt.innerHTML = '';
  for (var i = 0; i < s.chars.length; i++) {
    var tile = placed[i];
    var isNext = i === placed.length && placed.length < s.chars.length;
    var slot = document.createElement('div');
    slot.className = 'place-slot';
    slot.style.cssText = 'width:38px;height:50px;border-radius:9px;background:' + (tile ? 'rgba(0,245,255,.1)' : isNext ? 'rgba(0,245,255,.07)' : 'transparent') + ';border:1px ' + (isNext ? 'solid rgba(0,245,255,.5)' : tile ? 'solid ' + color + '88' : 'dashed #1a3348') + ';display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:' + (isNext ? '0 0 8px rgba(0,245,255,.25)' : 'none');
    if (tile) slot.innerHTML = (S.pinyinOn ? '<div class="s-py" style="font-size:7px;color:' + color + 'aa;margin-bottom:1px">' + esc(tile.py) + '</div>' : '') + '<div class="s-ch" style="font-family:serif;font-size:20px;color:' + (placed.length === s.chars.length ? '#00ff88' : '#fff') + '">' + esc(tile.char) + '</div>';
    pt.appendChild(slot);
  }
  if (placed.length > 0 && placed.length < s.chars.length) {
    var ub = document.createElement('button');
    ub.id = 'recall-undo-btn';
    ub.textContent = '⌫';
    ub.onclick = undoLast;
    pt.appendChild(ub);
  }
}

function renderBank() {
  var bt = document.getElementById('recall-bank-tiles');
  bt.innerHTML = '';
  for (var i = 0; i < bank.length; i++) {
    (function(tile) {
      var el = document.createElement('div');
      el.className = 'bank-tile';
      el.innerHTML = (S.pinyinOn ? '<div class="t-py">' + esc(tile.py) + '</div>' : '') + '<div class="t-ch">' + esc(tile.char) + '</div>';
      el.addEventListener('touchstart', function(e) { e.preventDefault(); tapTile(tile, el); }, { passive: false });
      el.addEventListener('mousedown', function() { tapTile(tile, el); });
      bt.appendChild(el);
    })(bank[i]);
  }
}

function tapTile(tile, el) {
  var s = sentences()[sIdx];
  if (placed.length >= s.chars.length) return;
  var expected = s.chars[placed.length];
  if (tile.char === expected) {
    placed.push(tile);
    bank = bank.filter(function(b) { return b.id !== tile.id; });
    renderPlaced();
    renderBank();
    if (placed.length === s.chars.length) drillComplete();
  } else {
    mistakes++;
    el.classList.add('shaking');
    setTimeout(function() { el.classList.remove('shaking'); }, 400);
    var fb = document.getElementById('recall-drill-feedback');
    fb.textContent = '❌ ' + mistakes + ' mistake' + (mistakes !== 1 ? 's' : '');
    fb.style.color = '#ff4466aa';
  }
}

export function undoLast() {
  if (!placed.length) return;
  var last = placed.pop();
  bank.push(last);
  renderPlaced();
  renderBank();
}

export function showHint() {
  var s = sentences()[sIdx];
  var hb = document.getElementById('recall-hint-box');
  hb.innerHTML = '<span style="font-family:\'Exo 2\',sans-serif;font-size:13px;color:#7ab8cc;font-style:italic">"' + esc(s.en) + '"</span>';
}

function drillComplete() {
  var earned = Math.max(0, dXpPer - mistakes * 3);
  var rec = getProgressRecord(SET_ID, GAME_ID);
  rec.xp += earned;
  saveProgressRecord(SET_ID, GAME_ID, rec);
  sessionXpEarned += earned;
  document.getElementById('recall-xp-num').textContent = rec.xp;

  var fb = document.getElementById('recall-drill-feedback');
  fb.textContent = mistakes === 0 ? '⭐ PERFECT! +' + earned + ' XP' : '✅ DONE · ' + mistakes + ' mistake' + (mistakes !== 1 ? 's' : '') + ' · +' + earned + ' XP';
  fb.style.color = '#00ff88';

  var nb = document.getElementById('recall-next-btn');
  var color = drillMode ? '#00cfff' : '#00ff88';
  nb.style.cssText = 'display:block;width:100%;padding:14px;background:rgba(0,245,255,.08);border:1.5px solid ' + color + ';border-radius:13px;color:' + color + ';font-family:Orbitron,monospace;font-size:13px;font-weight:700;letter-spacing:3px;cursor:pointer;text-align:center;margin-top:10px;box-shadow:0 0 16px ' + color + '33;';
  nb.textContent = sIdx + 1 < sentences().length ? 'NEXT PHRASE →' : 'FINISH MISSION ✓';
}

export function nextPhrase() {
  results.push({ sIdx: sIdx, mistakes: mistakes });
  if (sIdx + 1 < sentences().length) {
    sIdx++;
    placed = [];
    mistakes = 0;
    renderDrill();
  } else {
    showSummary();
  }
}

function showSummary() {
  var sents = sentences();
  var perfect = results.filter(function(r) { return r.mistakes === 0; }).length;
  var total = results.length;
  var pct = Math.round(perfect / total * 100);
  var levels = [{ min: 100, text: 'FLAWLESS! 🏆', col: '#ffd700' }, { min: 80, text: 'EXCELLENT! 🌟', col: '#00ff88' }, { min: 60, text: 'GOOD JOB! 💪', col: '#00cfff' }, { min: 0, text: 'KEEP GOING! ✊', col: '#ff9900' }];
  var h = levels[0];
  for (var i = 0; i < levels.length; i++) if (pct >= levels[i].min) { h = levels[i]; break; }

  document.getElementById('recall-sum-title').textContent = h.text;
  document.getElementById('recall-sum-title').style.color = h.col;
  document.getElementById('recall-sum-title').style.textShadow = '0 0 20px ' + h.col;
  document.getElementById('recall-sum-score').innerHTML = perfect + '<span style="font-size:40%;color:#44667a">/' + total + '</span>';
  document.getElementById('recall-sum-score').style.color = h.col;
  document.getElementById('recall-sum-score').style.textShadow = '0 0 30px ' + h.col;
  document.getElementById('recall-sum-sub').textContent = 'phrases completed perfectly';

  var list = document.getElementById('recall-sum-list');
  list.innerHTML = '<div style="font-family:Orbitron,monospace;font-size:9px;color:#44667a;letter-spacing:3px;margin-bottom:12px">BREAKDOWN</div>';
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var row = document.createElement('div');
    row.className = 'sl-row';
    row.innerHTML = '<span>' + (r.mistakes === 0 ? '✅' : '⚠️') + '</span><span style="font-family:serif;font-size:16px;color:#99b8cc;flex:1">' + esc(sents[r.sIdx].full) + '</span><span style="font-size:11px;color:' + (r.mistakes === 0 ? '#00ff88' : '#ff9900') + '">' + (r.mistakes === 0 ? 'Perfect' : r.mistakes + ' err') + '</span>';
    list.appendChild(row);
  }

  var color = drillMode ? '#00cfff' : '#00ff88';
  var ab = document.getElementById('recall-sum-again-btn');
  ab.textContent = '↺ TRY AGAIN';
  ab.style.cssText = 'display:block;width:100%;padding:14px;background:rgba(0,245,255,.08);border:1.5px solid ' + color + ';border-radius:13px;color:' + color + ';font-family:Orbitron,monospace;font-size:13px;font-weight:700;letter-spacing:3px;cursor:pointer;text-align:center;margin-bottom:10px;box-shadow:0 0 14px ' + color + '33;';

  logSession({ setId: SET_ID, game: GAME_ID, score: perfect, total: total, xpEarned: sessionXpEarned, mode: drillMode ? 'guided' : 'full' });
  showRecallScreen('recall-summary');
}
