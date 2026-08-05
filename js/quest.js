// quest.js — 汉字 QUEST flashcard quiz, ported from char4-quest.html.
// Reference implementation for the module pattern: render functions rebuild
// innerHTML from S, action functions mutate S then save to Firebase + re-render.

import { S, getProgressRecord, saveProgressRecord, logSession } from './data.js';
import { shuffle, esc, spawnFloater, toast } from './utils.js';
import { navTo } from './nav.js';

var SET_ID = 'c4';
var GAME_ID = 'quest';

var quiz = [], qIdx = 0, answers = [];
var busy = false;

function vocab() {
  var set = S.vocabSets[SET_ID];
  return (set && set.vocab) || [];
}

function showQuestScreen(id) {
  var screens = document.querySelectorAll('#view-quest .screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

export function enterQuest() {
  showQuestScreen('quest-home');
  refreshHome();
}

export function questBackToApp() {
  navTo('home');
}

function refreshHome() {
  var rec = getProgressRecord(SET_ID, GAME_ID);
  document.getElementById('quest-xp-val').innerHTML = rec.xp + ' <span style="font-size:13px;color:#44667a">XP</span>';
  document.getElementById('quest-streak').textContent = rec.streak;
  document.getElementById('quest-correct').textContent = rec.correct;
  document.getElementById('quest-vocab-count').textContent = vocab().length;
  buildCodex();
}

export function showCodex() {
  buildCodex();
  showQuestScreen('quest-codex');
}

function buildCodex() {
  var list = document.getElementById('quest-codex-list');
  if (!list) return;
  list.innerHTML = '';
  var v = vocab();
  for (var i = 0; i < v.length; i++) {
    var item = v[i];
    var card = document.createElement('div');
    card.className = 'cx-card';
    card.innerHTML = '<div class="cx-char">' + esc(item.char) + '</div><div>' +
      (S.pinyinOn ? '<div class="cx-py">' + esc(item.py) + '</div>' : '') +
      '<div class="cx-en">' + esc(item.en) + '</div></div>';
    list.appendChild(card);
  }
}
S.pinyinListeners.push(buildCodex);

function generateQuiz(n) {
  var v = vocab();
  return shuffle(v).slice(0, n).map(function(target) {
    var mode = Math.random() > .5 ? 'decode' : 'encode';
    var wrongs = shuffle(v.filter(function(x) { return x.char !== target.char; })).slice(0, 3);
    var opts;
    if (mode === 'decode') {
      opts = shuffle([{ text: target.en, correct: true }].concat(wrongs.map(function(w) { return { text: w.en, correct: false }; })));
      return { target: target, mode: mode, prompt: target.char, label: 'WHAT DOES THIS MEAN?', opts: opts };
    } else {
      opts = shuffle([{ text: target.char, py: target.py, correct: true }].concat(wrongs.map(function(w) { return { text: w.char, py: w.py, correct: false }; })));
      return { target: target, mode: mode, prompt: target.en, label: 'WHICH PHRASE MEANS...', opts: opts };
    }
  });
}

export function startQuiz() {
  var v = vocab();
  if (v.length < 4) {
    toast('Not enough vocab loaded yet — ask the teacher to log in first.');
    return;
  }
  quiz = generateQuiz(Math.min(5, v.length));
  qIdx = 0;
  answers = [];
  busy = false;
  showQuestScreen('quest-quiz');
  renderQuestion();
}

function renderQuestion() {
  var q = quiz[qIdx];
  document.getElementById('progress-fill').style.width = (qIdx / quiz.length * 100) + '%';

  var dots = document.getElementById('dots');
  dots.innerHTML = '';
  for (var i = 0; i < quiz.length; i++) {
    var d = document.createElement('div');
    d.className = 'dot' + (i < answers.length ? (answers[i] ? ' correct' : ' wrong') : (i === qIdx ? ' active' : ''));
    dots.appendChild(d);
  }

  document.getElementById('prompt-label').textContent = q.label;
  var pt = document.getElementById('prompt-text');
  pt.textContent = q.prompt;
  pt.className = q.mode === 'encode' ? 'meaning' : '';
  document.getElementById('prompt-pinyin').textContent = '';

  var oc = document.getElementById('options');
  oc.innerHTML = '';
  for (var j = 0; j < q.opts.length; j++) {
    (function(opt, idx) {
      var btn = document.createElement('div');
      btn.className = 'opt' + (q.mode === 'decode' ? ' meaning-opt' : '');
      btn.innerHTML = esc(opt.text) + (S.pinyinOn && opt.py ? '<br><span style="font-size:8px;color:#44667a">' + esc(opt.py) + '</span>' : '');
      btn.onclick = function() { selectOpt(idx); };
      oc.appendChild(btn);
    })(q.opts[j], j);
  }

  document.getElementById('feedback-text').textContent = '';
  document.getElementById('feedback-text').style.color = '';
}

export function selectOpt(i) {
  if (busy) return;
  busy = true;
  var q = quiz[qIdx];
  var correct = q.opts[i].correct;
  var opts = document.getElementById('options').children;
  for (var j = 0; j < opts.length; j++) {
    if (q.opts[j].correct) opts[j].classList.add('correct');
    else if (j === i) opts[j].classList.add('wrong');
    else opts[j].classList.add('dim');
  }
  if (S.pinyinOn) document.getElementById('prompt-pinyin').textContent = q.target.py;

  var fb = document.getElementById('feedback-text');
  if (correct) {
    fb.textContent = '⭐ CORRECT! +20 XP';
    fb.style.color = '#00ff88';
    spawnFloater(['⭐', '✨', '💫', '🌟'][Math.floor(Math.random() * 4)]);
  } else {
    fb.textContent = '❌  ' + q.target.char + ' = ' + q.target.en;
    fb.style.color = '#ff4466';
  }
  answers.push(correct);
  setTimeout(function() {
    if (qIdx + 1 >= quiz.length) {
      finishQuiz();
    } else {
      qIdx++;
      busy = false;
      renderQuestion();
    }
  }, 1400);
}

function finishQuiz() {
  var score = answers.filter(function(a) { return a; }).length;
  var perfect = score === quiz.length;
  var earned = score * 20 + (perfect ? 50 : 0);

  var rec = getProgressRecord(SET_ID, GAME_ID);
  rec.xp += earned;
  rec.correct += score;
  rec.streak = score >= 4 ? rec.streak + 1 : (score === 0 ? 0 : rec.streak);
  saveProgressRecord(SET_ID, GAME_ID, rec);
  logSession({ setId: SET_ID, game: GAME_ID, score: score, total: quiz.length, xpEarned: earned });

  var colors = score === 5 ? '#ffd700' : score >= 4 ? '#00ff88' : score >= 3 ? '#00f5ff' : score >= 2 ? '#ff9900' : '#ff4466';
  var texts = score === 5 ? 'PERFECT MISSION!' : score >= 4 ? 'EXCELLENT!' : score >= 3 ? 'MISSION COMPLETE' : score >= 2 ? 'KEEP TRAINING' : 'RETRY MISSION';
  document.getElementById('result-title').textContent = texts;
  document.getElementById('result-title').style.color = colors;
  document.getElementById('result-score').innerHTML = score + '<span style="font-size:40%;color:#44667a">/' + quiz.length + '</span>';
  document.getElementById('result-score').style.color = colors;
  document.getElementById('result-score').style.textShadow = '0 0 30px ' + colors;
  document.getElementById('result-xp').textContent = '+' + earned + ' XP' + (perfect ? '  · PERFECT BONUS +50 🎉' : '');

  var list = document.getElementById('result-list');
  list.innerHTML = '';
  for (var i = 0; i < quiz.length; i++) {
    var q = quiz[i];
    var row = document.createElement('div');
    row.className = 'rl-row';
    row.innerHTML = '<span class="rl-icon">' + (answers[i] ? '✅' : '❌') + '</span>' +
      '<span class="rl-char">' + esc(q.target.char) + '</span>' +
      '<span class="rl-info">' + (S.pinyinOn ? esc(q.target.py) + '<br>' : '') + esc(q.target.en) + '</span>';
    list.appendChild(row);
  }
  showQuestScreen('quest-result');
  refreshHome();
}
