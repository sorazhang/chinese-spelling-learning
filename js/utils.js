// utils.js — small stateless helpers used by multiple features.

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function fmtDate(ts) {
  var d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

var toastTimer = null;
export function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2200);
}

export function buildStars(container) {
  var target = container || document.body;
  for (var i = 0; i < 80; i++) {
    var s = document.createElement('div');
    s.className = 'star';
    s.style.cssText = 'left:' + Math.random() * 100 + '%;top:' + Math.random() * 100 + '%;width:' + (Math.random() * 1.6 + .3) + 'px;height:' + (Math.random() * 1.6 + .3) + 'px;--d:' + (Math.random() * 3 + 2) + 's;--dl:' + (Math.random() * 6) + 's';
    target.appendChild(s);
  }
}

export function shuffle(a) {
  var arr = a.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function spawnFloater(emoji) {
  var f = document.createElement('div');
  f.className = 'floater';
  f.textContent = emoji;
  f.style.left = (30 + Math.random() * 40) + '%';
  f.style.top = '40%';
  document.body.appendChild(f);
  setTimeout(function() { f.remove(); }, 1200);
}
