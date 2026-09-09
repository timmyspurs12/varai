/* ============================================================
   VARAI — motion: analysis, not spectacle.
   ============================================================ */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var T = function (fn, ms) { return setTimeout(fn, reduce ? 0 : ms); };
  var timers = [];
  function later(fn, ms) { timers.push(T(fn, ms)); }
  function clearAll() { timers.forEach(clearTimeout); timers = []; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- reveal on scroll ---------- */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('seen');
      if (e.target.id === 'case') runCase();
      if (e.target.id === 'verdict') runVerdict();
      io.unobserve(e.target);
    });
  }, { threshold: 0.22 });
  ['#case', '#verdict'].forEach(function (s) { var el = $(s); if (el) io.observe(el); });

  /* ---------- step highlight ---------- */
  var steps = $$('.step');
  if (steps.length) {
    var si = 0;
    setInterval(function () {
      steps.forEach(function (s) { s.classList.remove('act'); });
      steps[si].classList.add('act');
      si = (si + 1) % steps.length;
    }, 2600);
  }

  /* ---------- phase blocks ---------- */
  function fill(id, pctId, target, dur, done, cb) {
    var wrap = document.getElementById(id);
    if (!wrap) return cb && cb();
    var bl = $$('i', wrap), n = bl.length, hit = Math.round(n * target / 100);
    var step = dur / Math.max(hit, 1), i = 0, p = document.getElementById(pctId);
    (function tick() {
      if (i >= hit) {
        if (done) wrap.classList.add('done');
        if (p) p.textContent = target + '%';   /* settle on the true value */
        return cb && cb();
      }
      bl[i].classList.add('on');
      i++;
      if (p) p.textContent = Math.round(i / hit * target) + '%';
      later(tick, step);
    })();
  }

  function resetCase() {
    clearAll();
    $$('.blocks').forEach(function (b) {
      b.classList.remove('done');
      $$('i', b).forEach(function (i) { i.classList.remove('on'); });
    });
    ['p0', 'p1', 'p2'].forEach(function (id) { var e = document.getElementById(id); if (e) e.textContent = '0%'; });
    $$('.ev').forEach(function (e) { e.classList.remove('in'); });
    $$('.val').forEach(function (e) { e.classList.remove('in'); });
    var js = $('#jstate'); if (js) { js.textContent = 'UNDER REVIEW'; js.style.color = ''; }
    var jd = $('#jdot'); if (jd) { jd.className = 'dot work'; }
  }

  var elapsedTimer = null;
  function runCase() {
    resetCase();
    /* elapsed clock */
    var t0 = Date.now(), el = $('#elapsed');
    clearInterval(elapsedTimer);
    elapsedTimer = setInterval(function () {
      if (!el) return;
      var s = (Date.now() - t0) / 1000;
      el.textContent = '00:' + (s < 10 ? '0' : '') + s.toFixed(1);
      if (s > 4.2) clearInterval(elapsedTimer);
    }, 100);

    /* playhead drift */
    var play = $('#play');
    if (play && !reduce) {
      var p = 38;
      var pt = setInterval(function () {
        p += 0.35; play.style.left = p + '%';
        if (p >= 66) clearInterval(pt);
      }, 40);
    }

    /* 1. evidence enters sequentially */
    $$('.ev').forEach(function (e, i) { later(function () { e.classList.add('in'); }, 150 + i * 70); });

    /* 2. evidence phase fills */
    later(function () {
      fill('b0', 'p0', 100, 700, false, function () {
        /* 3. validators appear one by one while analysis runs */
        $$('.val').forEach(function (v, i) { later(function () { v.classList.add('in'); }, i * 110); });
        fill('b1', 'p1', 100, 1100, false, function () {
          /* 4. consensus converges to 78 */
          fill('b2', 'p2', 78, 900, true, function () {
            var js = $('#jstate');
            if (js) { js.textContent = 'VERDICT REACHED'; js.style.color = 'var(--lime)'; }
            var jd = $('#jdot'); if (jd) jd.className = 'dot ok';
          });
        });
      });
    }, 480);
  }

  /* ---------- verdict lock ---------- */
  function runVerdict() {
    var ring = $('#vring'), pct = $('#vpct'), word = $('#vword'), card = $('#vcard');
    if (!ring) return;
    var C = 2 * Math.PI * 58, target = 78;
    later(function () {
      ring.style.strokeDashoffset = C * (1 - target / 100);
      var n = 0;
      var t = setInterval(function () {
        n += Math.max(1, Math.round((target - n) / 6));
        if (n >= target) { n = target; clearInterval(t); }
        if (pct) pct.textContent = n;
      }, reduce ? 0 : 26);
      if (reduce && pct) pct.textContent = target;
    }, 260);
    later(function () { if (word) word.classList.add('in'); }, 900);
    later(function () { if (card) card.classList.add('locked'); }, 1180);
  }

  /* ---------- controls ---------- */
  var run = $('#run'), replay = $('#replay');
  if (run) run.addEventListener('click', function () {
    document.getElementById('case').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    runCase();
  });
  if (replay) replay.addEventListener('click', runCase);

  /* keyboard: Enter re-runs judgment when case is in view */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !/INPUT|TEXTAREA|BUTTON|A/.test(document.activeElement.tagName)) runCase();
  });
})();
