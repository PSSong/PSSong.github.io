(function () {
  'use strict';

  var posts = [];
  var selected = new Set();
  var allTags = [];
  var showAll = false;
  var LIMIT = 24;

  function esc(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return String(d).slice(0, 10); }
  }

  function buildTags() {
    var cnt = {};
    posts.forEach(function (p) {
      (p.tags || []).forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; });
    });
    allTags = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
  }

  function renderChips() {
    var container = document.getElementById('xp-chips');
    var input = document.getElementById('xp-input');
    var q = input ? input.value.trim().toLowerCase() : '';
    var list = q ? allTags.filter(function (t) { return t.toLowerCase().indexOf(q) !== -1; })
                 : (showAll ? allTags : allTags.slice(0, LIMIT));

    var html = list.map(function (t) {
      var on = selected.has(t);
      return '<button class="xp-chip' + (on ? ' on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + (on ? '<span class="xp-x" aria-hidden="true">×</span>' : '') + '</button>';
    }).join('');

    // always show selected tags not visible in current list
    selected.forEach(function (t) {
      if (list.indexOf(t) === -1) {
        html += '<button class="xp-chip on" data-t="' + esc(t) + '">' + esc(t) + '<span class="xp-x" aria-hidden="true">×</span></button>';
      }
    });

    container.innerHTML = html;
    container.querySelectorAll('.xp-chip').forEach(function (btn) {
      btn.addEventListener('click', function () { toggle(btn.dataset.t); });
    });

    var tb = document.getElementById('xp-toggle');
    if (tb) {
      if (q || allTags.length <= LIMIT) { tb.style.display = 'none'; }
      else {
        tb.style.display = '';
        tb.textContent = showAll ? 'Show fewer tags ▲' : 'Show all ' + allTags.length + ' tags ▼';
      }
    }
  }

  function toggle(t) {
    if (selected.has(t)) { selected.delete(t); } else { selected.add(t); }
    renderChips();
    renderResult();
  }

  var PALETTE = ['#4a90d9', '#e67e22', '#27ae60', '#8e44ad', '#c0392b', '#16a085', '#d35400', '#e91e8c', '#00897b', '#fb8c00'];

  function renderResult() {
    var out = document.getElementById('xp-result');
    if (selected.size === 0) {
      out.innerHTML = '<p class="xp-hint">Select tags above to explore narratives.</p>';
      return;
    }
    var sel = Array.from(selected);
    var scored = posts.map(function (p) {
      var pt = p.tags || [];
      var sc = 0;
      sel.forEach(function (t) { if (pt.indexOf(t) !== -1) sc++; });
      return { p: p, sc: sc };
    }).filter(function (x) { return x.sc > 0; })
      .sort(function (a, b) {
        if (b.sc !== a.sc) return b.sc - a.sc;
        return new Date(b.p.date) - new Date(a.p.date);
      });

    if (scored.length === 0) {
      out.innerHTML = '<p class="xp-hint">No articles match the selected tags.</p>';
      return;
    }

    // chain color map
    var chains = {};
    var ci = 0;
    scored.forEach(function (x) {
      var c = x.p.narrative_chain;
      if (c && !chains[c]) { chains[c] = PALETTE[ci++ % PALETTE.length]; }
    });

    var html = '<div class="xp-tl">';
    scored.forEach(function (x, idx) {
      var p = x.p;
      var last = idx === scored.length - 1;
      var cc = p.narrative_chain ? chains[p.narrative_chain] : null;
      var isShift = p.narrative_shift;
      var matchedT = sel.filter(function (t) { return (p.tags || []).indexOf(t) !== -1; });
      var otherT = (p.tags || []).filter(function (t) { return !selected.has(t); }).slice(0, 4);
      var pct = Math.round(x.sc / sel.length * 100);

      var dotStyle = cc ? ' style="background:' + cc + ';box-shadow:0 0 0 3px ' + cc + '40"' : '';
      var lineStyle = (!last && cc) ? ' style="background:' + cc + '"' : '';

      var badge = p.direction ? '<span class="xp-dir xp-dir-' + esc(p.direction) + '">' + esc(p.direction) + '</span>' : '';
      var actor = p.sovereign_actor ? '<span class="xp-actor">' + esc(p.sovereign_actor) + '</span>' : '';
      var shift = isShift
        ? '<div class="xp-shift"><span class="xp-shift-icon">⟳</span><span class="xp-shift-txt">' + esc(p.shift_from || '?') + ' → ' + esc(p.shift_to || '?') + '</span><span class="xp-shift-label">' + esc(p.shift_type || 'shift') + '</span></div>'
        : '';
      var summary = p.summary ? '<p class="xp-sum">' + esc(p.summary) + '</p>' : '';
      var chain_title = p.narrative_chain
        ? '<span class="xp-chain" style="border-color:' + (cc || '#888') + ';color:' + (cc || '#888') + '">' + esc(p.narrative_chain) + '</span>'
        : '';

      html += '<div class="xp-row' + (isShift ? ' xp-shifted' : '') + '" data-chain="' + esc(p.narrative_chain || '') + '">';
      html += '<div class="xp-gutter"><div class="xp-dot"' + dotStyle + '></div>' + (!last ? '<div class="xp-line"' + lineStyle + '></div>' : '') + '</div>';
      html += '<div class="xp-card' + (isShift ? ' xp-card-shift' : '') + '">';
      if (shift) html += shift;
      html += '<div class="xp-meta"><span class="xp-date">' + fmtDate(p.date) + '</span>' + badge + actor + chain_title + '</div>';
      html += '<a class="xp-title" href="' + esc(p.permalink || '#') + '">' + esc(p.title) + '</a>';
      if (summary) html += summary;
      html += '<div class="xp-tags">';
      matchedT.forEach(function (t) { html += '<span class="xp-tag xp-tag-on">' + esc(t) + '</span>'; });
      otherT.forEach(function (t) { html += '<span class="xp-tag">' + esc(t) + '</span>'; });
      html += '</div>';
      html += '<div class="xp-bar"><div class="xp-fill" style="width:' + pct + '%"></div><span class="xp-pct">' + x.sc + '/' + sel.length + '</span></div>';
      html += '</div></div>';
    });
    html += '</div>';
    out.innerHTML = html;

    // chain hover highlight
    out.querySelectorAll('.xp-row[data-chain]').forEach(function (row) {
      var c = row.dataset.chain;
      if (!c) return;
      row.addEventListener('mouseenter', function () {
        out.querySelectorAll('.xp-row[data-chain="' + c + '"]').forEach(function (r) { r.classList.add('xp-chain-hl'); });
      });
      row.addEventListener('mouseleave', function () {
        out.querySelectorAll('.xp-row.xp-chain-hl').forEach(function (r) { r.classList.remove('xp-chain-hl'); });
      });
    });
  }

  function boot() {
    fetch('/index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        posts = (Array.isArray(data) ? data : []).filter(function (p) { return p && p.title; });
        buildTags();
        renderChips();
        renderResult();
      })
      .catch(function () {
        var out = document.getElementById('xp-result');
        if (out) out.innerHTML = '<p class="xp-hint xp-err">Failed to load articles. Try refreshing.</p>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    var inp = document.getElementById('xp-input');
    if (inp) {
      inp.addEventListener('input', renderChips);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var q = inp.value.trim();
          var match = allTags.filter(function (t) { return t.toLowerCase().indexOf(q.toLowerCase()) !== -1; });
          if (match.length === 1) { toggle(match[0]); inp.value = ''; }
          else if (q && match.length > 0) { toggle(match[0]); inp.value = ''; }
        }
      });
    }
    var tb = document.getElementById('xp-toggle');
    if (tb) {
      tb.addEventListener('click', function () { showAll = !showAll; renderChips(); });
    }
    var clear = document.getElementById('xp-clear');
    if (clear) {
      clear.addEventListener('click', function () { selected.clear(); renderChips(); renderResult(); });
    }
  });
})();
