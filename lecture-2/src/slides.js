/* Per-slide animations, in slide order, keyed by the slide's id.
   Each controller: { steps, enter(slide, instant), step(slide, n, instant), leave(slide) }.
   step() is idempotent: it draws the state for step n, animated unless instant. */
(function () {
  const S = window.STATS || {};
  const tot = (S.totals && S.totals.all) || {};
  const css = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
  const COL = {
    sys: css('l-sys'), proj: css('l-proj'), sess: css('l-sess'), conv: css('l-conv'), neu: css('l-new'),
    ok: css('cached'), bad: css('bad'), ink: css('ink'), mute: css('mute'), dim: css('dim'),
    line: css('line'), surf: css('surface'), surf2: css('surface-2'), bg: css('bg')
  };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = (ms, instant) => (instant || reduce) ? 0 : ms;
  const fmt = d3.format(',');
  const timers = {};
  const later = (k, fn, ms) => (timers[k] = timers[k] || []).push(d3.timeout(fn, ms));
  const stop = k => { (timers[k] || []).forEach(t => t.stop()); timers[k] = []; };
  const svg = id => d3.select('#' + id);
  const clear = id => { const s = svg(id); s.interrupt(); s.selectAll('*').interrupt().remove(); return s; };
  const text = (g, x, y, t, cls, anchor) => g.append('text').attr('x', x).attr('y', y).attr('class', cls || '').attr('text-anchor', anchor || 'start').text(t);
  /* A steel J hook drawn as a shaded wire. The wire is a centreline sampled with a radius at every point; the shading is
     ~22 stacked outlines that shrink and slide towards the light (upper left), dark rim to bright highlight, so it wraps
     round the bend, the point, the barb and the eye. Eye centre at the origin; tip of the point at (-190,190). */
  function steelHook(H) {
    const L = [-0.62, -0.78];                           // light direction
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    const ramp = [[30, 37, 44], [78, 88, 99], [140, 150, 161], [196, 204, 212], [246, 248, 250]];
    const col = t => { const x = Math.min(.9999, t) * (ramp.length - 1), i = Math.floor(x); return hex(mix(ramp[i], ramp[i + 1], x - i)); };
    const bez = (p0, p1, p2, p3, n) => d3.range(n + 1).map(i => { const t = i / n, u = 1 - t;
      return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); });
    const line = (a, b, n) => d3.range(n + 1).map(i => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
    // one tube: pts (centreline), rad(i) (radius per sample); closed loops repeat their first point
    const tube = (pts, rad, closed) => {
      const n = pts.length, nor = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
        return [-dy / m, dx / m];
      });
      const N = 22;
      d3.range(N + 1).forEach(k => {
        const f = k / N, shrink = 1 - 0.86 * f;
        const side = (i, s) => { const r = rad(i), nl = nor[i][0] * L[0] + nor[i][1] * L[1], o = r * 0.5 * f * nl;
          return [pts[i][0] + nor[i][0] * (o + s * r * shrink), pts[i][1] + nor[i][1] * (o + s * r * shrink)]; };
        const A = d3.range(n).map(i => side(i, 1)), B = d3.range(n).map(i => side(i, -1));
        const P = a => a.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' L');
        const d = closed ? 'M' + P(A) + ' Z M' + P(B.reverse()) + ' Z' : 'M' + P(A) + ' L' + P(B.reverse()) + ' Z';
        H.append('path').attr('d', d).attr('fill', col(f)).attr('fill-rule', 'evenodd')
          .attr('stroke', k === 0 ? '#1b2128' : 'none').attr('stroke-width', k === 0 ? 1.2 : 0).attr('stroke-linejoin', 'round');
      });
    };
    const R = 9;
    // barb first, so the point covers its root: a sliver leaving the inside of the point, angled back towards the bend
    const barb = line([-190, 236], [-153, 304], 40);
    tube(barb, i => 7 * Math.pow(1 - i / 40, 0.8));
    // shank, bend, point (one wire); the point tapers over its last 120 units
    const wire = [...line([0, 14], [0, 330], 60), ...bez([0, 330], [0, 450], [-190, 450], [-190, 330], 90).slice(1), ...line([-190, 330], [-190, 190], 60).slice(1)];
    const taper = y => (y > 310 ? 1 : Math.pow(Math.max(0, (y - 190) / 120), 0.62));
    tube(wire, i => R * (wire[i][0] < -100 && wire[i][1] < 331 ? taper(wire[i][1]) : 1));
    // the eye: a closed ring of wire
    const eye = d3.range(97).map(i => [17 * Math.cos(i / 96 * 2 * Math.PI), 17 * Math.sin(i / 96 * 2 * Math.PI)]);
    tube(eye, () => 6.5, true);
    return H;
  }
  const fade = (sel, on, ms, instant) => sel.transition().duration(D(ms || 500, instant)).attr('opacity', on ? 1 : 0);
  /* Arrowhead markers for one svg; returns id => url(...) for 'arr' (grey), 'ok', 'neu' or 'sys'. */
  function arrows(s, size) {
    const defs = s.append('defs');
    [['arr', COL.mute], ['ok', COL.ok], ['neu', COL.neu], ['sys', COL.sys]].forEach(([id, c]) => {
      defs.append('marker').attr('id', id + '-' + s.attr('id')).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', size || 8).attr('markerHeight', size || 8).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0,0L10,5L0,10z').attr('fill', c);
    });
    return id => 'url(#' + id + '-' + s.attr('id') + ')';
  }

  /* ---------- shared ---------- */
  /* Console text streams in one character at a time, very fast, with a short pause at each line end
     (the pause keeps the old pacing where it matters, e.g. one agent step per line). */
  window.streamLines = function (pre, lines, o) {
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const cps = o.cps || 320, pause = (o.pause || 0) / 1000, delay = (o.delay || 0) / 1000;
    let end = delay;
    const sched = lines.map(([c, t]) => { const r = { c, t, at: end }; end += t.length / cps + pause; return r; });
    let last = -1;
    const timer = d3.timer(e => {
      const now = e / 1000;
      let shown = 0;
      const html = sched.filter(r => now >= r.at).map(r => {
        const k = Math.min(r.t.length, Math.floor((now - r.at) * cps)); shown += k + 1;
        return '<span class="' + r.c + '">' + esc(r.t.slice(0, k)) + '</span>';
      }).join('\n');
      if (shown !== last) { pre.innerHTML = html; last = shown; }
      if (now > end + 0.1) timer.stop();
    });
    return timer;
  };

  /* Fill a console <pre> with [class, text] lines: streamed in when animated, all at once when instant.
     pause is the hold at each line end and delay the wait before the first character, both in ms.
     A console already showing (or still streaming) these lines is left alone, so a later build on the
     same slide doesn't retype it; only its caret stays. */
  const plain = lines => lines.map(l => l[1]).join('\n');
  const typed = (pre, lines) => pre._lines === lines && pre.textContent === plain(lines);
  const typing = (pre, lines, key) => pre._lines === lines && (timers[key] || []).includes(pre._timer);
  function typeLines(pre, lines, on, instant, key, pause, delay) {
    if (!pre) return;
    if (on && (typed(pre, lines) || (!instant && typing(pre, lines, key)))) return;
    stop(key);
    pre.innerHTML = ''; pre._lines = null;
    if (!on) return;
    pre._lines = lines;
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (instant || reduce) { pre.innerHTML = lines.map(([c, t]) => '<span class="' + c + '">' + esc(t) + '</span>').join('\n'); return; }
    pre._timer = window.streamLines(pre, lines, { delay: delay == null ? 250 : delay, pause: pause || 0 });
    (timers[key] = timers[key] || []).push(pre._timer);
  }

  function countUp(el, v, instant, suffix) {
    if (!el) return;
    if (instant || reduce) { el.textContent = fmt(v) + (suffix || ''); return; }
    d3.select(el).transition().duration(1200).ease(d3.easeCubicOut)
      .tween('text', () => { const i = d3.interpolateNumber(0, v); return t => { el.textContent = fmt(Math.round(i(t))) + (suffix || ''); }; });
  }
  function person(g, x, y, c, scale) {
    const p = g.append('g').attr('transform', `translate(${x},${y}) scale(${scale || 1})`);
    p.append('circle').attr('cy', -34).attr('r', 11).attr('fill', c);
    p.append('rect').attr('x', -10).attr('y', -22).attr('width', 20).attr('height', 26).attr('rx', 7).attr('fill', c);
    return p;
  }

  /* Optional recorded clip (.clip with data-clip): plays from build stepAt if the file sits next to the deck. */
  function setupClip(slide, n, instant, stepAt) {
    const box = slide.querySelector('.clip');
    if (!box) return;
    if (!box.dataset.probed) {
      box.dataset.probed = '1';
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = box.dataset.clip;
      v.addEventListener('loadeddata', () => { box.classList.add('has-video'); box.innerHTML = ''; box.appendChild(v); });
      v.addEventListener('error', () => { });
    }
    const v = box.querySelector('video');
    if (v) { if (n >= stepAt && !instant) { try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } } else if (n < stepAt) v.pause(); }
  }

  /* ---------- looping, muted clips (.clip.loop): play while their build is on screen ---------- */
  function loopClips(slide, on) {
    slide.querySelectorAll('.clip.loop').forEach(box => {
      if (!box.dataset.probed) {
        box.dataset.probed = '1';
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = box.dataset.clip;
        v.addEventListener('loadeddata', () => { box.classList.add('has-video'); box.innerHTML = ''; box.appendChild(v); loopClips(slide, slide.classList.contains('active')); });
      }
      const v = box.querySelector('video');
      if (!v) return;
      const b = box.closest('[data-step]');
      if (on && (!b || b.classList.contains('on'))) { const p = v.play(); if (p && p.catch) p.catch(() => { }); }
      else v.pause();
    });
  }

  /* ---------- shared: the prompt stack ---------- */
  const LAYERS = [
    { k: 'sys', h: 150, t: 'Base instructions + the list of tools', scope: 'cached globally' },
    { k: 'proj', h: 70, t: 'Your project notes (CLAUDE.md) + memory', scope: 'cached per project' },
    { k: 'sess', h: 56, t: 'Session settings: folder, connected apps', scope: 'cached per session' },
    { k: 'conv', h: 150, t: 'Conversation messages', scope: 'grows every turn' },
    { k: 'neu', h: 44, t: 'System reminders on the newest message', scope: 'appended, never edited in' }
  ];

  const C = {};


  /* ======== recycled from the student deck: eras, loop ======== */
  /* ---------- s-eras · Era vignettes ---------- */
  const vig = {
    1(s, on, instant) {
      s.selectAll('*').remove(); if (!on) return;
      const b = s.append('g');
      b.append('rect').attr('x', 6).attr('y', 18).attr('width', 150).attr('height', 64).attr('rx', 16).attr('fill', '#0a3a6b');
      [32, 50, 66].forEach((y, i) => b.append('rect').attr('x', 22).attr('y', y).attr('height', 7).attr('rx', 3).attr('width', [110, 90, 60][i]).attr('fill', COL.ink).attr('opacity', .7));
      const doc = s.append('g');
      doc.append('rect').attr('x', 210).attr('y', 30).attr('width', 110).attr('height', 130).attr('rx', 8).attr('fill', COL.surf2).attr('stroke', COL.line);
      const chip = s.append('rect').attr('x', 22).attr('y', 32).attr('width', 110).attr('height', 7).attr('rx', 3).attr('fill', COL.neu);
      text(s, 70, 120, 'Ctrl+C, Ctrl+V', 'lbl', 'middle').style('font-size', '17px');
      const loop = () => chip.attr('x', 22).attr('y', 32).attr('opacity', 1).transition().delay(500).duration(900).ease(d3.easeCubicInOut).attr('x', 222).attr('y', 60)
        .transition().duration(500).attr('opacity', 0).on('end', () => later('era', loop, 500));
      if (!instant && !reduce) loop(); else chip.attr('x', 222).attr('y', 60);
    },
    2(s, on, instant) {
      s.selectAll('*').remove(); if (!on) return;
      s.append('rect').attr('x', 4).attr('y', 6).attr('width', 330).attr('height', 156).attr('rx', 10).attr('fill', '#0b0b0d').attr('stroke', COL.line);
      const lines = ['> fix the failing test', 'Read  test_queue.py', 'Edit  queue.py', 'Bash  pytest  ✓ 12 passed'];
      const tg = s.append('g');
      // typed one character at a time, line by line, then held and replayed
      const els = lines.map((l, i) => text(tg, 20, 36 + i * 32, '', '').style('font', '500 18px var(--f-mono)').style('fill', i === 0 || i === 3 ? COL.ok : COL.ink));
      const caret = tg.append('rect').attr('class', 'svg-caret').attr('width', 3).attr('height', 21).attr('fill', COL.neu);
      const CPS = 26, PAUSE = 0.35, HOLD = 1.8;
      const starts = []; let tEnd = 0.2;
      lines.forEach(l => { starts.push(tEnd); tEnd += l.length / CPS + PAUSE; });
      const show = t => {
        let li = 0;
        lines.forEach((l, i) => { const k = Math.max(0, Math.min(l.length, Math.floor((t - starts[i]) * CPS))); els[i].text(l.slice(0, k)); if (t >= starts[i]) li = i; });
        caret.attr('x', 20 + els[li].node().getComputedTextLength() + 4).attr('y', 36 + li * 32 - 16);
      };
      if (instant || reduce) { show(tEnd); return; }
      const tm = d3.timer(e => show((e / 1000) % (tEnd + HOLD)));
      (timers.era = timers.era || []).push(tm);
    },
    3(s, on, instant) {
      s.selectAll('*').remove(); if (!on) return;
      [0, 1, 2].forEach(i => {
        const g = s.append('g').attr('transform', `translate(${8 + i * 110},${14 + i * 10})`);
        g.append('rect').attr('width', 100).attr('height', 120).attr('rx', 8).attr('fill', '#0b0b0d').attr('stroke', COL.line);
        [24, 40, 56].forEach((y, j) => g.append('rect').attr('x', 10).attr('y', y).attr('height', 6).attr('rx', 3).attr('width', [70, 50, 62][j]).attr('fill', COL.dim));
        const ap = g.append('g').attr('class', 'ap');
        ap.append('rect').attr('x', 8).attr('y', 78).attr('width', 84).attr('height', 30).attr('rx', 6).attr('fill', COL.neu);
        text(ap, 50, 99, 'approve?', '', 'middle').style('font', '700 15px var(--f-mono)').style('fill', '#000');
      });
      if (instant || reduce) return;
      const blink = () => { s.selectAll('.ap').transition().duration(350).attr('opacity', 0.25).transition().duration(350).attr('opacity', 1).on('end', (d, i) => { if (i === 0) later('era', blink, 200); }); };
      blink();
    },
    4(s, on, instant) {
      s.selectAll('*').remove(); if (!on) return;
      s.append('circle').attr('cx', 290).attr('cy', 36).attr('r', 22).attr('fill', '#e8e2c8');
      s.append('circle').attr('cx', 300).attr('cy', 28).attr('r', 20).attr('fill', COL.surf);
      text(s, 20, 40, 'you: asleep', 'lbl').style('font-size', '17px');
      const gear = s.append('g').attr('transform', 'translate(90,110)');
      d3.range(8).forEach(i => gear.append('rect').attr('x', -6).attr('y', -40).attr('width', 12).attr('height', 16).attr('rx', 2).attr('fill', COL.sys).attr('transform', `rotate(${i * 45})`));
      gear.append('circle').attr('r', 28).attr('fill', COL.sys); gear.append('circle').attr('r', 10).attr('fill', COL.surf);
      const done = text(s, 160, 118, '✓ PR ready', '').style('font', '700 22px var(--f-mono)').style('fill', COL.ok);
      if (instant || reduce) return;
      done.attr('opacity', 0);
      let a = 0; const spin = d3.interval(() => { a = (a + 4) % 360; gear.attr('transform', `translate(90,110) rotate(${a})`); }, 40);
      (timers.era = timers.era || []).push(spin);
      const pulse = () => done.attr('opacity', 0).transition().delay(1200).duration(400).attr('opacity', 1).transition().delay(1400).duration(300).attr('opacity', 0).on('end', () => later('era', pulse, 200));
      pulse();
    }
  };
  C['s-eras'] = {
    steps: 5,
    enter(slide, instant) {
      stop('era'); [1, 2, 3, 4].forEach(i => d3.select('#era' + i + '-svg').selectAll('*').remove()); this.on = {};
      // my own sessions, split by who started them: a script (headless claude -p) or me typing in a chat
      const s = clear('eras-svg');
      const ses = S.sessions || { scripted: 0, interactive: 0 };
      text(s, 0, 24, 'MY CLAUDE CODE SESSIONS, LAST NINE WEEKS', 'lbl');
      const block = (x, n, c, label, cols) => {
        const g = s.append('g').attr('transform', `translate(${x},0)`);
        text(g, 0, 112, String(n), '').style('font', '800 88px var(--f-display)').style('fill', c);
        text(g, 0, 150, label, '').style('font', '500 30px var(--f-body)').style('fill', COL.mute);
        const dots = g.append('g').selectAll('circle').data(d3.range(n)).enter().append('circle')
          .attr('cx', i => 5 + (i % cols) * 13).attr('cy', i => 180 + Math.floor(i / cols) * 13).attr('r', 4.5).attr('fill', c).attr('opacity', 0);
        return dots;
      };
      this.d1 = block(0, ses.scripted, COL.ok, 'started by my scripts, no chat', 55);
      this.d2 = block(800, ses.interactive, COL.sys, 'started by me, typing', 24);
      const share = Math.round(10 * ses.scripted / Math.max(1, ses.scripted + ses.interactive));
      this.claim = s.append('g').attr('opacity', 0);
      text(this.claim, 1680, 112, share + ' in 10', '', 'end').style('font', '800 88px var(--f-display)').style('fill', COL.ok);
      text(this.claim, 1680, 150, 'now start without me', '', 'end').style('font', '600 32px var(--f-body)');
    },
    step(slide, n, instant) {
      [1, 2, 3, 4].forEach(i => { const on = n >= i; if (on !== !!this.on[i]) { this.on[i] = on; vig[i](d3.select('#era' + i + '-svg'), on, instant); } });
      const on = n >= 5;
      if (on !== this.dotsOn) {
        this.dotsOn = on;
        [this.d1, this.d2].forEach((d, j) => d.interrupt().transition().delay((x, i) => D(on ? j * 400 + i * 4 : 0, instant)).duration(D(200, instant)).attr('opacity', on ? 1 : 0));
        this.claim.interrupt().transition().delay(D(on ? 1700 : 0, instant)).duration(D(500, instant)).attr('opacity', on ? 1 : 0);
      }
    },
    leave() { stop('era'); }
  };

  /* ---------- s-firstmate · Nautical crew (Kun Chen's first mate) ----------
     A night sea that never stops moving. Every boat rides the swell of its own depth row and rolls with its slope.
     The flagship borrows a pirate captain's palette (crimson sails, gold trim, black jolly roger). */
  const SEA = { horizon: 300, bottom: 600, rows: { back: 340, mid: 405, flag: 452, front: 500 } };
  const GOLD = '#e9b44c', CRIMSON = '#c8102e', WOOD = '#2a1712', WOOD_EDGE = '#6b3d24';
  function swell(x, t, wl) {
    const a = 2.5 + (wl - SEA.horizon) / 30;
    const p1 = x / 95 - t * 1.05 + wl * 0.7, p2 = x / 41 + t * 1.6 + wl * 0.3;
    return { y: wl + a * (0.65 * Math.sin(p1) + 0.35 * Math.sin(p2)), slope: a * (0.65 * Math.cos(p1) / 95 + 0.35 * Math.cos(p2) / 41) };
  }
  function figure(g, x, y, coat, hat) {
    const p = g.append('g').attr('transform', `translate(${x},${y})`);
    p.append('rect').attr('x', -9).attr('y', -30).attr('width', 18).attr('height', 30).attr('rx', 6).attr('fill', coat);
    p.append('circle').attr('cy', -40).attr('r', 9).attr('fill', '#f2c9a0');
    if (hat === 'tricorn') {
      p.append('path').attr('d', 'M-18,-45 Q-9,-49 0,-61 Q9,-49 18,-45 Q0,-40 -18,-45 Z').attr('fill', '#141414').attr('stroke', GOLD).attr('stroke-width', 1.6);
      [-5, 5].forEach(dx => p.append('circle').attr('cx', dx).attr('cy', -20).attr('r', 1.8).attr('fill', GOLD));
    }
    if (hat === 'bandana') p.append('path').attr('d', 'M-9.5,-42 Q0,-55 9.5,-42 L13,-38 Z').attr('fill', COL.ink);
    return p;
  }
  /* Anime-style crew, a Hololive Gen 3 gag: Houshou Marine is the captain, and her genmates crew the fleet
     wearing her pirate hat (Pekora as first mate, Flare and Noel on crew boats, a nousagi on the third). */
  const CHIBI = {
    marine: { hair: '#b3243b', hairD: '#7e1428', skin: '#ffe3d3', eyes: ['#e0304a', '#f2c230'], coat: CRIMSON, collar: '#fff', tails: true },
    pekora: { hair: '#eef3fb', hairD: '#b9cbe6', skin: '#ffe6d8', eyes: ['#d6324a', '#d6324a'], coat: '#3c6fd1', collar: '#fff', bunny: true, braids: true },
    flare: { hair: '#f2b33d', hairD: '#c9821e', skin: '#d9a273', eyes: ['#e0602a', '#e0602a'], coat: '#2b2b2b', collar: '#d33', elf: true, long: true },
    noel: { hair: '#dfe3ea', hairD: '#a9b0bd', skin: '#ffe6d8', eyes: ['#3f9a5a', '#3f9a5a'], coat: '#9aa6b8', collar: '#2c3e66', armor: true }
  };
  function pirateHat(p) {
    p.append('path').attr('d', 'M-25,-55 Q-14,-62 0,-61 Q14,-62 25,-55 Q14,-57 0,-56 Q-14,-57 -25,-55 Z').attr('fill', '#141414').attr('stroke', GOLD).attr('stroke-width', 1.4);
    p.append('path').attr('d', 'M-15,-58 Q-14,-78 0,-80 Q14,-78 15,-58 Z').attr('fill', '#141414').attr('stroke', GOLD).attr('stroke-width', 1.4);
    p.append('path').attr('d', 'M0,-75 L0,-63 M-5,-72 L5,-72 M-5,-66 Q0,-61 5,-66').attr('fill', 'none').attr('stroke', GOLD).attr('stroke-width', 1.6).attr('stroke-linecap', 'round');
    p.append('path').attr('d', 'M12,-76 Q22,-90 30,-84 Q22,-82 15,-72 Z').attr('fill', '#f4f0e8');
  }
  function chibi(g, x, y, who, sc) {
    const o = CHIBI[who];
    const p = g.append('g').attr('transform', `translate(${x},${y}) scale(${sc || 1})`);
    // behind the head: twin tails, long hair, braids, rabbit ears
    if (o.tails) {
      p.append('path').attr('d', 'M-19,-52 C-34,-46 -36,-20 -28,-4 C-24,-16 -22,-34 -14,-44 Z').attr('fill', o.hairD);
      p.append('path').attr('d', 'M19,-52 C34,-46 36,-20 28,-4 C24,-16 22,-34 14,-44 Z').attr('fill', o.hairD);
    }
    if (o.long) p.append('path').attr('d', 'M-19,-48 C-24,-30 -22,-12 -16,-4 L16,-4 C22,-12 24,-30 19,-48 Z').attr('fill', o.hairD);
    if (o.braids) [-1, 1].forEach(d => p.append('path').attr('d', `M${d * 15},-40 C${d * 22},-28 ${d * 20},-12 ${d * 17},-2`).attr('fill', 'none').attr('stroke', o.hairD).attr('stroke-width', 6).attr('stroke-linecap', 'round').attr('stroke-dasharray', '5 2'));
    if (o.bunny) [-1, 1].forEach(d => {
      p.append('path').attr('d', `M${d * 6},-70 C${d * 4},-96 ${d * 14},-112 ${d * 18},-104 C${d * 22},-94 ${d * 16},-80 ${d * 12},-66 Z`).attr('fill', o.hair).attr('stroke', o.hairD).attr('stroke-width', 1.2);
      p.append('path').attr('d', `M${d * 9},-74 C${d * 9},-92 ${d * 14},-102 ${d * 16},-98 C${d * 17},-90 ${d * 14},-82 ${d * 12},-72 Z`).attr('fill', '#ffc4cf');
    });
    // body
    p.append('path').attr('d', 'M-14,0 L-11,-24 Q0,-30 11,-24 L14,0 Z').attr('fill', o.coat);
    if (o.armor) p.append('path').attr('d', 'M-11,-22 Q0,-27 11,-22 L10,-9 Q0,-4 -10,-9 Z').attr('fill', '#cfd6e2').attr('stroke', '#7c8799').attr('stroke-width', 1);
    p.append('path').attr('d', 'M-7,-25 L0,-15 L7,-25 Z').attr('fill', o.collar);
    // head
    p.append('ellipse').attr('cx', 0).attr('cy', -44).attr('rx', 18).attr('ry', 17).attr('fill', o.hair);
    if (o.elf) [-1, 1].forEach(d => p.append('path').attr('d', `M${d * 13},-42 L${d * 28},-50 L${d * 14},-35 Z`).attr('fill', o.skin));
    p.append('ellipse').attr('cx', 0).attr('cy', -40).attr('rx', 15).attr('ry', 14).attr('fill', o.skin);
    p.append('path').attr('d', 'M-16,-46 Q-12,-60 0,-58 Q12,-60 16,-46 Q10,-50 6,-46 Q3,-52 0,-47 Q-4,-52 -7,-46 Q-11,-51 -16,-46 Z').attr('fill', o.hair);
    [[-6, o.eyes[0]], [6, o.eyes[1]]].forEach(([ex, c]) => {
      p.append('ellipse').attr('cx', ex).attr('cy', -39).attr('rx', 4).attr('ry', 5.2).attr('fill', '#2a0d14');
      p.append('ellipse').attr('cx', ex).attr('cy', -38.2).attr('rx', 3.1).attr('ry', 4).attr('fill', c);
      p.append('circle').attr('cx', ex - 1.3).attr('cy', -40.5).attr('r', 1.4).attr('fill', '#fff');
    });
    [-10, 10].forEach(cx => p.append('ellipse').attr('cx', cx).attr('cy', -33).attr('rx', 3).attr('ry', 1.6).attr('fill', '#ff8fa3').attr('opacity', .7));
    p.append('path').attr('d', 'M-2.5,-31.5 Q0,-29 2.5,-31.5').attr('fill', 'none').attr('stroke', '#7e1428').attr('stroke-width', 1.2).attr('stroke-linecap', 'round');
    if (o.bunny) p.append('path').attr('d', 'M-17,-50 L-22,-38 L-14,-47 Z').attr('fill', '#ff8a1f');  // carrot hair clip
    pirateHat(p);
    return p;
  }
  // a nousagi (Pekora's fan mascot), also in the captain's hat
  function nousagi(g, x, y, sc) {
    const p = g.append('g').attr('transform', `translate(${x},${y}) scale(${sc || 1})`);
    [-1, 1].forEach(d => p.append('path').attr('d', `M${d * 6},-26 C${d * 4},-46 ${d * 12},-56 ${d * 15},-50 C${d * 18},-42 ${d * 13},-32 ${d * 11},-24 Z`).attr('fill', '#fff').attr('stroke', '#c9d3e3').attr('stroke-width', 1.2));
    p.append('ellipse').attr('cx', 0).attr('cy', -14).attr('rx', 16).attr('ry', 14).attr('fill', '#fff').attr('stroke', '#c9d3e3').attr('stroke-width', 1.2);
    [-5, 5].forEach(ex => p.append('circle').attr('cx', ex).attr('cy', -16).attr('r', 2.2).attr('fill', '#2b2b2b'));
    p.append('path').attr('d', 'M-2.4,-11 Q0,-8.5 2.4,-11').attr('fill', 'none').attr('stroke', '#5a4636').attr('stroke-width', 1.1);
    [-10, 10].forEach(cx => p.append('ellipse').attr('cx', cx).attr('cy', -11).attr('rx', 2.6).attr('ry', 1.5).attr('fill', '#ff9fb0').attr('opacity', .8));
    const h = p.append('g').attr('transform', 'translate(0,16) scale(0.72)'); pirateHat(h);
    return p;
  }
  function mascot(g, x, y, accent, hat, sc) {
    const p = g.append('g').attr('transform', `translate(${x},${y}) scale(${sc || 1})`);
    p.append('ellipse').attr('cx', 0).attr('cy', -15).attr('rx', 17).attr('ry', 15).attr('fill', '#fff4e6').attr('stroke', '#e8cfb0').attr('stroke-width', 1.2);
    p.append('ellipse').attr('cx', -6).attr('cy', -1).attr('rx', 4).attr('ry', 2.4).attr('fill', '#f1dcc2');
    p.append('ellipse').attr('cx', 6).attr('cy', -1).attr('rx', 4).attr('ry', 2.4).attr('fill', '#f1dcc2');
    [-5.5, 5.5].forEach(ex => { p.append('ellipse').attr('cx', ex).attr('cy', -17).attr('rx', 2.3).attr('ry', 3).attr('fill', '#2b2b2b'); p.append('circle').attr('cx', ex - 0.8).attr('cy', -18.2).attr('r', 0.9).attr('fill', '#fff'); });
    [-10, 10].forEach(cx => p.append('ellipse').attr('cx', cx).attr('cy', -12).attr('rx', 2.6).attr('ry', 1.5).attr('fill', '#ff9fb0').attr('opacity', .8));
    p.append('path').attr('d', 'M-2.4,-12.5 Q0,-10 2.4,-12.5').attr('fill', 'none').attr('stroke', '#5a4636').attr('stroke-width', 1.1).attr('stroke-linecap', 'round');
    p.append('path').attr('d', 'M-14,-6 Q0,0 14,-6 L12,-2 Q0,3 -12,-2 Z').attr('fill', accent);
    if (hat === 'captain') {
      p.append('path').attr('d', 'M-20,-27 Q0,-34 20,-27 Q0,-30 -20,-27 Z').attr('fill', '#141414').attr('stroke', GOLD).attr('stroke-width', 1.2);
      p.append('path').attr('d', 'M-11,-28 Q-10,-42 0,-43 Q10,-42 11,-28 Z').attr('fill', '#141414').attr('stroke', GOLD).attr('stroke-width', 1.2);
      p.append('circle').attr('cx', 0).attr('cy', -35).attr('r', 2.4).attr('fill', GOLD);
    }
    if (hat === 'bicorne') {
      p.append('path').attr('d', 'M-16,-26 Q0,-42 16,-26 Q0,-31 -16,-26 Z').attr('fill', accent).attr('stroke', '#2a1740').attr('stroke-width', 1);
    }
    return p;
  }
  let clipN = 0;
  function sail(g, x, y1, y2, w, fill, stroke) {
    const b = 13, m = (y1 + y2) / 2;
    g.append('line').attr('x1', x - w / 2 - 6).attr('x2', x + w / 2 + 6).attr('y1', y1).attr('y2', y1).attr('stroke', '#7a5634').attr('stroke-width', 4);
    g.append('path').attr('d', `M${x - w / 2},${y1} L${x + w / 2},${y1} Q${x + w / 2 + b},${m} ${x + w / 2},${y2} L${x - w / 2},${y2} Q${x - w / 2 + b},${m} ${x - w / 2},${y1} Z`)
      .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 1.6);
  }
  function lanternAt(g, x, y) {
    g.append('circle').attr('cx', x).attr('cy', y).attr('r', 20).attr('fill', '#ffcf73').attr('opacity', .16).attr('class', 'glow');
    g.append('circle').attr('cx', x).attr('cy', y).attr('r', 5).attr('fill', '#ffd98a');
  }
  function jollyRoger(g, x, y) {
    const f = g.append('g').attr('transform', `translate(${x},${y})`);
    f.append('path').attr('class', 'flagcloth').attr('fill', '#111').attr('stroke', '#444').attr('stroke-width', 1);
    f.append('circle').attr('cx', 25).attr('cy', 13).attr('r', 6.5).attr('fill', '#f1ead8');
    f.append('path').attr('d', 'M17,22 L33,30 M33,22 L17,30').attr('stroke', '#f1ead8').attr('stroke-width', 2.6).attr('stroke-linecap', 'round');
    return f;
  }
  function galleon(g) {
    const s = g.append('g');
    const id = 'hull' + (++clipN);
    const hull = 'M-172,-82 L-104,-82 L-104,-50 L150,-50 Q172,-54 192,-70 L178,-30 Q150,10 92,16 L-128,16 Q-160,8 -172,-26 Z';
    s.append('clipPath').attr('id', id).append('path').attr('d', hull);
    // rigging behind the sails
    [[110, -250, 250, -90], [10, -300, 250, -90], [10, -300, -170, -82], [-110, -215, -172, -82]].forEach(([x1, y1, x2, y2]) =>
      s.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2).attr('stroke', '#c9b28a').attr('stroke-width', 1.2).attr('opacity', .45));
    s.append('line').attr('x1', 185).attr('y1', -64).attr('x2', 252).attr('y2', -92).attr('stroke', '#7a5634').attr('stroke-width', 5);
    [[110, -50, -250, 7], [10, -50, -340, 8], [-110, -82, -215, 6]].forEach(([x, y1, y2, w]) =>
      s.append('line').attr('x1', x).attr('x2', x).attr('y1', y1).attr('y2', y2).attr('stroke', '#7a5634').attr('stroke-width', w));
    const grad = 'crimson-' + id;
    const lg = s.append('linearGradient').attr('id', grad).attr('x1', 0).attr('x2', 1);
    lg.append('stop').attr('offset', '0%').attr('stop-color', '#9e0f24'); lg.append('stop').attr('offset', '100%').attr('stop-color', '#e0334a');
    sail(s, 10, -282, -214, 120, `url(#${grad})`, GOLD);
    sail(s, 10, -206, -112, 176, `url(#${grad})`, GOLD);
    sail(s, 110, -238, -184, 100, `url(#${grad})`, GOLD);
    sail(s, 110, -176, -100, 146, `url(#${grad})`, GOLD);
    s.append('path').attr('d', 'M114,-244 L248,-92 L124,-98 Z').attr('fill', '#efe4cc').attr('stroke', GOLD).attr('stroke-width', 1.2);
    s.append('path').attr('d', 'M-112,-208 L-112,-90 L-188,-90 Q-160,-150 -112,-208 Z').attr('fill', `url(#${grad})`).attr('stroke', GOLD).attr('stroke-width', 1.4);
    // gold anchor on the main course
    s.append('circle').attr('cx', 14).attr('cy', -192).attr('r', 5).attr('fill', 'none').attr('stroke', GOLD).attr('stroke-width', 3.5);
    s.append('path').attr('d', 'M14,-186 L14,-128 M0,-178 L28,-178 M-6,-146 Q14,-120 34,-146').attr('fill', 'none').attr('stroke', GOLD).attr('stroke-width', 4).attr('stroke-linecap', 'round');
    s.append('rect').attr('x', -8).attr('y', -248).attr('width', 36).attr('height', 12).attr('rx', 2).attr('fill', '#5a3d27').attr('stroke', GOLD).attr('stroke-width', 1);
    // hull with a crimson band, gold line, lit portholes and stern windows
    s.append('path').attr('d', hull).attr('fill', WOOD).attr('stroke', WOOD_EDGE).attr('stroke-width', 2);
    const hc = s.append('g').attr('clip-path', `url(#${id})`);
    hc.append('rect').attr('x', -180).attr('y', -47).attr('width', 380).attr('height', 11).attr('fill', CRIMSON);
    hc.append('rect').attr('x', -180).attr('y', -34).attr('width', 380).attr('height', 2.5).attr('fill', GOLD);
    d3.range(-120, 140, 40).forEach(x => s.append('circle').attr('cx', x).attr('cy', -18).attr('r', 4.5).attr('fill', '#ffd27a').attr('opacity', .9));
    [-162, -146, -130].forEach(x => s.append('rect').attr('x', x).attr('y', -74).attr('width', 10).attr('height', 13).attr('rx', 2).attr('fill', '#ffd27a').attr('opacity', .85));
    s.append('path').attr('d', 'M-172,-82 L-104,-82').attr('stroke', GOLD).attr('stroke-width', 2.5);
    lanternAt(s, -178, -94);
    chibi(s, -138, -82, 'marine', 1.55);
    chibi(s, 62, -50, 'pekora', 1.45);
    return { root: s, flag: jollyRoger(s, 13, -340), pennant: s.append('path').attr('fill', CRIMSON), top: -250, px: 110 };
  }
  function sloop(g, c, who) {
    const s = g.append('g');
    s.append('line').attr('x1', -2).attr('x2', -2).attr('y1', -14).attr('y2', -232).attr('stroke', '#7a5634').attr('stroke-width', 5);
    s.append('path').attr('d', 'M-6,-224 L-6,-28 L-62,-28 Q-44,-128 -6,-224 Z').attr('fill', c).attr('stroke', GOLD).attr('stroke-width', 1.2);
    s.append('path').attr('d', 'M3,-212 L70,-30 L6,-30 Z').attr('fill', c).attr('opacity', .72);
    s.append('path').attr('d', 'M-62,-16 L58,-16 Q66,-18 74,-28 L62,-4 Q50,10 30,12 L-48,12 Q-60,6 -62,-16 Z').attr('fill', '#3b2418').attr('stroke', '#7a4a2a').attr('stroke-width', 2);
    s.append('rect').attr('x', -60).attr('y', -11).attr('width', 122).attr('height', 2.5).attr('fill', GOLD);
    if (who === 'nousagi') nousagi(s, 24, -16, 1.5); else chibi(s, 24, -16, who, 1.25);
    lanternAt(s, -64, -26);
    return { root: s, pennant: s.append('path').attr('fill', c), top: -232 };
  }
  function brig(g, label) {
    const s = g.append('g');
    [[60, -250], [-50, -220]].forEach(([x, y]) => s.append('line').attr('x1', x).attr('x2', x).attr('y1', -40).attr('y2', y).attr('stroke', '#7a5634').attr('stroke-width', 6));
    sail(s, 60, -236, -170, 100, '#cfc6e8', COL.proj); sail(s, 60, -162, -84, 140, '#cfc6e8', COL.proj);
    sail(s, -50, -206, -150, 86, '#cfc6e8', COL.proj); sail(s, -50, -142, -76, 120, '#cfc6e8', COL.proj);
    s.append('path').attr('d', 'M-118,-58 L-70,-58 L-70,-40 L120,-40 Q138,-44 152,-56 L140,-22 Q118,8 76,12 L-92,12 Q-114,4 -118,-20 Z').attr('fill', WOOD).attr('stroke', WOOD_EDGE).attr('stroke-width', 2);
    s.append('rect').attr('x', -116).attr('y', -36).attr('width', 258).attr('height', 8).attr('fill', COL.proj).attr('opacity', .9);
    d3.range(-80, 120, 40).forEach(x => s.append('circle').attr('cx', x).attr('cy', -14).attr('r', 4).attr('fill', '#ffd27a').attr('opacity', .85));
    mascot(s, -94, -58, COL.proj, 'bicorne', 1.6);
    text(s, 60, -114, label, '', 'middle').style('font', '800 25px var(--f-mono)').style('fill', '#4b2a7a');
    lanternAt(s, -122, -66);
    return { root: s, pennant: s.append('path').attr('fill', COL.proj), top: -250, px: 60 };
  }
  function dinghy(g) {
    const s = g.append('g');
    s.append('path').attr('d', 'M-36,-6 L36,-6 L26,10 L-26,10 Z').attr('fill', '#5a3a24');
    mascot(s, 0, -6, COL.proj, null, 0.9);
    return { root: s };
  }
  function bottle(g) {
    const b = g.append('g').attr('opacity', 0);
    b.append('rect').attr('x', -15).attr('y', -7).attr('width', 26).attr('height', 13).attr('rx', 6).attr('fill', '#6fbf94').attr('opacity', .9);
    b.append('rect').attr('x', 10).attr('y', -3.5).attr('width', 8).attr('height', 7).attr('fill', '#6fbf94').attr('opacity', .9);
    b.append('rect').attr('x', 17).attr('y', -3.5).attr('width', 5).attr('height', 7).attr('rx', 1).attr('fill', '#a07a4a');
    b.append('rect').attr('x', -10).attr('y', -3.5).attr('width', 15).attr('height', 7).attr('rx', 2).attr('fill', '#f1e6cf');
    return b;
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  C['s-firstmate'] = {
    steps: 5,
    enter(slide, instant) {
      stop('sea');
      const s = clear('crew-svg');
      const A = arrows(s);
      const R = SEA.rows;
      const now = () => d3.now() / 1000;
      // sky: stars and a crescent moon
      const rng = d3.randomLcg(13);
      const keepOut = [[0, 0, 560, 50], [630, 50, 890, 106], [750, 106, 1470, 142], [1540, 0, 1680, 130]];
      this.stars = d3.range(90).map(() => ({ x: rng() * 1680, y: rng() * 270, r: 0.7 + rng() * 1.3, ph: rng() * 6.28, sp: 0.4 + rng() * 1.2 }))
        .filter(d => !keepOut.some(([x0, y0, x1, y1]) => d.x > x0 && d.x < x1 && d.y > y0 && d.y < y1));
      const sky = s.append('g');
      this.starEls = sky.selectAll('circle').data(this.stars).enter().append('circle').attr('cx', d => d.x).attr('cy', d => d.y).attr('r', d => d.r).attr('fill', COL.ink);
      const mg = sky.append('radialGradient').attr('id', 'moonglow');
      mg.append('stop').attr('offset', '0%').attr('stop-color', '#f1ead2').attr('stop-opacity', .16);
      mg.append('stop').attr('offset', '100%').attr('stop-color', '#f1ead2').attr('stop-opacity', 0);
      sky.append('circle').attr('cx', 1606).attr('cy', 62).attr('r', 80).attr('fill', 'url(#moonglow)');
      const mm = sky.append('mask').attr('id', 'moonmask');
      mm.append('rect').attr('x', 1560).attr('y', 20).attr('width', 100).attr('height', 90).attr('fill', '#fff');
      mm.append('circle').attr('cx', 1619).attr('cy', 53).attr('r', 23).attr('fill', '#000');
      sky.append('circle').attr('cx', 1606).attr('cy', 62).attr('r', 26).attr('fill', '#f1ead2').attr('mask', 'url(#moonmask)');
      this.skyG = sky;
      // sea body and far swells
      const sg = s.append('linearGradient').attr('id', 'seag').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
      sg.append('stop').attr('offset', '0%').attr('stop-color', '#0d2a44'); sg.append('stop').attr('offset', '100%').attr('stop-color', '#050d17');
      s.append('rect').attr('x', 0).attr('y', SEA.horizon).attr('width', 1680).attr('height', SEA.bottom - SEA.horizon).attr('fill', 'url(#seag)');
      s.append('line').attr('x1', 0).attr('x2', 1680).attr('y1', SEA.horizon).attr('y2', SEA.horizon).attr('stroke', '#2c5d84').attr('stroke-width', 1.5).attr('opacity', .7);
      this.far = [312, 324].map(wl => ({ wl, el: s.append('path').attr('fill', 'none').attr('stroke', '#1f4a6b').attr('stroke-width', 1.5).attr('opacity', .6) }));
      // one layer per depth row: boats, then the water in front of them
      const layer = {}, band = {};
      ['back', 'mid', 'flag', 'front'].forEach(k => {
        layer[k] = s.append('g');
        band[k] = { wl: R[k], fill: s.append('path').attr('fill', '#0a2238').attr('opacity', .5), crest: s.append('path').attr('fill', 'none').attr('stroke', '#3a7aa8').attr('stroke-width', 1.6).attr('opacity', .55) };
      });
      this.band = band;
      const boat = (k, x, build, scale, op) => {
        const g = layer[k].append('g').attr('opacity', op === undefined ? 0 : op);
        const b = build(g.append('g').attr('transform', `scale(${scale})`));
        return Object.assign(b, { g, x, wl: R[k], scale, tx: x, twl: R[k], fx: x, fwl: R[k], t0: 0, dur: 0 });
      };
      this.flagship = boat('flag', 520, galleon, 1);
      this.crew = [['back', 960, COL.proj, 0.7, 'Opus · planning', 'flare'], ['mid', 1120, COL.neu, 0.8, 'Fable · UI', 'noel'], ['front', 1280, COL.ok, 0.95, 'Sonnet · bug fix', 'nousagi']].map(([k, x, c, sc, t, who], i) => {
        const b = boat('flag', 600, g => sloop(g, c, who), sc);
        Object.assign(b, { home: 600, homeWl: R.flag, dest: x, destWl: R[k], row: k, label: t, c, i });
        return b;
      });
      this.layer = layer;
      this.mates = [boat('mid', 1426, g => brig(g, 'SLIDES'), 0.6), boat('mid', 1588, g => brig(g, 'PAPER'), 0.6), boat('back', 1376, dinghy, 0.42), boat('back', 1508, dinghy, 0.42), boat('back', 1650, dinghy, 0.42)];
      this.all = [this.flagship].concat(this.crew, this.mates);
      // bottles drift from each crewmate back to the flagship's bow
      this.bottleG = s.append('g').attr('opacity', 0);
      layer.front.node().parentNode.insertBefore(this.bottleG.node(), layer.front.node());
      this.bottles = this.crew.map(c => ({ c, el: bottle(this.bottleG) }));
      // shore, lighthouse and relays (left)
      // the beam sits behind the ships; the land, lighthouse and relays sit in front of the sea
      this.beamG = s.insert('g', () => this.skyG.node().nextSibling).attr('opacity', 0);
      this.shore = s.append('g').attr('opacity', 0);
      const lh = this.shore;
      lh.append('path').attr('d', 'M0,236 Q70,220 138,250 Q176,290 192,600 L0,600 Z').attr('fill', '#1c1a16').attr('stroke', '#3a362c').attr('stroke-width', 2);
      const bg = lh.append('linearGradient').attr('id', 'beamg').attr('gradientUnits', 'userSpaceOnUse').attr('x1', 72).attr('y1', 151).attr('x2', 620).attr('y2', 300);
      bg.append('stop').attr('offset', '0%').attr('stop-color', '#ffe2a0').attr('stop-opacity', .45);
      bg.append('stop').attr('offset', '100%').attr('stop-color', '#ffe2a0').attr('stop-opacity', 0);
      this.beam = this.beamG.append('path').attr('fill', 'url(#beamg)');
      lh.append('path').attr('d', 'M52,244 L60,160 L84,160 L92,244 Z').attr('fill', '#e8e2d2');
      [182, 214].forEach(y => lh.append('rect').attr('x', 50).attr('y', y).attr('width', 44).attr('height', 12).attr('fill', CRIMSON));
      lh.append('rect').attr('x', 58).attr('y', 142).attr('width', 28).attr('height', 18).attr('fill', '#ffd98a');
      lh.append('path').attr('d', 'M54,142 L72,124 L90,142 Z').attr('fill', CRIMSON);
      ['Slack', 'Discord', 'email', 'schedule'].forEach((t, i) => {
        const y = 290 + i * 58;
        const g = lh.append('g').attr('transform', `translate(14,${y})`);
        g.append('rect').attr('width', 124).attr('height', 40).attr('rx', 8).attr('fill', COL.surf2).attr('stroke', COL.sess);
        text(g, 62, 27, t, '', 'middle').style('font', '600 18px var(--f-mono)');
        lh.append('path').attr('d', `M138,${y + 20} C220,${y + 20} 250,392 334,388`).attr('fill', 'none').attr('stroke', COL.sess).attr('stroke-width', 2).attr('stroke-dasharray', '6 6').attr('marker-end', A('sys'));
      });
      text(lh, 18, 34, 'messages relayed, even while you sleep', 'lbl').style('fill', COL.sess);
      // captions (fixed, in clear water or sky)
      this.capFlag = s.append('g').attr('opacity', 0);
      text(this.capFlag, 470, 546, 'you, the captain  ·  the first mate', '', 'middle').style('font', '600 21px var(--f-mono)');
      text(this.capFlag, 470, 574, 'holds your intent, always free to talk', 'lbl', 'middle').style('fill', COL.sys).style('font-size', '20px');
      this.capCrew = s.append('g').attr('opacity', 0);
      this.capCrew.append('rect').attr('x', 640).attr('y', 58).attr('width', 236).attr('height', 40).attr('rx', 8).attr('fill', COL.surf2).attr('stroke', COL.line);
      text(this.capCrew, 758, 85, 'crew-dispatch.json', '', 'middle').style('font', '600 18px var(--f-mono)');
      text(this.capCrew, 1110, 130, 'each crewmate: its own boat, its own chart (clean context)', 'lbl', 'middle').style('font-size', '20px');
      this.crew.forEach(b => {
        const g = this.capCrew.append('g').attr('class', 'crewlbl');
        text(g, b.dest, b.destWl + 40, b.label, '', 'middle').style('font', '700 19px var(--f-mono)').style('fill', b.c);
      });
      this.capBottle = text(s, 940, 546, 'short reports, not the whole voyage', 'lbl', 'middle').style('fill', COL.ok).style('font-size', '20px').attr('opacity', 0);
      this.capMates = s.append('g').attr('opacity', 0);
      const cnt = this.capMates.append('g').attr('transform', 'translate(1130,150)');
      cnt.append('rect').attr('width', 500).attr('height', 146).attr('rx', 14).attr('fill', 'rgba(18,18,20,.94)').attr('stroke', COL.proj).attr('stroke-width', 2);
      text(cnt, 24, 38, 'A CREWMATE, PROMOTED TO CAPTAIN', '').style('font', '700 18px var(--f-mono)').style('letter-spacing', '.06em').style('fill', COL.proj);
      text(cnt, 24, 82, '9 messages between them', '').style('font', '700 30px var(--f-display)');
      text(cnt, 24, 122, '5 from me · 2 hours, 18 Nov', '').style('font', '500 26px var(--f-mono)').style('fill', COL.mute);
      // two-way messages between the promoted captain and the flagship
      this.chatG = s.append('g').attr('opacity', 0);
      layer.front.node().parentNode.insertBefore(this.chatG.node(), layer.front.node());
      this.chat = d3.range(4).map(i => ({ el: bottle(this.chatG), back: i % 2 === 1, i }));
      // dock inspection (bottom)
      this.dock = s.append('g').attr('opacity', 0);
      this.dock.append('rect').attr('x', 200).attr('y', 596).attr('width', 1480).attr('height', 64).attr('fill', '#3a2a1c');
      d3.range(200, 1680, 46).forEach(x => this.dock.append('line').attr('x1', x).attr('x2', x).attr('y1', 596).attr('y2', 660).attr('stroke', '#2a1d12').attr('stroke-width', 2));
      [[226, COL.ok, 'toy project → merge straight away'], [870, COL.neu, 'would you ask a colleague to review? → hostile review first']].forEach(([x, c, t]) => {
        this.dock.append('rect').attr('x', x).attr('y', 608).attr('width', 18).attr('height', 40).attr('rx', 4).attr('fill', c);
        text(this.dock, x + 32, 636, t, '').style('font', '600 22px var(--f-body)');
      });
      // the sea's clock
      this.t0 = now();
      const frame = () => this.frame(now() - this.t0);
      this.frame(0);
      if (!reduce) { const tm = d3.timer(frame); (timers.sea = timers.sea || []).push(tm); }
    },
    frame(t) {
      const wave = (wl, dy) => {
        let d = '';
        for (let x = -20; x <= 1700; x += 24) d += (d ? 'L' : 'M') + x + ',' + (swell(x, t, wl).y + dy).toFixed(1);
        return d;
      };
      this.starEls.attr('opacity', d => 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * d.sp + d.ph)));
      this.far.forEach(f => f.el.attr('d', wave(f.wl, 0)));
      Object.values(this.band).forEach(b => { const top = wave(b.wl, 6); b.crest.attr('d', top); b.fill.attr('d', top + `L1700,${SEA.bottom}L-20,${SEA.bottom}Z`); });
      const ms = d3.now();
      this.all.forEach(b => {
        const k = b.dur ? Math.max(0, Math.min(1, (ms - b.t0) / b.dur)) : 1;
        if (k === 1 && b.arrive) { this.layer[b.arrive].node().appendChild(b.g.node()); b.arrive = null; }
        const e = d3.easeCubicInOut(k);
        b.x = lerp(b.fx, b.tx, e); b.wl = lerp(b.fwl, b.twl, e);
        const w = swell(b.x, t, b.wl);
        const roll = Math.atan(w.slope) * 180 / Math.PI * 0.6;
        b.g.attr('transform', `translate(${b.x.toFixed(1)},${w.y.toFixed(1)}) rotate(${roll.toFixed(2)})`);
        if (b.pennant) {
          const top = b.top, px = b.px !== undefined ? b.px : -2;
          const tip = 34 + 4 * Math.sin(t * 3 + b.x);
          b.pennant.attr('d', `M${px},${top} Q${px + tip / 2},${top + 3 + 3 * Math.sin(t * 4)} ${px + tip},${top + 5} L${px},${top + 10} Z`);
        }
        if (b.flag) {
          let d = 'M0,0';
          for (let i = 1; i <= 5; i++) d += ` L${i * 10},${(2.5 * Math.sin(t * 3.4 - i * 0.9)).toFixed(1)}`;
          for (let i = 5; i >= 0; i--) d += ` L${i * 10},${(36 + 2.5 * Math.sin(t * 3.4 - i * 0.9) * (i / 5)).toFixed(1)}`;
          b.flag.select('.flagcloth').attr('d', d + 'Z');
        }
      });
      d3.select('#crew-svg').selectAll('.glow').attr('opacity', 0.13 + 0.06 * Math.sin(t * 5.3));
      if (this.beam) {
        const th = 0.24 + 0.16 * Math.sin(t * 0.6), L = 560;
        this.beam.attr('d', `M72,151 L${(72 + L * Math.cos(th - 0.06)).toFixed(1)},${(151 + L * Math.sin(th - 0.06)).toFixed(1)} L${(72 + L * Math.cos(th + 0.06)).toFixed(1)},${(151 + L * Math.sin(th + 0.06)).toFixed(1)} Z`);
      }
      if (this.chatOn) {
        const bow = { x: 760, wl: SEA.rows.flag }, brigX = 1330, brigWl = SEA.rows.mid;
        this.chat.forEach(bt => {
          const p0 = this.bottleStill ? 0.3 + bt.i * 0.13 : ((t / 7 + bt.i / 4) % 1);
          const ph = bt.back ? 1 - p0 : p0;
          const x = lerp(brigX, bow.x, ph), wl = lerp(brigWl, bow.wl, ph);
          const w = swell(x, t, wl);
          const op = Math.min(1, p0 / 0.08, (1 - p0) / 0.08);
          bt.el.attr('opacity', op).attr('transform', `translate(${x.toFixed(1)},${(w.y + 2).toFixed(1)}) rotate(${(Math.atan(w.slope) * 57.3 + (bt.back ? 0 : 180)).toFixed(1)})`);
        });
      }
      if (this.bottlesOn) {
        const bow = { x: 724, wl: SEA.rows.flag };
        this.bottles.forEach((bt, i) => {
          const ph = this.bottleStill ? 0.45 + i * 0.12 : ((t / 9 + i / 3) % 1);
          const sx = bt.c.dest - 70;
          const x = lerp(sx, bow.x, ph), wl = lerp(bt.c.destWl, bow.wl, ph);
          const w = swell(x, t, wl);
          const op = Math.min(1, ph / 0.08, (1 - ph) / 0.08);
          bt.el.attr('opacity', op).attr('transform', `translate(${x.toFixed(1)},${(w.y + 2).toFixed(1)}) rotate(${(Math.atan(w.slope) * 57.3 + 180).toFixed(1)})`);
        });
      }
    },
    sailTo(b, x, wl, delay, instant) {
      b.fx = b.x; b.fwl = b.wl; b.tx = x; b.twl = wl;
      b.t0 = d3.now() + (instant ? 0 : delay); b.dur = instant || reduce ? 0 : 1900;
    },
    step(slide, n, instant) {
      fade(this.flagship.g, n >= 1, 600, instant); fade(this.capFlag, n >= 1, 600, instant);
      fade(this.capCrew, n >= 2, 500, instant);
      this.capCrew.selectAll('.crewlbl').interrupt().transition().delay(D(n >= 2 ? 1700 : 0, instant)).duration(D(500, instant)).attr('opacity', n >= 2 ? 1 : 0);
      this.crew.forEach(b => {
        const out = n >= 2;
        if (out !== b.out) {
          b.out = out;
          // sail in the flagship's layer; join the destination row's layer on arrival so its water covers the hull
          this.layer.flag.node().appendChild(b.g.node());
          b.arrive = out ? b.row : null;
          this.sailTo(b, out ? b.dest : b.home, out ? b.destWl : b.homeWl, b.i * 220, instant);
        }
        fade(b.g, out, 400, instant);
      });
      this.bottlesOn = n >= 3; this.bottleStill = !!(instant && document.body.dataset.bare) || reduce;
      fade(this.bottleG, n >= 3, 400, instant); fade(this.capBottle, n >= 3, 500, instant);
      // step 4: the SLIDES brig (a crewmate promoted to captain) and its own dinghies; the PAPER brig stays hidden
      this.mates.forEach((b, i) => fade(b.g, n >= 4 && i !== 1, 700, instant)); fade(this.capMates, n >= 4, 700, instant);
      this.chatOn = n >= 4; fade(this.chatG, n >= 4, 500, instant);
      fade(this.shore, n >= 5, 700, instant); fade(this.beamG, n >= 5, 700, instant);
      if (reduce) this.frame(0);
    },
    leave() { stop('sea'); }
  };

  /* ======== faculty deck: new slides ======== */

  /* ---------- sound: generated in Web Audio, never in headless renders or print ---------- */
  const AU = {};
  function actx() {
    if (document.body.dataset.bare || document.body.classList.contains('print') || reduce) return null;
    try {
      AU.ctx = AU.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (AU.ctx.state === 'suspended') AU.ctx.resume();
    } catch (e) { return null; }
    return AU.ctx;
  }
  function noiseBuf(ctx, sec) {
    const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  /* a soft paper flick for each page of the flip-book */
  function flick(vol) {
    const ctx = actx(); if (!ctx) return;
    AU.paper = AU.paper || noiseBuf(ctx, 0.12);
    const src = ctx.createBufferSource(); src.buffer = AU.paper;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + Math.random() * 1400; bp.Q.value = 0.9;
    const g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.1);
    src.connect(bp).connect(g).connect(ctx.destination); src.start(t); src.stop(t + 0.12);
  }

  /* ---------- s-open · 29 beamer pages flip past, then the recorded forest ---------- */
  const PAGES = [
    ['Bagging and Random Forests', 'title'], ['Outline', 'outline'], ['Bootstrapping'], ['Bootstrapping', 'Var(αX + (1 − α)Y)'], ['Bootstrapping', 'α = (σ<sup>2</sup><sub>Y</sub> − σ<sub>XY</sub>) / (σ<sup>2</sup><sub>X</sub> + σ<sup>2</sup><sub>Y</sub> − 2σ<sub>XY</sub>)'],
    ['Bootstrapping'], ['Bootstrapping'], ['Bootstrapping', '(1/1000) Σ α<sub>r</sub> = 0.5996'], ['Bootstrapping'], ['Bootstrapping'],
    ['Bootstrapping', 'SE<sub>B</sub> = √( Σ (α<sub>r</sub> − mean)<sup>2</sup> / (B − 1) )'], ['Bootstrapping'], ['Bootstrapping'], ['Bootstrapping'], ['Bagging'],
    ['Bagging', 'Var(average) = σ<sup>2</sup> / n'], ['Bagging', 'f<sub>bag</sub>(x) = (1/B) Σ f<sub>b</sub>(x)'], ['Bagging'], ['Bootstrapping'], ['Out-of-Bag Error Estimation'],
    ['Back to R!', 'bagging()'], ['Random Forests'], ['Random Forests'], ['Random Forests'], ['On the value of m', 'm = √p'],
    ['Random Forests'], ['Back to R!', 'randomForest(formula, data, ntree, mtry)'], ['Pros and Cons'], ['References']
  ];
  C['s-open'] = {
    steps: 3,
    enter(slide) {
      stop('open');
      const stage = slide.querySelector('#flipstage');
      if (!stage.children.length) {
        const rng = d3.randomLcg(7);
        PAGES.forEach(([title, extra], i) => {
          const p = document.createElement('div'); p.className = 'page'; p.style.zIndex = String(PAGES.length - i);
          let body = '';
          if (extra === 'title') body = '<div style="margin:auto;text-align:center"><div style="font-size:52px;color:#1f3b6e">Bagging and Random Forests</div><div style="font-size:30px;margin-top:22px;color:#555">The Analytics Edge · 2019</div></div>';
          else if (extra === 'outline') body = '<div style="font-size:34px;line-height:2;margin-top:20px">▸ Bootstrapping<br>▸ Bagging<br>▸ Random Forests</div>';
          else {
            const n = 3 + Math.floor(rng() * 4);
            for (let k = 0; k < n; k++) body += '<div class="pb-line" style="width:' + (55 + rng() * 40).toFixed(0) + '%"></div>';
            if (extra) body += '<div class="pb-f">' + extra + '</div>';
          }
          p.innerHTML = (extra === 'title' ? '' : '<div class="pb-bar">' + title + '</div>') + '<div class="pb-body">' + body + '</div>' +
            '<div class="pb-foot"><span>The Analytics Edge</span><span>' + (i + 1) + ' / 29</span></div>';
          stage.appendChild(p);
        });
      }
      this.pages = Array.from(stage.children);
      const box = slide.querySelector('#openclip');
      if (!box.dataset.probed) {
        box.dataset.probed = '1';
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = box.dataset.clip;
        box.appendChild(v);
      }
      this.video = box.querySelector('video');
      // the flip-book as a pre-rendered film (smooth at any size, paper sounds baked in); the CSS pages are the fallback
      const fb = slide.querySelector('#flipfilm');
      if (!fb.dataset.probed) {
        fb.dataset.probed = '1';
        const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.src = fb.dataset.src;
        v.addEventListener('loadeddata', () => fb.classList.add('has-video'));
        v.addEventListener('ended', () => { if (this.state === 1) fade(this.cap1, true, 700); });
        fb.appendChild(v);
      }
      this.flipv = fb.querySelector('video');
      fb.classList.remove('playing'); try { this.flipv.pause(); this.flipv.currentTime = 0; } catch (e) { }
      const s = clear('open-svg');
      this.cap1 = s.append('g').attr('opacity', 0);
      text(this.cap1, 960, 1000, 'Random forests, 2019 · 29 slides, meticulously made', '', 'middle').style('font', '600 38px var(--f-display)').style('fill', COL.mute);
      this.cap2 = s.append('g').attr('opacity', 0);
      text(this.cap2, 960, 104, 'The same lecture, 2026.', '', 'middle').style('font', '700 56px var(--f-display)');
      this.cap3 = s.append('g').attr('opacity', 0);
      text(this.cap3, 960, 400, 'THE AGE OF LLMS', '', 'middle').style('font', '600 26px var(--f-mono)').style('letter-spacing', '.3em').style('fill', COL.neu);
      text(this.cap3, 960, 520, 'Students don’t remember slides.', '', 'middle').style('font', '800 92px var(--f-display)').style('letter-spacing', '-.03em');
      text(this.cap3, 960, 632, 'They remember what they did.', '', 'middle').style('font', '800 92px var(--f-display)').style('letter-spacing', '-.03em').style('fill', COL.neu);
      text(this.cap3, 960, 760, 'Darryl Teo · Engineering Systems and Design, SUTD', '', 'middle').style('font', '500 28px var(--f-body)').style('fill', COL.mute);
      this.state = -1;
      this.paint(0, true);
    },
    paint(n, instant) {
      const stage = document.getElementById('flipstage'), box = document.getElementById('openclip');
      const last = this.pages.length - 1;
      const fb = document.getElementById('flipfilm'), fv = this.flipv;
      const film = !!(fv && fb.classList.contains('has-video') && !document.body.dataset.bare && !document.body.classList.contains('print') && !reduce);
      // step 1, film: play it and keep its last frame on screen
      if (n >= 1 && this.state < 1 && !instant && film) {
        this.usedFilm = true;
        this.pages.forEach((p, i) => { p.style.transition = 'none'; p.style.transform = i < last ? 'rotateY(-176deg)' : 'none'; p.style.visibility = 'hidden'; });
        fb.classList.add('playing');
        try { fv.currentTime = 0; fv.muted = false; const p = fv.play(); if (p && p.catch) p.catch(() => { fv.muted = true; fv.play().catch(() => { }); }); } catch (e) { }
      // step 1, fallback: flip the CSS pages
      } else if (n >= 1 && this.state < 1 && !instant) {
        this.usedFilm = false;
        let at = 900;
        this.pages.forEach((p, i) => {
          if (i === last) return;
          const dt = Math.max(75, 420 * Math.pow(0.84, i));
          later('open', () => { p.style.transition = 'transform .5s cubic-bezier(.45,.05,.55,.95)'; p.style.transform = 'rotateY(-176deg)'; flick(i < 4 ? 0.09 : 0.05); }, at);
          later('open', () => { p.style.visibility = 'hidden'; }, at + 520);
          at += dt;
        });
        later('open', () => fade(this.cap1, true, 700), at + 500);
      } else {
        this.pages.forEach((p, i) => { const f = n >= 1 && i < last; p.style.transition = 'none'; p.style.transform = f ? 'rotateY(-176deg)' : 'none'; p.style.visibility = f ? 'hidden' : ''; });
        this.cap1.attr('opacity', n === 1 ? 1 : 0);
      }
      if (n !== 1) { fb.classList.remove('playing'); if (n < 1 && fv) { fv.pause(); try { fv.currentTime = 0; } catch (e) { } } }
      stage.style.transition = instant ? 'none' : 'opacity .7s ease';
      stage.style.opacity = n === 1 && !(this.usedFilm && fb.classList.contains('playing')) ? 1 : 0;
      stage.style.visibility = n >= 2 && instant ? 'hidden' : '';
      if (n >= 2 && !instant) later('open', () => { stage.style.visibility = 'hidden'; }, 800);
      if (n >= 2) this.cap1.interrupt().attr('opacity', 0);
      box.style.transition = instant ? 'none' : '';
      box.classList.toggle('on', n >= 2);
      box.classList.toggle('dim', n >= 3);
      fade(this.cap2, n === 2, 700, instant);
      fade(this.cap3, n >= 3, 900, instant);
      const v = this.video;
      if (v) {
        if (n === 2 && this.state < 2 && !instant) { try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
        if (n < 2) { v.pause(); try { v.currentTime = 0; } catch (e) { } }
        if (n >= 2 && instant) { try { v.currentTime = 16.5; } catch (e) { } }
      }
      this.state = n;
    },
    step(slide, n, instant) { this.paint(n, instant); },
    leave() { stop('open'); if (this.video) this.video.pause(); }
  };

  /* ---------- s-kaggle · my 2019 R code ---------- */
  const RF_LINES = [
    ['p', '> randomForest(…, ntree = 2000)'],
    ['d', '# runtime: ~5 hours'],
    ['n', '# Kaggle score: 0.85']
  ];
  const LASSO_LINES = [
    ['p', '> cv.glmnet(…)   # a lasso'],
    ['n', '# Kaggle score: 0.96355 · 1st']
  ];
  C['s-kaggle'] = {
    steps: 4,
    step(slide, n, instant) {
      typeLines(document.getElementById('term-rf'), RF_LINES, n >= 2, instant, 'krf', 260, 200);
      typeLines(document.getElementById('term-lasso'), LASSO_LINES, n >= 3, instant, 'klasso', 260, 200);
    }
  };

  /* ---------- s-then-now · the 2026 panel loops the recorded forest (1 tree, 500 trees, the plinko vote) ----------
     The screenshot stays underneath as the fallback when clips/rf-forest.mp4 is missing. */
  C['s-then-now'] = {
    enter(slide) {
      const box = slide.querySelector('.shot');
      if (box && !box.dataset.probed) {
        box.dataset.probed = '1';
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = 'clips/rf-forest.mp4';
        v.setAttribute('aria-label', 'Recording of Random Forest by Hand: a split chosen by hand on tree one, then 500 trees, then a new student dropped through the forest');
        v.addEventListener('loadeddata', () => { box.appendChild(v); box.classList.add('has-video'); this.play(slide); });
      }
    },
    step(slide) { this.play(slide); },
    play(slide) {
      const v = slide.querySelector('.shot video');
      if (!v) return;
      const on = slide.classList.contains('active') && slide.querySelector('.shot').closest('[data-step]').classList.contains('on');
      if (on && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => { }); }
      else if (!on) { v.pause(); v.currentTime = 0; }
    },
    leave(slide) { const v = slide.querySelector('.shot video'); if (v) { v.pause(); v.currentTime = 0; } }
  };

  /* ---------- s-recipe · five rows, one per message type; plain builds, no animation ---------- */

  /* ---------- s-storm · a storm above, a hook below ----------
     World: sky 0..620, surface ~620, calm water below. The camera drops 560 px when the hook pulls us under. */
  const SURF = 620, DROP = 560, HOOK_SCREEN = 330;
  C['s-storm'] = {
    steps: 3,
    enter(slide, instant) {
      stop('storm'); this.stopSound();
      const s = clear('storm-svg');
      const defs = s.append('defs');
      const lg = (id, stops, x2, y2) => { const g = defs.append('linearGradient').attr('id', id).attr('x1', 0).attr('y1', 0).attr('x2', x2 || 0).attr('y2', y2 === undefined ? 1 : y2); stops.forEach(([o, c, a]) => g.append('stop').attr('offset', o).attr('stop-color', c).attr('stop-opacity', a === undefined ? 1 : a)); };
      lg('st-sky', [['0%', '#020306'], ['70%', '#0c1220'], ['100%', '#1a2436']]);
      lg('st-sea', [['0%', '#0d3d58'], ['30%', '#082a40'], ['100%', '#020a12']]);
      lg('st-ray', [['0%', '#7fd8ff', .22], ['100%', '#7fd8ff', 0]]);
      const blur = defs.append('filter').attr('id', 'st-blur').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
      blur.append('feGaussianBlur').attr('stdDeviation', 18);
      const glow = defs.append('filter').attr('id', 'st-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      glow.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
      const mg = glow.append('feMerge'); mg.append('feMergeNode').attr('in', 'b'); mg.append('feMergeNode').attr('in', 'SourceGraphic');

      const world = this.world = s.append('g');
      world.append('rect').attr('x', 0).attr('y', -400).attr('width', 1920).attr('height', SURF + 420).attr('fill', 'url(#st-sky)');
      // clouds
      const rng = d3.randomLcg(5);
      this.clouds = d3.range(9).map(i => ({ x: rng() * 2200 - 140, y: 40 + rng() * 260, rx: 260 + rng() * 260, ry: 70 + rng() * 60, sp: 14 + rng() * 22, c: i % 2 ? '#1b2333' : '#121825' }));
      this.cloudEls = world.append('g').attr('filter', 'url(#st-blur)').selectAll('ellipse').data(this.clouds).enter().append('ellipse')
        .attr('rx', d => d.rx).attr('ry', d => d.ry).attr('fill', d => d.c).attr('opacity', .95);
      // lightning bolt (hidden until a strike)
      this.bolt = world.append('path').attr('d', 'M1310,-20 L1262,150 L1300,160 L1228,330 L1272,338 L1190,560').attr('fill', 'none')
        .attr('stroke', '#e6f0ff').attr('stroke-width', 5).attr('filter', 'url(#st-glow)').attr('opacity', 0);
      // the pleas we write in CLAUDE.md, tossed by the wind
      const PLEAS = ['IMPORTANT!!', 'NEVER do this', 'please remember…', 'ALWAYS run the tests', 'DO NOT forget', 'I said IMPORTANT'];
      this.pleas = PLEAS.map((t, i) => ({ t, x: 200 + i * 300 + rng() * 120, y: 250 + rng() * 260, sp: 60 + rng() * 60, ph: rng() * 6 }));
      this.pleaEls = world.append('g').selectAll('text').data(this.pleas).enter().append('text').text(d => d.t)
        .style('font', '700 30px var(--f-mono)').style('fill', '#9fb4d6').attr('opacity', .55);
      // underwater
      world.append('rect').attr('x', 0).attr('y', SURF - 40).attr('width', 1920).attr('height', 1200).attr('fill', 'url(#st-sea)');
      this.rays = world.append('g').selectAll('path').data(d3.range(7)).enter().append('path').attr('fill', 'url(#st-ray)');
      this.bubbles = d3.range(46).map(() => ({ x: rng() * 1920, y0: rng(), sp: 0.03 + rng() * 0.05, r: 2 + rng() * 5, wob: rng() * 6 }));
      this.bubEls = world.append('g').selectAll('circle').data(this.bubbles).enter().append('circle').attr('r', d => d.r)
        .attr('fill', 'none').attr('stroke', '#9fe3ff').attr('stroke-width', 1.4).attr('opacity', .35);
      this.murk = world.append('rect').attr('x', 0).attr('y', SURF - 40).attr('width', 1920).attr('height', 1000).attr('fill', '#03080f');
      // waves: three choppy layers at the surface
      this.waves = [['#16405c', 0, 1], ['#0d2c42', 22, .8], ['#081d2d', 44, .6]].map(([c, dy, a]) => ({ dy, a, el: world.append('path').attr('fill', c) }));
      this.foam = world.append('path').attr('fill', 'none').attr('stroke', '#dbeefa').attr('stroke-width', 3.2).attr('opacity', .7);
      // our boat, tossed
      this.boatG = world.append('g');
      sloop(this.boatG.append('g').attr('transform', 'scale(1.15)'), COL.sys, 'nousagi');
      // rain (screen space, sky only)
      this.drops = d3.range(260).map(() => ({ x: rng() * 2300 - 200, y: rng() * 1080, l: 26 + rng() * 34, sp: 1400 + rng() * 900 }));
      this.rainEl = world.append('path').attr('stroke', '#a9bfdc').attr('stroke-width', 1.6).attr('opacity', .42).attr('fill', 'none');
      // the hook on its line
      this.hookG = world.append('g').attr('opacity', 0);
      this.line = this.hookG.append('line').attr('stroke', '#d8e2ea').attr('stroke-width', 2.5).attr('opacity', .8);
      const H = this.hook = this.hookG.append('g');
      // a J hook: eye, shank, bend, point and barb (drawn at the origin = the eye)
      steelHook(H);
      // the description, on a plate bound to the shank
      const tag = this.tag = H.append('g').attr('transform', 'translate(34,96)').attr('opacity', 0);
      tag.append('path').attr('d', 'M-34,30 L0,30').attr('stroke', '#d8e2ea').attr('stroke-width', 3);
      tag.append('rect').attr('x', 0).attr('y', 0).attr('width', 470).attr('height', 214).attr('rx', 18).attr('fill', 'rgba(4,24,38,.88)').attr('stroke', COL.sess).attr('stroke-width', 2.5);
      text(tag, 30, 62, 'HOOK', '').style('font', '800 46px var(--f-mono)').style('letter-spacing', '.12em').style('fill', COL.sess);
      text(tag, 30, 112, 'a script Claude Code runs', '').style('font', '600 30px var(--f-body)');
      text(tag, 30, 152, 'at a fixed moment,', '').style('font', '600 30px var(--f-body)');
      text(tag, 30, 192, 'every time.', '').style('font', '700 30px var(--f-body)').style('fill', COL.sess);
      // flash overlay (screen space)
      this.flash = s.append('rect').attr('width', 1920).attr('height', 1080).attr('fill', '#dfe9ff').attr('opacity', 0);
      // captions (screen space)
      this.capStorm = s.append('g');
      text(this.capStorm, 120, 120, 'PRACTICE · HOOKS', '').style('font', '600 19px var(--f-mono)').style('letter-spacing', '.14em').style('fill', COL.mute);
      text(this.capStorm, 120, 196, 'Above the surface, a prompt is only a request.', '').style('font', '700 62px var(--f-display)').style('letter-spacing', '-.02em')
        .style('paint-order', 'stroke').style('stroke', '#020306').style('stroke-width', '10px');
      this.capCalm = s.append('g').attr('opacity', 0);
      text(this.capCalm, 120, 160, 'PRACTICE · HOOKS', '').style('font', '600 19px var(--f-mono)').style('letter-spacing', '.14em').style('fill', COL.mute);
      const h1 = text(this.capCalm, 120, 236, 'Below the storm, a hook runs ', '').style('font', '700 62px var(--f-display)').style('letter-spacing', '-.02em');
      h1.append('tspan').text('every time.').style('fill', COL.sess);
      this.events = s.append('g');
      [['UserPromptSubmit', 'before your prompt reaches Claude', 0], ['PreToolUse', 'before any tool runs · can block it', 1], ['Stop', 'when Claude wants to stop · can send it back', 2]].forEach(([k, d, i]) => {
        const g = this.events.append('g').attr('class', 'ev').attr('transform', `translate(120,${360 + i * 150})`).attr('opacity', 0);
        g.append('rect').attr('width', 800).attr('height', 124).attr('rx', 62).attr('fill', 'rgba(64,200,224,.10)').attr('stroke', COL.sess).attr('stroke-width', 2);
        text(g, 44, 52, k, '').style('font', '700 32px var(--f-mono)').style('fill', COL.sess);
        text(g, 44, 96, d, '').style('font', '500 31px var(--f-body)');
      });
      this.quote = s.append('g').attr('opacity', 0);
      text(this.quote, 120, 900, '“Prompting is not a guarantee that a model will do it.”', '').style('font', '500 40px var(--f-display)');
      text(this.quote, 120, 946, 'LYDIA HALLIE, CLAUDE CODE TEAM, ANTHROPIC (12:15)', '').style('font', '400 19px var(--f-mono)').style('fill', COL.mute);
      text(s, 1800, 1044, 'Hook events: Claude Code hooks reference (code.claude.com/docs/en/hooks)', '', 'end').style('font', '400 19px var(--f-mono)').style('fill', COL.dim);

      this.cam = 0; this.hookY = -700; this.under = false;
      this.t0 = d3.now();
      this.frame(1.2);
      const still = document.body.dataset.bare || document.body.classList.contains('print') || reduce;
      if (!still) {
        const tm = d3.timer(() => this.frame((d3.now() - this.t0) / 1000)); (timers.storm = timers.storm || []).push(tm);
        this.startSound();
        later('storm', () => this.strike(true), 1700);
        const distant = () => { if (!this.under) this.strike(false); later('storm', distant, 6500 + Math.random() * 3000); };
        later('storm', distant, 7500);
      }
    },
    frame(t) {
      const calm = Math.max(0, Math.min(1, this.cam / DROP));
      const A = 1 - 0.75 * calm; // the storm eases as we go under
      const surfY = x => SURF + A * (40 * Math.sin(x / 150 - t * 2.1) + 22 * Math.sin(x / 61 + t * 3.4) + 10 * Math.sin(x / 23 - t * 5.1));
      this.waves.forEach(w => {
        let d = '';
        for (let x = -20; x <= 1940; x += 20) d += (d ? 'L' : 'M') + x + ',' + (surfY(x + w.dy * 7) + w.dy).toFixed(1);
        w.el.attr('d', d + `L1940,${SURF + 160}L-20,${SURF + 160}Z`);
        if (w.dy === 0) this.foam.attr('d', d);
      });
      // boat
      const bx = 900 + 40 * Math.sin(t * 0.7), by = surfY(bx) + 6;
      const slope = (surfY(bx + 8) - surfY(bx - 8)) / 16;
      this.boatG.attr('transform', `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(Math.atan(slope) * 57.3 * 1.6 + 7 * A * Math.sin(t * 1.9)).toFixed(2)})`);
      // clouds and pleas drift with the wind
      this.cloudEls.attr('cx', d => ((d.x + t * d.sp * A) % 2300) - 180).attr('cy', d => d.y);
      this.pleaEls.attr('x', d => ((d.x - t * d.sp) % 2100 + 2100) % 2100 - 120).attr('y', d => d.y + 26 * Math.sin(t * 1.3 + d.ph))
        .attr('opacity', d => { const xx = ((d.x - t * d.sp) % 2100 + 2100) % 2100 - 120; return calm > 0.3 ? 0 : 0.55 * Math.max(0, Math.min(1, (xx - 40) / 160, (1500 - xx) / 160)); })
        .attr('transform', d => { const xx = ((d.x - t * d.sp) % 2100 + 2100) % 2100 - 120, yy = d.y + 26 * Math.sin(t * 1.3 + d.ph); return `rotate(${(12 * Math.sin(t * 0.9 + d.ph)).toFixed(1)},${xx.toFixed(0)},${yy.toFixed(0)})`; });
      // rain
      let rp = '';
      this.drops.forEach(d => {
        const y = (d.y + t * d.sp) % (SURF + 120) - 100, x = d.x - (y + 100) * 0.32;
        if (y < SURF - 10) rp += `M${x.toFixed(0)},${y.toFixed(0)}l${(-d.l * 0.32).toFixed(0)},${(-d.l).toFixed(0)}`;
      });
      this.rainEl.attr('d', rp).attr('opacity', 0.42 * A);
      // underwater: light rays and bubbles
      this.rays.attr('d', i => { const x = 200 + i * 270 + 60 * Math.sin(t * 0.25 + i); const w = 70 + 30 * Math.sin(t * 0.4 + i * 2); return `M${x},${SURF}L${x + w},${SURF}L${x + w + 260},${SURF + 1100}L${x + 120},${SURF + 1100}Z`; })
        .attr('opacity', calm);
      this.murk.attr('opacity', 0.82 * (1 - calm));
      this.bubEls.attr('cx', d => d.x + 8 * Math.sin(t * 1.5 + d.wob)).attr('cy', d => SURF + 40 + (1 - ((d.y0 + t * d.sp) % 1)) * 1000);
      // camera and hook
      this.world.attr('transform', `translate(0,${(-this.cam).toFixed(1)})`);
      const sway = this.under ? 2.6 * Math.sin(t * 0.9) : 0;
      const hx = 1310, hy = this.hookY;
      this.line.attr('x1', hx).attr('y1', hy - 1400).attr('x2', hx).attr('y2', hy - 18);
      this.hook.attr('transform', `translate(${hx},${hy}) rotate(${sway.toFixed(2)})`);
      this.hookG.attr('transform', `rotate(${(sway * 0.25).toFixed(2)},${hx},${hy - 1400})`);
    },
    strike(loud) {
      const f = this.flash.interrupt().attr('opacity', 0);
      f.transition().duration(60).attr('opacity', loud ? .75 : .22).transition().duration(110).attr('opacity', 0.05)
        .transition().duration(70).attr('opacity', loud ? .55 : .14).transition().duration(500).attr('opacity', 0);
      this.bolt.interrupt().attr('opacity', loud ? 1 : .5).transition().delay(260).duration(240).attr('opacity', 0);
      if (loud) this.thunder();
    },
    /* rain and wind under the speaker's voice; one thunder clap on the first strike */
    startSound() {
      const ctx = actx(); if (!ctx) return;
      const t = ctx.currentTime;
      const master = ctx.createGain(); master.gain.setValueAtTime(0, t); master.gain.linearRampToValueAtTime(1, t + 1.2);
      const muff = ctx.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = 9000;
      muff.connect(master).connect(ctx.destination);
      const buf = noiseBuf(ctx, 3);
      const loop = (type, f, q, vol) => {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const g = ctx.createGain(); g.gain.value = vol;
        src.connect(fl).connect(g).connect(muff); src.start(t + Math.random() * 0.3);
        return src;
      };
      this.snd = { ctx, master, muff, srcs: [loop('bandpass', 1500, 0.6, 0.05), loop('highpass', 5000, 0.5, 0.018), loop('lowpass', 320, 0.7, 0.06)] };
    },
    thunder() {
      const S = this.snd; if (!S) return;
      const ctx = S.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx, 4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(90, t + 2.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.42, t + 0.04); g.gain.exponentialRampToValueAtTime(0.12, t + 0.6);
      g.gain.linearRampToValueAtTime(0.2, t + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
      src.connect(lp).connect(g).connect(S.muff); src.start(t); src.stop(t + 3.8);
    },
    stopSound(fade) {
      const S = this.snd; if (!S) return;
      this.snd = null;
      const t = S.ctx.currentTime, k = fade || 0.4;
      S.master.gain.cancelScheduledValues(t); S.master.gain.setValueAtTime(S.master.gain.value, t); S.master.gain.linearRampToValueAtTime(0, t + k);
      S.srcs.forEach(src => { try { src.stop(t + k + 0.1); } catch (e) { } });
    },
    dive(instant) {
      if (this.under) return;
      this.under = true;
      const still = instant || reduce || document.body.dataset.bare;
      fade(this.capStorm, false, 400, instant);
      this.hookG.attr('opacity', 1);
      if (still) { this.hookY = HOOK_SCREEN + DROP; this.cam = DROP; this.frame(2); fade(this.capCalm, true, 0, true); this.tag.attr('opacity', 1); return; }
      // the hook plunges past us, then pulls us under with it
      const self = this, y0 = this.hookY;
      d3.select({}).transition('dive').duration(1100).ease(d3.easeBackOut.overshoot(0.6)).tween('h', () => k => { self.hookY = y0 + (HOOK_SCREEN - y0) * k; })
        .transition().delay(250).duration(2600).ease(d3.easeCubicInOut).tween('c', () => k => { self.cam = DROP * k; self.hookY = HOOK_SCREEN + DROP * k; })
        .on('end', () => { fade(self.capCalm, true, 800); self.tag.transition().delay(500).duration(900).attr('opacity', 1); });
      const S = this.snd;
      if (S) {
        const t = S.ctx.currentTime;
        S.muff.frequency.setValueAtTime(9000, t + 1.0); S.muff.frequency.exponentialRampToValueAtTime(280, t + 3.4);
        S.master.gain.setValueAtTime(1, t + 1.0); S.master.gain.linearRampToValueAtTime(0.5, t + 3.4); S.master.gain.linearRampToValueAtTime(0, t + 8);
        later('storm', () => this.stopSound(0.2), 8200);
      }
    },
    step(slide, n, instant) {
      if (n >= 1) this.dive(instant);
      else if (this.under) { this.enter(slide, true); }
      this.events.selectAll('.ev').each(function (d, i) {
        d3.select(this).interrupt().transition().delay(D(n >= 2 ? i * 260 : 0, instant)).duration(D(600, instant)).attr('opacity', n >= 2 ? 1 : 0);
      });
      fade(this.quote, n >= 3, 700, instant);
    },
    leave() { stop('storm'); this.stopSound(0.3); }
  };

  /* ---------- s-exit2 · exit 1 lets Claude stop; exit 2 sends it back ---------- */
  C['s-exit2'] = {
    steps: 4,
    enter() {
      stop('exit'); this.looping = false;
      const s = clear('exit-svg');
      const A = arrows(s, 9);
      const box = (x, y, w, h, c, t1, t2, t3) => {
        const g = s.append('g').attr('transform', `translate(${x},${y})`);
        g.append('rect').attr('width', w).attr('height', h).attr('rx', 18).attr('fill', COL.surf).attr('stroke', c).attr('stroke-width', 3);
        text(g, 26, 50, t1, '').style('font', '700 34px var(--f-display)').style('fill', c === COL.line ? COL.ink : c);
        if (t2) text(g, 26, 90, t2, '').style('font', '500 27px var(--f-body)').style('fill', COL.mute);
        if (t3) text(g, 26, 118, t3, '').style('font', '600 22px var(--f-body)');
        return g;
      };
      this.claude = box(10, 60, 230, 116, COL.sys, 'Claude', 'wants to stop');
      this.hook = box(310, 60, 340, 116, COL.sess, 'Stop hook', 'python evals/check.py');
      this.p1 = s.append('path').attr('d', 'M242,118 L302,118').attr('stroke', COL.mute).attr('stroke-width', 3).attr('marker-end', A('arr'));
      this.b1 = s.append('g').attr('opacity', 0);
      this.b1.append('path').attr('d', 'M652,118 L712,118').attr('stroke', COL.bad).attr('stroke-width', 3).attr('stroke-dasharray', '7 6').attr('marker-end', A('arr'));
      const e1 = this.b1.append('g').attr('transform', 'translate(720,40)');
      e1.append('rect').attr('width', 270).attr('height', 168).attr('rx', 18).attr('fill', 'rgba(255,69,58,.08)').attr('stroke', COL.bad).attr('stroke-width', 2.5).attr('stroke-dasharray', '8 6');
      text(e1, 22, 52, 'exit 1', '').style('font', '800 36px var(--f-mono)').style('fill', COL.bad);
      text(e1, 22, 90, 'non-blocking error', '').style('font', '500 27px var(--f-body)').style('fill', COL.mute);
      text(e1, 22, 128, '✗ task marked', '').style('font', '600 28px var(--f-body)');
      text(e1, 22, 158, '   complete anyway', '').style('font', '600 28px var(--f-body)');
      this.b2 = s.append('g').attr('opacity', 0);
      this.b2.append('path').attr('d', 'M480,178 L480,282').attr('stroke', COL.ok).attr('stroke-width', 3.5).attr('marker-end', A('ok'));
      const e2 = this.b2.append('g').attr('transform', 'translate(310,290)');
      e2.append('rect').attr('width', 340).attr('height', 150).attr('rx', 18).attr('fill', 'rgba(48,209,88,.10)').attr('stroke', COL.ok).attr('stroke-width', 3);
      text(e2, 24, 54, 'exit 2', '').style('font', '800 38px var(--f-mono)').style('fill', COL.ok);
      text(e2, 24, 94, 'stderr goes to Claude:', '').style('font', '500 27px var(--f-body)').style('fill', COL.mute);
      text(e2, 24, 128, '"2 checks failed: …"', '').style('font', '600 27px var(--f-body)');
      this.back = this.b2.append('path').attr('d', 'M308,366 C170,366 125,300 125,186').attr('fill', 'none').attr('stroke', COL.ok).attr('stroke-width', 3.5).attr('marker-end', A('ok'));
      text(this.b2, 20, 300, 'fixes it,', '').style('font', '600 28px var(--f-body)').style('fill', COL.ok);
      text(this.b2, 20, 334, 'tries again', '').style('font', '600 28px var(--f-body)').style('fill', COL.ok);
      this.code = s.append('g').attr('opacity', 0);
      this.code.append('rect').attr('x', 10).attr('y', 470).attr('width', 980).attr('height', 76).attr('rx', 12).attr('fill', '#0b0b0d').attr('stroke', COL.line);
      const ct = text(this.code, 26, 519, 'your eval, bundled: ', '').style('font', '500 29px var(--f-mono)').style('fill', COL.mute);
      ct.append('tspan').text('python evals/check.py || exit 2').style('fill', COL.ok).style('font-weight', 700);
      this.dot = s.append('circle').attr('r', 11).attr('fill', COL.ink).attr('opacity', 0);
    },
    loop() {
      const pts = [[242, 118], [310, 118], [480, 178], [480, 282], [308, 366], [125, 186], [125, 176]];
      const run = () => {
        let t = this.dot.attr('opacity', 1).attr('transform', `translate(${pts[0]})`);
        pts.slice(1).forEach(p => { t = t.transition().duration(520).ease(d3.easeLinear).attr('transform', `translate(${p})`); });
        t.transition().duration(300).attr('opacity', 0).on('end', () => later('exit', run, 500));
      };
      if (!reduce && !document.body.dataset.bare) run();
    },
    step(slide, n, instant) {
      fade(this.b1, n >= 2, 500, instant); fade(this.b2, n >= 2, 500, instant); fade(this.code, n >= 2, 500, instant);
      if (n >= 2 && !this.looping) { this.looping = true; later('exit', () => this.loop(), D(700, instant)); }
      if (n < 2) { this.looping = false; stop('exit'); this.dot.interrupt().attr('opacity', 0); }
    },
    leave() { stop('exit'); this.looping = false; if (this.dot) this.dot.interrupt(); }
  };

  /* ---------- s-pdpa · a UserPromptSubmit hook catches an NRIC before it leaves the laptop ----------
     The hook is the steel J-hook from the storm slide, on a line, swaying a little. The prompt with an NRIC and a phone
     number slides in and is pierced by its point: the full hook is drawn behind the card, and a copy of the tip, cut at
     the entry hole, in front of it. The clean prompt passes underneath to Claude. */
  C['s-pdpa'] = {
    steps: 4,
    enter() {
      stop('pii'); this.played = false; this.hooked = false; this.tugY = 0; if (this.swayT) { this.swayT.stop(); this.swayT = null; }
      const root = clear('pii-svg');
      const A = arrows(root, 9);
      const s = root.append('g').attr('transform', 'translate(0,40)');
      // Claude
      const cl = s.append('g').attr('transform', 'translate(780,40)');
      cl.append('rect').attr('width', 230).attr('height', 330).attr('rx', 20).attr('fill', COL.surf).attr('stroke', COL.sys).attr('stroke-width', 3);
      text(cl, 115, 52, 'Claude', '', 'middle').style('font', '700 32px var(--f-display)');
      this.recv1 = text(cl, 115, 140, 'receives nothing', '', 'middle').style('font', '600 27px var(--f-body)').style('fill', COL.mute).attr('opacity', 0);
      this.recv2 = text(cl, 115, 317, '✓ student A0423', '', 'middle').style('font', '600 26px var(--f-body)').style('fill', COL.ok).attr('opacity', 0);
      // the hook on its line, behind the prompts (the point's tip is drawn again in front of the first one, below)
      const EX = 650, EY = -7, K = 0.55;              // eye position and scale of the storm hook
      const HOLE = 322;                               // hook-space y where the point enters the card (the tip runs to 190)
      this.hookG = s.append('g');
      this.hookG.append('line').attr('x1', EX).attr('x2', EX).attr('y1', -40).attr('y2', EY - 11).attr('stroke', '#d8e2ea').attr('stroke-width', 2).attr('opacity', .8);
      steelHook(this.hookG.append('g').attr('transform', `translate(${EX},${EY}) scale(${K})`));
      text(s, EX + 22, -12, 'UserPromptSubmit hook', '').style('font', '700 24px var(--f-mono)').style('fill', COL.sess);
      // the prompts
      const card = (y, lines, c) => {
        const g = s.append('g').attr('transform', `translate(10,${y})`).attr('opacity', 0);
        g.append('rect').attr('width', 520).attr('height', 140).attr('rx', 14).attr('fill', '#0b0b0d').attr('stroke', c).attr('stroke-width', 2.5);
        lines.forEach((l, i) => {
          const t = g.append('text').attr('x', 18).attr('y', 42 + i * 38).style('font', '500 26px var(--f-mono)');
          l.forEach(([seg, cls]) => t.append('tspan').text(seg).attr('class', cls || '').style('fill', COL.ink));
        });
        return g;
      };
      this.c1 = card(40, [[['> Draft a reply to '], ['S1234567D', 'pii']], [['(mobile '], ['9123 4567', 'pii'], [') about']], [['the late work.']]], COL.line);
      // the puncture: a dark hole a little wider than the wire, with the pushed-out rim catching the light below it
      this.hole = this.c1.append('g').attr('transform', 'translate(475.5,120)').attr('opacity', 0);
      this.hole.append('ellipse').attr('rx', 8).attr('ry', 3.6).attr('fill', '#000');
      this.hole.append('path').attr('d', 'M-8.5,0.5 A8.5,4.2 0 0,0 8.5,0.5').attr('fill', 'none').attr('stroke', '#5c5c66').attr('stroke-width', 1.3);
      this.err = s.append('g').attr('opacity', 0);
      text(this.err, 10, 238, 'exit 2 · blocked by the hook', '').style('font', '700 26px var(--f-mono)').style('fill', COL.bad);
      text(this.err, 10, 272, 'NRIC/FIN and phone found', '').style('font', '500 26px var(--f-mono)').style('fill', COL.bad);
      this.c2 = card(298, [[['> Draft a reply to student']], [['A0423 about the late work.']]], COL.ok);
      this.c2.select('rect').attr('height', 100);
      this.a2 = s.append('path').attr('d', 'M540,348 L770,348').attr('stroke', COL.ok).attr('stroke-width', 3).attr('marker-end', A('ok')).attr('opacity', 0);
      // the point goes through the first prompt: the hole, and the tip in front of the card, cut at the hole
      const front = this.front = s.append('g');
      const FH = front.append('g').attr('transform', `translate(${EX},${EY}) scale(${K})`);
      const cid = 'pii-tipclip';
      FH.append('clipPath').attr('id', cid).append('rect').attr('x', -240).attr('y', 120).attr('width', 120).attr('height', HOLE);
      steelHook(FH.append('g').attr('clip-path', `url(#${cid})`));
      this.pivot = [EX, -40];
      this.sway(0);
      if (!reduce && !document.body.dataset.bare) {
        const t0 = performance.now();
        this.swayT = d3.timer(() => this.sway(Math.sin((performance.now() - t0) / 1000 * 1.3) * 2.2 * (this.hooked ? 0.35 : 1)));
      }
    },
    HUNG: 'translate(70,50) rotate(-2.5,475.5,120)',  // the first prompt hanging on the point, turned about the hole
    sway(deg) {
      const [px, py] = this.pivot, tr = `translate(0,${(this.tugY || 0).toFixed(1)}) rotate(${deg.toFixed(2)},${px},${py})`;
      this.hookG.attr('transform', tr); this.front.attr('transform', tr);
      if (this.hooked) this.c1.attr('transform', tr + ' ' + this.HUNG);
    },
    play(instant) {
      const now = instant || reduce || document.body.dataset.bare;
      const c1 = this.c1, pii = c1.selectAll('tspan.pii');
      const caught = () => {
        c1.select('rect').attr('stroke', COL.bad);
        pii.style('fill', COL.bad).style('text-decoration', 'line-through');
        this.hole.attr('opacity', 1);
      };
      if (now) {
        this.hooked = true; c1.attr('opacity', 1); this.sway(0); caught();
        this.err.attr('opacity', 1); this.recv1.attr('opacity', 1);
        this.c2.attr('opacity', 1); this.a2.attr('opacity', 1); this.recv2.attr('opacity', 1); return;
      }
      // slides in onto the point, drops onto it and tips over a little, and hangs there; the hook gives a short tug
      c1.attr('transform', 'translate(-60,40)').transition().duration(500).attr('opacity', 1).attr('transform', 'translate(10,40)')
        .transition().duration(800).ease(d3.easeCubicIn).attr('transform', 'translate(70,40)')
        .transition().duration(260).ease(d3.easeBackOut.overshoot(2)).attr('transform', this.HUNG)
        .on('start', () => this.hole.attr('opacity', 1))
        .on('end', () => {
          this.hooked = true;
          c1.select('rect').transition().duration(200).attr('stroke', COL.bad);
          pii.transition().duration(200).style('fill', COL.bad);
          later('pii', () => pii.style('text-decoration', 'line-through'), 300);
          d3.select({}).transition().duration(420).tween('tug', () => k => { this.tugY = -12 * Math.sin(Math.PI * k) * (1 - 0.4 * k); if (!this.swayT) this.sway(0); });
          fade(this.err, true, 400); fade(this.recv1, true, 600);
          later('pii', () => {
            this.c2.attr('transform', 'translate(-60,298)').transition().duration(700).ease(d3.easeCubicOut).attr('opacity', 1).attr('transform', 'translate(10,298)');
            this.a2.transition().delay(700).duration(700).attr('opacity', 1);
            this.recv2.transition().delay(1300).duration(500).attr('opacity', 1);
          }, 1600);
        });
    },
    step(slide, n, instant) {
      if (n >= 3 && !this.played) { this.played = true; this.play(instant); }
      if (n < 3 && this.played) { this.played = false; this.hooked = false; stop('pii'); this.enter(); }
    },
    leave() { stop('pii'); if (this.swayT) { this.swayT.stop(); this.swayT = null; } }
  };


  /* ---------- s-close · Close: the WALL-E clip, then the questions screen ----------
     Step 1 plays the clip full-bleed (muted); when it ends, or on the next click, the screen becomes a neon floor
     that echoes the clip's Axiom deck, a cursor types "Thank you." and one soft swell plays (film/close.m4a). */
  const TOKENS = ['bootstrap', 'mtry = 2', 'Gini', '500 trees', 'plinko', 'tool_use', '✓', 'exit 2', 'hook', 'Stop', 'PreToolUse', 'UserPromptSubmit', 'eval',
    'receipt', 'first mate', 'harness', 'loop', 'CLAUDE.md', 'subagent', 'ntree', 'residual', 'XGBoost', 'S•••••••D', 'PDPA', 'token', 'Edit', 'Bash', 'review'];
  C['s-close'] = {
    steps: 2,
    enter(slide) {
      stop('close');
      this.slide = slide;
      const box = slide.querySelector('.closefilm');
      if (box && !box.dataset.probed) {
        box.dataset.probed = '1';
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = box.dataset.src;
        v.addEventListener('loadeddata', () => { box.classList.add('has-video'); box.appendChild(v); });
        v.addEventListener('ended', () => { if (this.slide && this.slide.classList.contains('active') && this.phase === 'clip') this.toQA(false); });
      }
      this.audio = this.audio || (() => { const a = new Audio('film/close.m4a'); a.preload = 'auto'; return a; })();
      try { this.audio.pause(); this.audio.currentTime = 0; } catch (e) { }
      this.video = box && box.querySelector('video');
      if (this.video) { this.video.pause(); this.video.currentTime = 0; }
      if (box) { box.style.transition = ''; box.classList.remove('playing'); }
      clear('close-svg').append('rect').attr('width', 1920).attr('height', 1080).attr('fill', '#000');
      slide.querySelector('.qa').classList.remove('on');
      document.getElementById('qa-type').textContent = '';
      this.phase = 'black';
    },
    step(slide, n, instant) {
      if (n === 0) { if (this.phase !== 'black') this.enter(slide); return; }
      if (n >= 2 || instant) { if (this.phase !== 'qa') this.toQA(!!instant || reduce); return; }
      if (this.phase !== 'black') return;
      const v = slide.querySelector('.closefilm video');
      if (v && !reduce) {
        this.phase = 'clip';
        this.video = v;
        v.currentTime = 0; v.parentElement.classList.add('playing');
        const p = v.play(); if (p && p.catch) p.catch(() => this.toQA(false));
      } else this.toQA(false);
    },
    toQA(instant) {
      stop('close');
      this.phase = 'qa';
      const slide = this.slide, box = slide.querySelector('.closefilm');
      if (box) { box.style.transition = instant ? 'none' : ''; box.classList.remove('playing'); }
      if (this.video) { const v = this.video; if (instant) v.pause(); else later('close', () => v.pause(), 1000); }
      if (!instant) { try { this.audio.currentTime = 0; const p = this.audio.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
      const s = clear('close-svg');
      const defs = s.append('defs');
      const sky = defs.append('linearGradient').attr('id', 'qa-sky').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
      sky.append('stop').attr('offset', '0%').attr('stop-color', '#000'); sky.append('stop').attr('offset', '100%').attr('stop-color', '#061a26');
      const glow = defs.append('radialGradient').attr('id', 'qa-glow');
      glow.append('stop').attr('offset', '0%').attr('stop-color', COL.sess).attr('stop-opacity', .45);
      glow.append('stop').attr('offset', '100%').attr('stop-color', COL.sess).attr('stop-opacity', 0);
      const blur = defs.append('filter').attr('id', 'qa-blur').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
      blur.append('feGaussianBlur').attr('stdDeviation', 5);
      const HZ = 640, VX = 960;
      s.append('rect').attr('width', 1920).attr('height', 1080).attr('fill', '#000');
      const world = s.append('g').attr('opacity', 0);
      world.append('rect').attr('width', 1920).attr('height', HZ).attr('fill', 'url(#qa-sky)');
      world.append('rect').attr('y', HZ).attr('width', 1920).attr('height', 1080 - HZ).attr('fill', '#02080c');
      world.append('ellipse').attr('cx', VX).attr('cy', HZ).attr('rx', 1100).attr('ry', 170).attr('fill', 'url(#qa-glow)');
      // floating tokens: the talk's own vocabulary drifting up, faint, kept clear of the headline
      const rng = d3.randomLcg(21);
      const toks = d3.range(34).map(i => ({ t: TOKENS[i % TOKENS.length], x: 60 + rng() * 1800, y0: rng(), sp: 0.012 + rng() * 0.02, sz: 18 + rng() * 14 }));
      const tokEls = world.append('g').selectAll('text').data(toks).enter().append('text').text(d => d.t).attr('x', d => d.x).attr('text-anchor', 'middle')
        .style('font', d => `500 ${d.sz.toFixed(0)}px var(--f-mono)`).style('fill', COL.sess);
      // the floor: rays from the vanishing point, and rungs that slide toward us
      const floor = world.append('g');
      const rays = d3.range(-14, 15).map(j => `M${VX},${HZ} L${VX + j * 260},1080`).join(' ');
      floor.append('path').attr('d', rays).attr('stroke', COL.sess).attr('stroke-width', 6).attr('opacity', .25).attr('filter', 'url(#qa-blur)');
      floor.append('path').attr('d', rays).attr('stroke', COL.sess).attr('stroke-width', 1.4).attr('opacity', .75);
      const rungG = floor.append('g');
      const rungs = d3.range(26).map(() => rungG.append('line').attr('x1', 0).attr('x2', 1920).attr('stroke', COL.sess).attr('stroke-width', 1.6));
      world.append('line').attr('x1', 0).attr('x2', 1920).attr('y1', HZ).attr('y2', HZ).attr('stroke', COL.sess).attr('stroke-width', 2).attr('opacity', .9);
      // HUD: corner brackets and read-outs from the real numbers
      const hud = s.append('g').attr('opacity', 0);
      [[60, 60, 1, 1], [1860, 60, -1, 1], [60, 1020, 1, -1], [1860, 1020, -1, -1]].forEach(([x, y, sx, sy]) =>
        hud.append('path').attr('d', `M${x},${y + sy * 54} L${x},${y} L${x + sx * 54},${y}`).attr('fill', 'none').attr('stroke', COL.sess).attr('stroke-width', 3));
      const ro = (x, y, t, a) => text(hud, x, y, t, '', a).style('font', '600 20px var(--f-mono)').style('letter-spacing', '.12em').style('fill', COL.sess)
        .style('paint-order', 'stroke').style('stroke', '#02080c').style('stroke-width', '8px').style('stroke-linejoin', 'round');
      ro(92, 100, 'THE AGE OF LLMS', 'start');
      ro(1828, 100, '2 EXPLAINERS · 7 MESSAGES', 'end');
      ro(1828, 132, 'HOOKS · EXIT 2', 'end').style('fill', COL.ok);
      const st = ro(92, 996, 'STATUS ▸ STILL WALKING', 'start');
      ro(1828, 996, 'TEACH · CHECK · GUARD', 'end');
      const qa = slide.querySelector('.qa'), out = document.getElementById('qa-type');
      const WORD = 'Thank you.';
      const frame = (t) => {
        const f = (t * 0.32) % 1;
        rungs.forEach((r, k) => {
          const d = k + 1 - f, y = HZ + 440 / (1 + 0.55 * d);
          r.attr('y1', y).attr('y2', y).attr('opacity', Math.min(1, (y - HZ) / 140) * 0.8);
        });
        tokEls.each(function (d) {
          const y = HZ - 20 - ((d.y0 + t * d.sp) % 1) * (HZ - 40);
          const hidden = (d.x > 260 && d.x < 1660 && y > 240 && y < 560) || (y < 170 && (d.x < 560 || d.x > 1320));
          d3.select(this).attr('y', y).attr('opacity', hidden ? 0 : 0.22 * Math.max(0, Math.min(1, (HZ - y) / 120, (y - 20) / 120)));
        });
        st.attr('opacity', 0.55 + 0.45 * (Math.floor(t * 2) % 2));
      };
      const still = reduce || document.body.dataset.bare || document.body.classList.contains('print');
      frame(4);
      if (!still) { const t0 = instant ? 4 : 0; const tm = d3.timer(e => frame(t0 + e / 1000)); (timers.close = timers.close || []).push(tm); }
      if (instant || reduce) {
        world.attr('opacity', 1); hud.attr('opacity', 1); qa.classList.add('on'); out.textContent = WORD; return;
      }
      world.transition().delay(300).duration(1400).attr('opacity', 1);
      later('close', () => qa.classList.add('on'), 1500);
      hud.transition().delay(2200).duration(800).attr('opacity', 1);
      [...WORD].forEach((c, i) => later('close', () => { out.textContent = WORD.slice(0, i + 1); }, QA_TYPE_AT[i] * 1000));
    },
    leave() {
      stop('close');
      try { this.audio && this.audio.pause(); } catch (e) { }
      if (this.video) this.video.pause();
    }
  };
  /* key times (s) for typing "Thank you." (10 keys, like "Questions?"), shared with lecture-1/src/film/close.py so each keystroke has its sound */
  const QA_TYPE_AT = [2.90, 3.02, 3.13, 3.27, 3.38, 3.49, 3.63, 3.74, 3.86, 4.12];

  window.SLIDES = C;
})();