/* Slide engine: scaling, steps, keyboard/clicker, notes, presenter view.
   Hash forms (plain tokens only): #12 = slide 12; #v12s3 = bare view of slide 12 at step 3
   (used by the presenter frames and the screenshot evals); #presenter = presenter view. */
(function () {
  const stage = document.getElementById('stage');
  const slides = Array.from(document.querySelectorAll('.slide'));
  const ctl = window.SLIDES || {};
  const chan = ('BroadcastChannel' in window) ? new BroadcastChannel('age-of-llms-deck') : null;
  let cur = 0, step = 0, started = null;

  slides.forEach((s, i) => {
    const n = document.createElement('div');
    n.className = 'pageno'; n.textContent = (i + 1) + ' / ' + slides.length;
    if (!s.dataset.nonum) s.appendChild(n);
  });

  function fit() {
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'translate(-50%, -50%) scale(' + k + ')';
  }

  function maxStep(i) {
    const s = slides[i];
    let m = 0;
    s.querySelectorAll('[data-step]').forEach(e => { m = Math.max(m, +e.dataset.step); });
    const c = ctl[s.id];
    if (c && c.steps) m = Math.max(m, c.steps);
    return m;
  }

  function applySteps(i, n, instant) {
    const s = slides[i];
    s.querySelectorAll('[data-step]').forEach(e => {
      const k = +e.dataset.step;
      e.classList.toggle('on', k <= n);
      const until = e.dataset.until ? +e.dataset.until : Infinity;
      e.classList.toggle('dimmed', n > until);
    });
    const c = ctl[s.id];
    if (c && c.step) { try { c.step(s, n, !!instant); } catch (err) { console.error(s.id, err); } }
    liveCaret(s);
  }

  // The newest visible console on the slide gets the blinking caret.
  function liveCaret(s) {
    let best = null, bk = -1;
    s.querySelectorAll('.term, .caret').forEach(e => {
      e.classList.remove('caret-live');
      const p = e.closest('[data-step]');
      if (p && (!p.classList.contains('on') || p.classList.contains('dimmed'))) return;
      const k = p ? +p.dataset.step : 0;
      if (k >= bk) { bk = k; best = e; }
    });
    if (best) best.classList.add('caret-live');
  }

  function show(i, n, instant) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    const entering = i !== cur || !slides[i].classList.contains('active');
    if (entering) {
      slides.forEach((s, k) => s.classList.toggle('active', k === i));
      const c = ctl[slides[i].id];
      if (c && c.enter) { try { c.enter(slides[i], !!instant); } catch (err) { console.error(slides[i].id, err); } }
      slides.forEach((s, k) => {
        if (k !== i) { const o = ctl[s.id]; if (o && o.leave) { try { o.leave(s); } catch (e) { } } }
      });
    }
    cur = i; step = Math.max(0, Math.min(maxStep(i), n || 0));
    applySteps(i, step, instant);
    document.getElementById('progress').style.width = (100 * (i + 1) / slides.length) + '%';
    renderNotes();
    if (!bare && !presenter) {
      try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { }
      if (chan) chan.postMessage({ i: cur, n: step });
    }
  }

  function next() {
    if (step < maxStep(cur)) { step++; applySteps(cur, step); renderNotes(); if (chan) chan.postMessage({ i: cur, n: step }); }
    else if (cur < slides.length - 1) show(cur + 1, 0);
  }
  function prev() {
    if (step > 0) { step--; applySteps(cur, step); renderNotes(); if (chan) chan.postMessage({ i: cur, n: step }); }
    else if (cur > 0) show(cur - 1, maxStep(cur - 1), true);
  }

  // notes overlay
  const overlay = document.getElementById('notes-overlay');
  function notesOf(i) {
    const s = slides[i];
    const nn = s.querySelector('.notes');
    return { html: nn ? nn.innerHTML : '', t: +(s.dataset.t || 0), sec: s.dataset.section || '' };
  }
  function renderNotes() {
    const n = notesOf(cur);
    if (!overlay.hidden) overlay.innerHTML = '<div class="meta">' + (cur + 1) + ' / ' + slides.length +
      ' · step ' + step + '/' + maxStep(cur) + ' · ' + n.sec + ' · target ' + n.t + 's</div>' + n.html;
  }

  function fullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement) { const p = el.requestFullscreen && el.requestFullscreen(); if (p && p.catch) p.catch(() => { }); }
      else document.exitFullscreen();
    } catch (e) { }
  }

  let typed = '';
  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { typed += k; return; }
    if (k === 'Enter' && typed) { show(+typed - 1, 0); typed = ''; e.preventDefault(); return; }
    typed = '';
    if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') show(0, 0);
    else if (k === 'End') show(slides.length - 1, 0);
    else if (k === 'n' || k === 'N') { overlay.hidden = !overlay.hidden; renderNotes(); }
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'p' || k === 'P') openPresenter();
    else if (k === 'b' || k === 'B' || k === '.') { stage.style.visibility = stage.style.visibility === 'hidden' ? '' : 'hidden'; }
  });
  stage.addEventListener('click', e => { if (!e.target.closest('a,button,video')) next(); });
  // Mouse wheel or trackpad: scroll down = next build, up = previous. One gesture moves one build: a wheel notch or
  // swipe fires many events (and a trackpad keeps firing while it coasts), so input stays locked until it pauses.
  let wheelSum = 0, wheelLock = 0;
  window.addEventListener('wheel', e => {
    if (e.ctrlKey || document.body.classList.contains('presenter')) return; // ctrl+wheel stays browser zoom
    if (!overlay.hidden && overlay.contains(e.target)) return;              // the notes strip scrolls normally
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) { wheelLock = Math.max(wheelLock, now + 220); return; }
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
    wheelSum += Math.abs(e.deltaX) > Math.abs(dy) ? e.deltaX : dy;
    if (Math.abs(wheelSum) < 40) return;
    (wheelSum > 0 ? next : prev)();
    wheelSum = 0; wheelLock = now + 500;
  }, { passive: false });

  function openPresenter() {
    let w = null;
    try { w = window.open(location.href.split('#')[0] + '#presenter', 'age-presenter', 'width=1400,height=850'); } catch (e) { }
    if (!w) { overlay.hidden = false; renderNotes(); }
  }

  // presenter mode
  const h = location.hash.slice(1);
  const bare = /^v\d+/.test(h);
  const presenter = h === 'presenter';
  window.DECK = { show, next, prev, count: slides.length, maxStep, get cur() { return cur; }, get step() { return step; } };

  if (presenter) {
    document.body.classList.add('presenter');
    const P = document.getElementById('presenter');
    const base = location.href.split('#')[0];
    const fNow = P.querySelector('.now iframe'), fNext = P.querySelector('.next iframe');
    const clock = P.querySelector('.clock'), pane = P.querySelector('.notes-pane');
    let pi = 0, pn = 0;
    function scaleFrames() {
      [fNow, fNext].forEach(f => { const w = f.parentElement.clientWidth; f.style.transform = 'scale(' + (w / 1920) + ')'; });
    }
    function sync(i, n) {
      pi = i; pn = n;
      fNow.src = base + '#v' + (i + 1) + 's' + n;
      const ms = maxStep(i);
      fNext.src = n < ms ? base + '#v' + (i + 1) + 's' + (n + 1) : base + '#v' + Math.min(slides.length, i + 2) + 's0';
      const nt = notesOf(i);
      pane.innerHTML = '<h3>' + (i + 1) + ' / ' + slides.length + ' · step ' + n + '/' + ms + ' · ' + nt.sec + ' · ' + nt.t + 's</h3>' + nt.html;
    }
    if (chan) chan.onmessage = ev => sync(ev.data.i, ev.data.n);
    document.addEventListener('keydown', e => {
      if (['ArrowRight', 'PageDown', ' ', 'ArrowLeft', 'PageUp'].includes(e.key) && window.opener) {
        try { const D = window.opener.DECK; (['ArrowLeft', 'PageUp'].includes(e.key) ? D.prev : D.next)(); } catch (err) { }
      }
      if (e.key === 't' || e.key === 'T') started = Date.now();
    });
    started = Date.now();
    setInterval(() => {
      const el = (Date.now() - started) / 1000;
      let target = 0; for (let k = 0; k <= pi; k++) target += +(slides[k].dataset.t || 0);
      const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      const late = el > target + 20;
      clock.innerHTML = '<span>' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>' +
        '<span>elapsed ' + fmt(el) + '</span><span class="' + (late ? 'late' : 'ok') + '">plan ' + fmt(target) + ' (end of this slide)</span>' +
        '<span class="mute">T resets timer</span>';
    }, 500);
    window.addEventListener('resize', scaleFrames);
    setTimeout(() => { scaleFrames(); sync(0, 0); }, 50);
    return;
  }

  if (h === 'print') {
    // Static export: every slide at its final step (used for talk.pdf).
    document.body.classList.add('print');
    slides.forEach((s, i) => {
      s.classList.add('active');
      const c = ctl[s.id];
      try { if (c && c.enter) c.enter(s, true); } catch (e) { console.error(s.id, e); }
      const m = maxStep(i);
      s.querySelectorAll('[data-step]').forEach(e => { e.classList.add('on'); if (e.dataset.until && +e.dataset.until < m) e.classList.add('dimmed'); });
      try { if (c && c.step) c.step(s, m, true); } catch (e) { console.error(s.id, e); }
      liveCaret(s);
    });
    return;
  }
  // slide navigator along the bottom edge
  const nav = document.getElementById('nav'), navRow = document.getElementById('nav-row'), navTip = document.getElementById('nav-tip');
  const SEC = { 'A': 'var(--mute)', 'B': 'var(--l-new)', 'C': 'var(--l-sys)', 'D': 'var(--l-proj)' };
  const titleOf = s => { const h = s.querySelector('h1.claim'); return h ? h.textContent.trim() : (s.id === 's-open' ? 'Opening: 29 slides, then the forest' : s.id === 's-storm' ? 'Storm and the hook' : s.id === 's-close' ? 'WALL-E and thank you' : s.id); };
  let navHide = null;
  const navBtns = slides.map((s, i) => {
    const b = document.createElement('button');
    b.textContent = i + 1; b.title = titleOf(s);
    b.style.setProperty('--sec', SEC[(s.dataset.section || '').split(' ')[0]] || 'var(--line)');
    b.addEventListener('mouseenter', () => { navTip.textContent = (i + 1) + ' · ' + titleOf(s); });
    b.addEventListener('click', e => { e.stopPropagation(); show(i, maxStep(i), true); navShow(true); });
    navRow.appendChild(b); return b;
  });
  const navShow = on => {
    clearTimeout(navHide);
    if (on) { nav.classList.add('show'); navBtns.forEach((b, i) => b.classList.toggle('cur', i === cur)); navTip.textContent = (cur + 1) + ' · ' + titleOf(slides[cur]); }
    else navHide = setTimeout(() => nav.classList.remove('show'), 900);
  };
  document.addEventListener('mousemove', e => { if (e.clientY > window.innerHeight - 70) navShow(true); else if (!nav.matches(':hover')) navShow(false); });
  nav.addEventListener('mouseleave', () => navShow(false));
  document.addEventListener('keydown', e => { if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) { if (nav.classList.contains('show')) nav.classList.remove('show'); else navShow(true); } if (e.key === 'Escape') nav.classList.remove('show'); });
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(document.documentElement);
  fit(); requestAnimationFrame(fit);
  let start = 0, startStep = 0;
  const mv = h.match(/^v(\d+)s(\d+)$/);
  if (mv) { start = +mv[1] - 1; startStep = +mv[2]; document.getElementById('progress').hidden = true; }
  else if (/^\d+$/.test(h)) start = +h - 1;
  cur = -1;
  if (bare) document.body.dataset.bare = '1';
  show(start, startStep, bare);
  if (h === 'autoplay') next(); // test hook: #autoplay starts slide 1's flip-book
  if (bare) {
    document.body.dataset.bare = '1';
    // Self-check for the headless evals: overflow past the stage, clipped boxes, headline line count.
    setTimeout(() => {
      const s = slides[cur], st = stage.getBoundingClientRect(), k = st.width / 1920, bad = [];
      const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && el.className.baseVal === undefined ? '.' + String(el.className).split(' ')[0] : '')) + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
      s.querySelectorAll('*').forEach(el => {
        if (el.closest('.notes') || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.right > st.right + 2 || r.bottom > st.bottom + 2 || r.left < st.left - 2) bad.push('outside stage: ' + name(el));
        if (cs.overflow !== 'visible' && el.scrollHeight > el.clientHeight + 2) bad.push('clipped: ' + name(el));
      });
      s.querySelectorAll('svg').forEach(sv => {
        const vb = sv.viewBox.baseVal; if (!vb || !vb.width) return;
        sv.querySelectorAll('text').forEach(t => {
          if (+getComputedStyle(t).opacity === 0) return;
          let op = 1; for (let p = t; p && p !== sv; p = p.parentNode) { const o = p.getAttribute && p.getAttribute('opacity'); if (o !== null && o !== undefined && +o === 0) op = 0; }
          if (!op || !t.textContent.trim()) return;
          const r = t.getBoundingClientRect(), sr = sv.getBoundingClientRect();
          if (r.left < sr.left - 2 || r.right > sr.right + 2 || r.top < sr.top - 2 || r.bottom > sr.bottom + 2) bad.push('svg text outside viewBox: "' + t.textContent.slice(0, 30) + '"');
        });
      });
      const h1 = s.querySelector('h1.claim');
      if (h1) { const lh = parseFloat(getComputedStyle(h1).lineHeight); document.body.setAttribute('data-lines', Math.round(h1.getBoundingClientRect().height / k / lh)); }
      document.body.setAttribute('data-overflow', bad.join(' | '));
    }, 2500);
  }
})();
