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

  /* ---------- s-hook · Hook: the rendered film if film/opening.mp4 is next to the deck, else the D3 version below ---------- */
  function setupFilm(slide) {
    const box = slide.querySelector('.film');
    if (!box || box.dataset.probed) return;
    box.dataset.probed = '1';
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.src = box.dataset.src;
    v.addEventListener('loadeddata', () => { box.classList.add('has-video'); box.appendChild(v); });
    v.addEventListener('error', () => { });
    // the film's last frame is the finale card; hand over to the SVG copy so later steps behave the same
    v.addEventListener('ended', () => { const c = C['s-hook']; if (c.finale) c.finale.interrupt().attr('opacity', 1); box.classList.remove('playing'); });
  }
  function filmVideo(slide) { const box = slide.querySelector('.film.has-video'); return box && box.querySelector('video'); }
  function stopFilm(slide) {
    const v = slide && filmVideo(slide);
    if (v) { v.pause(); v.parentElement.classList.remove('playing'); }
  }
  function playFilm(v) {
    v.currentTime = 0; v.muted = false; v.parentElement.classList.add('playing');
    const p = v.play();
    // unmuted play can be refused without a gesture in this window (e.g. advanced from the presenter view): play muted
    if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => { }); });
  }
  C['s-hook'] = {
    steps: 2,
    enter(slide) {
      stop('hook');
      if (slide) { setupFilm(slide); stopFilm(slide); }
      const s = clear('hook-svg');
      s.append('rect').attr('width', 1920).attr('height', 1080).attr('fill', COL.bg);
      this.finale = s.append('g').attr('opacity', 0);
      text(this.finale, 960, 560, 'A year ago, I said LLM output was trash.', '', 'middle')
        .style('font', '700 76px var(--f-display)').style('letter-spacing', '-0.02em');
      this.playing = false;
    },
    play() {
      this.playing = true;
      const s = svg('hook-svg');
      const finale = this.finale;
      const g = s.insert('g', () => finale.node());

      const words = ['Schedule', '40', 'flights', 'across', '12', 'gates', 'with', 'no', 'conflicts.'];
      const wg = g.append('g');
      const els = words.map(w => text(wg, 0, 470, w, '').style('font', '600 64px var(--f-display)').attr('opacity', 0));
      const gap = 22, widths = els.map(t => t.node().getComputedTextLength());
      let x = (1920 - d3.sum(widths) - gap * (els.length - 1)) / 2;
      els.forEach((t, i) => {
        t.attr('x', x); x += widths[i] + gap;
        t.transition().delay(150 + i * 140).duration(400).attr('opacity', 1);
      });
      // split into token chips
      const toks = ['Sched', 'ule', ' 40', ' flights', ' across', ' 12', ' gates', ' with', ' no', ' conflicts', '.'];
      const chipG = g.append('g');
      later('hook', () => {
        wg.transition().duration(500).attr('opacity', 0);
        const tw = toks.map(tk => tk.trim().length * 19.5 + 30);
        let cx = (1920 - d3.sum(tw) - 12 * (toks.length - 1)) / 2;
        toks.forEach((tk, i) => {
          const w = tw[i];
          const c = chipG.append('g').attr('transform', `translate(${cx},420)`).attr('opacity', 0);
          c.append('rect').attr('width', w).attr('height', 70).attr('rx', 12).attr('fill', COL.surf2).attr('stroke', COL.neu).attr('stroke-width', 2);
          text(c, w / 2, 47, tk.trim() || '·', '', 'middle').style('font', '500 32px var(--f-mono)');
          c.transition().delay(i * 60).duration(350).attr('opacity', 1);
          c.datum({ i, w }); cx += w + 12;
        });
      }, 2200);
      // window + layers
      const win = g.append('g').attr('transform', 'translate(1320,170)').attr('opacity', 0);
      win.append('rect').attr('width', 420).attr('height', 740).attr('rx', 22).attr('fill', 'none').attr('stroke', COL.line).attr('stroke-width', 3);
      text(win, 210, -24, 'context window', 'lbl', 'middle');
      const layers = [['sys', 230], ['proj', 90], ['sess', 60], ['conv', 220]];
      let ly = 20;
      const bands = layers.map(([k, h]) => {
        const r = win.append('rect').attr('x', 20).attr('y', ly).attr('width', 380).attr('height', 0).attr('rx', 8).attr('fill', COL[k]).attr('opacity', .85);
        const y0 = ly; ly += h + 10; return { r, h, y0 };
      });
      later('hook', () => {
        chipG.transition().duration(700).attr('transform', 'translate(-60,0)');
        win.transition().duration(600).attr('opacity', 1);
        bands.forEach((b, i) => b.r.transition().delay(300 + i * 450).duration(600).attr('height', b.h));
        chipG.selectAll('g').transition().delay((d, i) => 1600 + i * 110).duration(700)
          .attr('transform', (d, i) => `translate(${1360 + (i % 4) * 92},${170 + 20 + 650 - Math.floor(i / 4) * 0})`)
          .attr('opacity', 0);
      }, 3600);
      // counter
      const big = s.insert('g', () => finale.node()).attr('opacity', 0);
      const num = text(big, 640, 520, '0', '', 'middle').style('font', '800 120px var(--f-display)').style('font-variant-numeric', 'tabular-nums');
      text(big, 640, 600, 'tokens through Claude, my last nine weeks', '', 'middle').style('font', '500 34px var(--f-body)').style('fill', COL.mute);
      const pct = text(big, 640, 700, '', '', 'middle').style('font', '700 54px var(--f-display)').style('fill', COL.ok);
      const target = tot.processed || 2.37e9, hit = tot.cache_hit_rate || 0.98;
      later('hook', () => {
        big.transition().duration(500).attr('opacity', 1);
        num.transition().duration(4200).ease(d3.easeCubicOut).tween('text', () => { const i = d3.interpolateNumber(0, target); return t => num.text(fmt(Math.round(i(t)))); });
        bands.forEach(b => b.r.transition().delay(2600).duration(1400).attr('fill', COL.ok));
        later('hook', () => pct.text(Math.round(hit * 100) + '% read from cache'), 4400);
      }, 8200);
      later('hook', () => {
        g.transition().duration(900).attr('opacity', 0);
        big.transition().duration(900).attr('opacity', 0);
        finale.transition().delay(1100).duration(900).attr('opacity', 1);
      }, 17500);
    },
    step(slide, n, instant) {
      if (n >= 2 || (n >= 1 && (instant || reduce))) {
        stop('hook');
        stopFilm(slide);
        const fin = this.finale.node();
        svg('hook-svg').selectAll(':scope > g').filter(function () { return this !== fin; }).interrupt().transition().duration(D(300, instant)).attr('opacity', 0);
        this.finale.interrupt().transition().duration(D(500, instant)).attr('opacity', 1);
      } else if (n === 1 && !this.playing) {
        const v = filmVideo(slide);
        if (v) { this.playing = true; playFilm(v); } else this.play();
      }
      else if (n === 0) this.enter(slide);
    },
    leave(slide) { stop('hook'); stopFilm(slide); }
  };

  /* ---------- s-promise · Trust curve ---------- */
  C['s-promise'] = {
    steps: 3,
    enter() {
      const s = clear('trustcurve-svg');
      const m = { l: 92, r: 60, t: 70, b: 60 }, W = 1080 - m.l - m.r, H = 560 - m.t - m.b;
      const g = s.append('g').attr('transform', `translate(${m.l},${m.t})`);
      const x = d3.scaleLinear().domain([0, 10]).range([0, W]);
      const y = d3.scaleLinear().domain([-1.2, 3.2]).range([H, 0]);
      // red low, green high: the colour says "up is good" even from the back row
      const lg = s.append('defs').append('linearGradient').attr('id', 'trustg').attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0).attr('x2', 0).attr('y1', y(-1)).attr('y2', y(2.9));
      [[0, COL.bad], [0.45, COL.neu], [1, COL.ok]].forEach(([o, c]) => lg.append('stop').attr('offset', o).attr('stop-color', c));
      g.append('rect').attr('x', 0).attr('y', y(0)).attr('width', W).attr('height', H - y(0)).attr('fill', COL.surf);
      g.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', COL.mute).attr('stroke-width', 2);
      g.append('line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', H).attr('stroke', COL.mute).attr('stroke-width', 2);
      text(g, -14, y(0) + 6, '0', 'lbl', 'end');
      text(g, W, y(0) + 40, 'time + use →', '', 'end').style('font', '600 28px var(--f-body)').style('fill', COL.mute);
      text(g, -20, -6, '↑ trust', '', 'start').style('font', '700 32px var(--f-body)').style('fill', COL.ok).attr('transform', 'translate(20,0)');
      const f = t => -1 + 4 / (1 + Math.exp(-(t - 4.6) * 1.05));
      const pts = d3.range(0, 10.01, 0.1).map(t => [t, f(t)]);
      this.path = g.append('path').datum(pts).attr('fill', 'none').attr('stroke', 'url(#trustg)').attr('stroke-width', 7).attr('stroke-linecap', 'round')
        .attr('d', d3.line().x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveBasis));
      this.dots = g.append('g');
      [0.3, 1.6, 2.8, 3.9, 4.8, 5.6, 6.3, 7.1, 8.2, 9.3].forEach(t => this.dots.append('circle').attr('cx', x(t)).attr('cy', y(f(t))).attr('r', 7).attr('fill', COL.bg).attr('stroke', 'url(#trustg)').attr('stroke-width', 3));
      this.dots.attr('opacity', 0);
      this.me = g.append('g').attr('opacity', 0);
      this.me.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(2.25)).attr('y2', y(2.25)).attr('stroke', COL.sys).attr('stroke-dasharray', '8 8').attr('stroke-width', 2);
      text(this.me, W, y(2.25) - 12, 'me, now', 'lbl', 'end').style('fill', COL.sys);
      this.labels = g.append('g').attr('opacity', 0);
      text(this.labels, x(0.3) + 60, y(f(0.3)) + 40, '“LLM output is trash”', 'lbl').style('fill', COL.bad);
      text(this.labels, x(3.2) + 18, y(f(3.2)) + 30, 'ok, it’s not useless', 'lbl').style('fill', COL.neu);
      const why = g.append('g').attr('opacity', 0);
      why.append('rect').attr('x', x(5.6)).attr('y', y(1.2)).attr('width', 330).attr('height', 96).attr('rx', 12).attr('fill', COL.surf2).attr('stroke', COL.ok);
      text(why, x(5.6) + 18, y(1.2) + 38, 'what moved me up:', 'lbl');
      text(why, x(5.6) + 18, y(1.2) + 74, 'checks that give receipts', '').style('font', '600 26px var(--f-body)').style('fill', COL.ok);
      // a face rides the curve as it draws: unimpressed, unsure, convinced
      this.rider = g.append('g').attr('opacity', 0);
      this.rider.append('circle').attr('r', 30).attr('fill', COL.bg).attr('stroke', COL.ink).attr('stroke-width', 2);
      this.face = text(this.rider, 0, 13, '😒', '', 'middle').style('font', '36px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif');
      this.why = why; this.x = x; this.y = y; this.f = f;
      // right: how many agents that trust lets me run, growing as the face climbs the curve
      const a = clear('agents-svg');
      this.count = text(a, 0, 78, '1 agent', '').style('font', '800 76px var(--f-display)').style('letter-spacing', '-0.03em');
      this.sub = text(a, 0, 116, '', '').style('font', '500 25px var(--f-body)').style('fill', COL.mute);
      this.bots = d3.range(100).map(i => {
        const g = a.append('g').attr('transform', `translate(${(i % 10) * 54},${144 + Math.floor(i / 10) * 22})`);
        const r = g.append('rect').attr('width', 44).attr('height', 16).attr('rx', 5).attr('fill', COL.surf2);
        g.append('circle').attr('cx', 15).attr('cy', 8).attr('r', 2.2).attr('fill', COL.bg);
        g.append('circle').attr('cx', 29).attr('cy', 8).attr('r', 2.2).attr('fill', COL.bg);
        return r;
      });
      this.tint = d3.interpolateRgbBasis([COL.bad, COL.neu, COL.ok]);
      this.agents(0);
    },
    agents(k) {
      const n = k < 0.3 ? 1 : Math.round(1 + 99 * Math.pow((k - 0.3) / 0.7, 1.8));
      const c = this.tint(k);
      this.bots.forEach((r, i) => r.attr('fill', i < n ? c : COL.surf2));
      this.count.text(n + (n === 1 ? ' agent' : ' agents')).style('fill', c);
      this.sub.text(k < 0.3 ? 'micromanaged, one at a time' : k < 0.62 ? 'checked, a few at once' : 'running on their own, with receipts');
    },
    ride(k) {
      const node = this.path.node(), L = node.getTotalLength(), p = node.getPointAtLength(Math.min(k, 0.96) * L);
      this.rider.attr('transform', `translate(${p.x},${p.y - 34})`);
      this.face.text(k < 0.3 ? '😒' : k < 0.62 ? '🤔' : '😎');
      this.agents(k);
    },
    step(slide, n, instant) {
      const L = this.path.node().getTotalLength();
      if (n >= 1) {
        if (instant || reduce) { this.path.interrupt().attr('stroke-dasharray', null).attr('stroke-dashoffset', null); this.ride(1); this.rider.attr('opacity', 1); }
        else if (!this.drawn) {
          this.rider.attr('opacity', 1);
          this.path.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(2600).ease(d3.easeCubicInOut)
            .attr('stroke-dashoffset', 0).tween('ride', () => k => this.ride(k));
        }
        this.drawn = true;
      } else { this.drawn = false; this.path.interrupt().attr('stroke-dasharray', L).attr('stroke-dashoffset', L); this.rider.attr('opacity', 0); this.agents(0); }
      fade(this.dots, n >= 1, 900, instant); fade(this.labels, n >= 1, 900, instant);
      fade(this.me, n >= 1, 600, instant);
      fade(this.why, n >= 2, 500, instant);
    }
  };

  /* ---------- s-token · Next token ---------- */
  C['s-token'] = {
    steps: 3,
    enter() {
      const s = clear('token-svg');
      this.seq = ['The', ' flight', ' is', ' delayed', ' because', ' of'];
      this.g = s.append('g');
      this.bars = s.append('g').attr('transform', 'translate(0,230)');
      text(s, 0, 214, 'next-token probabilities', 'lbl').attr('opacity', 0).attr('class', 'lbl ptitle');
      this.drawSeq(this.seq, true);
    },
    drawSeq(seq, instant, highlightLast) {
      let x = 0;
      const data = seq.map((t, i) => { const w = t.length * 24 + 34; const d = { t, i, x, w }; x += w + 14; return d; });
      const sel = this.g.selectAll('g.chip').data(data, d => d.i);
      const en = sel.enter().append('g').attr('class', 'chip').attr('transform', d => `translate(${d.x},60)`).attr('opacity', 0);
      en.append('rect').attr('height', 84).attr('rx', 14).attr('width', d => d.w).attr('fill', COL.surf2).attr('stroke', COL.line).attr('stroke-width', 2);
      en.append('text').attr('x', d => d.w / 2).attr('y', 55).attr('text-anchor', 'middle').style('font', '500 36px var(--f-mono)').text(d => d.t.replace(' ', '␣'));
      en.transition().duration(D(400, instant)).attr('opacity', 1);
      sel.exit().remove();
      this.g.selectAll('g.chip rect').attr('stroke', (d) => highlightLast && d.i === seq.length - 1 ? COL.ok : COL.line);
    },
    drawBars(cands, picked, instant) {
      const y = d3.scaleBand().domain(cands.map(c => c[0])).range([0, 380]).padding(0.22);
      const x = d3.scaleLinear().domain([0, 0.65]).range([0, 1100]);
      const sel = this.bars.selectAll('g.bar').data(cands, d => d[0]);
      sel.exit().remove();
      const en = sel.enter().append('g').attr('class', 'bar');
      en.append('text').attr('class', 'lbl-ink').attr('x', 260).attr('text-anchor', 'end').attr('dy', '.35em');
      en.append('rect').attr('x', 290).attr('rx', 6).attr('width', 0);
      en.append('text').attr('class', 'lbl pct').attr('dy', '.35em');
      const all = en.merge(sel);
      all.select('text.lbl-ink').attr('y', d => y(d[0]) + y.bandwidth() / 2).text(d => d[0].replace(' ', '␣'));
      all.select('rect').attr('y', d => y(d[0])).attr('height', y.bandwidth())
        .transition().duration(D(700, instant)).attr('width', d => x(d[1])).attr('fill', d => d[0] === picked ? COL.ok : COL.sys).attr('opacity', d => picked && d[0] !== picked ? .35 : .9);
      all.select('text.pct').attr('y', d => y(d[0]) + y.bandwidth() / 2).transition().duration(D(700, instant)).attr('x', d => 300 + x(d[1])).text(d => Math.round(d[1] * 100) + '%');
    },
    step(slide, n, instant) {
      const s = svg('token-svg');
      const c1 = [[' weather', .41], [' congestion', .22], [' a', .12], [' late', .09], [' the', .07]];
      const c2 = [['.', .58], [' at', .17], [' and', .11], [' in', .08], [' conditions', .06]];
      s.select('.ptitle').transition().duration(D(300, instant)).attr('opacity', n >= 1 ? 1 : 0);
      if (n === 0) { this.bars.selectAll('*').remove(); this.drawSeq(this.seq, instant); }
      if (n === 1) { this.drawSeq(this.seq, instant); this.bars.selectAll('*').remove(); this.drawBars(c1, null, instant); }
      if (n === 2) { this.drawSeq(this.seq, instant); this.drawBars(c1, ' weather', instant); this.drawSeq(this.seq.concat([' weather']), instant, true); }
      if (n === 3) { this.drawSeq(this.seq.concat([' weather']), true); this.bars.selectAll('*').remove(); this.drawBars(c2, '.', instant); this.drawSeq(this.seq.concat([' weather', '.']), instant, true); }
    }
  };

  /* ---------- s-stateless · Stateless ---------- */
  C['s-stateless'] = {
    steps: 3,
    enter() {
      const s = clear('stateless-svg');
      const L = s.append('g').attr('class', 'chat');
      text(L, 0, 30, 'WHAT YOU SEE', 'lbl');
      const bub = [[0, 'Plan gate assignments for Friday.', 1], [1, 'Here is a plan for 40 flights…', 1], [0, 'Now move SQ322 to gate C4.', 2]];
      bub.forEach(([who, t, k], i) => {
        const gg = L.append('g').attr('class', 'b' + k).attr('transform', `translate(${who ? 150 : 0},${70 + i * 120})`).attr('opacity', 0);
        gg.append('rect').attr('width', 560).attr('height', 86).attr('rx', 22).attr('fill', who ? COL.surf2 : '#0a3a6b');
        text(gg, 28, 54, t, '').style('font', '500 27px var(--f-body)');
      });
      const R = s.append('g').attr('transform', 'translate(820,0)');
      text(R, 0, 30, 'WHAT THE MODEL RECEIVES', 'lbl');
      const call = (y, parts, cls) => {
        const gg = R.append('g').attr('class', cls).attr('transform', `translate(0,${y})`).attr('opacity', 0);
        text(gg, 0, 34, cls === 'c1' ? 'call 1' : 'call 2', 'lbl-ink');
        let x = 110;
        parts.forEach(([k, w, t]) => {
          gg.append('rect').attr('x', x).attr('y', 0).attr('width', w).attr('height', 52).attr('rx', 8).attr('fill', COL[k]).attr('opacity', .9);
          text(gg, x + w / 2, 34, t, '', 'middle').style('font', '600 20px var(--f-mono)').style('fill', '#000');
          x += w + 6;
        });
        return gg;
      };
      call(70, [['sys', 200, 'instructions'], ['neu', 150, 'msg 1']], 'c1');
      call(230, [['sys', 200, 'instructions'], ['conv', 120, 'msg 1'], ['conv', 150, 'reply 1'], ['neu', 150, 'msg 2']], 'c2');
      text(R.append('g').attr('class', 'c2'), 110, 330, 'everything re-sent, from scratch', 'lbl').attr('opacity', 0);
      text(R.append('g').attr('class', 'c2'), 110, 420, 'no memory between calls', '').style('font', '700 40px var(--f-display)').style('fill', COL.neu).attr('opacity', 0);
    },
    step(slide, n, instant) {
      const s = svg('stateless-svg');
      s.selectAll('.b1').transition().duration(D(400, instant)).attr('opacity', n >= 1 ? 1 : 0);
      s.selectAll('.b2').transition().duration(D(400, instant)).attr('opacity', n >= 3 ? 1 : 0);
      s.selectAll('.c1').transition().duration(D(500, instant)).attr('opacity', n >= 2 ? 1 : 0);
      s.selectAll('.c2, .c2 text').transition().duration(D(500, instant)).attr('opacity', n >= 3 ? 1 : 0);
    }
  };

  /* ---------- s-window · Context window ---------- */
  C['s-window'] = {
    steps: 3,
    enter(slide, instant) {
      const s = clear('window-svg');
      s.append('rect').attr('x', 60).attr('y', 20).attr('width', 300).attr('height', 520).attr('rx', 18).attr('fill', 'none').attr('stroke', COL.mute).attr('stroke-width', 3);
      text(s, 210, 568, '1,000,000 tokens', 'lbl', 'middle');
      this.fill = s.append('g');
      const blocks = [['sys', 70, 'instructions'], ['proj', 40, 'project notes'], ['conv', 60, 'your files'], ['neu', 26, 'task']];
      let y = 540;
      blocks.forEach(([k, h, t], i) => {
        y -= h + 4;
        const r = this.fill.append('rect').attr('x', 72).attr('y', y).attr('width', 276).attr('height', h).attr('rx', 6).attr('fill', COL[k]).attr('opacity', 0);
        r.transition().delay(D(300 + i * 250, instant)).duration(D(400, instant)).attr('opacity', .9);
        text(this.fill, 380, y + h / 2 + 8, t, 'lbl').attr('opacity', 0).transition().delay(D(300 + i * 250, instant)).duration(D(400, instant)).attr('opacity', 1);
      });
      this.y = y;
      this.noise = s.append('g');
      this.q = s.append('g').attr('transform', 'translate(600,80)').attr('opacity', 0);
      text(this.q, 0, 0, 'quality', 'lbl');
      text(this.q, 0, 220, 'cost per turn', 'lbl');
      this.qbar = this.q.append('rect').attr('y', 20).attr('height', 40).attr('rx', 6).attr('width', 320).attr('fill', COL.ok);
      this.cbar = this.q.append('rect').attr('y', 240).attr('height', 40).attr('rx', 6).attr('width', 60).attr('fill', COL.neu);
    },
    step(slide, n, instant) {
      const full = n >= 3;
      const nd = full ? d3.range(11) : [];
      const sel = this.noise.selectAll('rect').data(nd);
      sel.enter().append('rect').attr('x', 72).attr('width', 276).attr('rx', 4).attr('height', 22).attr('fill', COL.dim).attr('opacity', 0)
        .attr('y', (d) => this.y - (d + 1) * 26)
        .transition().delay((d) => D(d * 70, instant)).duration(D(300, instant)).attr('opacity', .8);
      sel.exit().remove();
      this.q.transition().duration(D(400, instant)).attr('opacity', full ? 1 : 0);
      this.qbar.transition().delay(D(600, instant)).duration(D(1200, instant)).attr('width', full ? 110 : 320).attr('fill', full ? COL.bad : COL.ok);
      this.cbar.transition().delay(D(600, instant)).duration(D(1200, instant)).attr('width', full ? 320 : 60);
    }
  };

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
        text(g, 0, 146, label, '').style('font', '500 23px var(--f-body)').style('fill', COL.mute);
        const dots = g.append('g').selectAll('circle').data(d3.range(n)).enter().append('circle')
          .attr('cx', i => 5 + (i % cols) * 13).attr('cy', i => 172 + Math.floor(i / cols) * 13).attr('r', 4.5).attr('fill', c).attr('opacity', 0);
        return dots;
      };
      this.d1 = block(0, ses.scripted, COL.ok, 'started by my scripts, no chat', 55);
      this.d2 = block(800, ses.interactive, COL.sys, 'started by me, typing', 24);
      const share = Math.round(10 * ses.scripted / Math.max(1, ses.scripted + ses.interactive));
      this.claim = s.append('g').attr('opacity', 0);
      text(this.claim, 1680, 112, share + ' in 10', '', 'end').style('font', '800 88px var(--f-display)').style('fill', COL.ok);
      text(this.claim, 1680, 146, 'now start without me', '', 'end').style('font', '600 26px var(--f-body)');
      text(this.claim, 1680, 180, 'mostly short batch runs: graders, evals', 'lbl', 'end').style('font-size', '19px');
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

  /* ---------- s-loop · Agent loop ---------- */
  C['s-loop'] = {
    steps: 3,
    enter() {
      stop('loop');
      const s = clear('loop-svg');
      const A = arrows(s, 9);
      const node = (x, y, t, sub, c) => {
        const g = s.append('g').attr('transform', `translate(${x},${y})`);
        g.append('rect').attr('x', -150).attr('y', -60).attr('width', 300).attr('height', 120).attr('rx', 24).attr('fill', COL.surf).attr('stroke', c).attr('stroke-width', 3);
        text(g, 0, -4, t, '', 'middle').style('font', '700 38px var(--f-display)');
        text(g, 0, 34, sub, 'lbl', 'middle');
        return g;
      };
      node(380, 110, 'Model', 'decides next step', COL.sys);
      this.tool = node(380, 490, 'Tools', 'shell · files · web', COL.neu).attr('opacity', 0);
      this.a1 = s.append('path').attr('d', 'M560,140 C700,200 700,400 560,460').attr('fill', 'none').attr('stroke', COL.neu).attr('stroke-width', 4).attr('marker-end', A('neu')).attr('opacity', 0);
      this.a2 = s.append('path').attr('d', 'M200,460 C60,400 60,200 200,140').attr('fill', 'none').attr('stroke', COL.ok).attr('stroke-width', 4).attr('marker-end', A('ok')).attr('opacity', 0);
      this.l1 = text(s, 630, 300, 'tool call', 'lbl', 'end').attr('opacity', 0);
      this.l2 = text(s, 130, 300, 'result added', 'lbl', 'start').attr('opacity', 0);
      this.done = text(s, 380, 590, 'until the model says: done', 'lbl', 'middle').attr('opacity', 0);
      this.dot = s.append('circle').attr('r', 12).attr('fill', COL.ink).attr('opacity', 0);
      const ts = clear('tools-svg');
      this.ts = ts;
    },
    spin() {
      const path = d3.path();
      const p1 = this.a1.node(), p2 = this.a2.node();
      const L1 = p1.getTotalLength(), L2 = p2.getTotalLength();
      const run = () => {
        this.dot.attr('opacity', 1).transition().duration(1300).ease(d3.easeLinear)
          .attrTween('transform', () => t => { const p = p1.getPointAtLength(t * L1); return `translate(${p.x},${p.y})`; })
          .transition().duration(1300).ease(d3.easeLinear)
          .attrTween('transform', () => t => { const p = p2.getPointAtLength(t * L2); return `translate(${p.x},${p.y})`; })
          .on('end', run);
      };
      if (!reduce) run();
    },
    step(slide, n, instant) {
      typeLines(document.getElementById('term-loop'), LOOP_LINES, n === 2, instant, 'loopterm', 380, 300);
      fade(this.tool, n >= 1, 400, instant); fade(this.a1, n >= 1, 400, instant); fade(this.l1, n >= 1, 400, instant);
      fade(this.a2, n >= 2, 400, instant); fade(this.l2, n >= 2, 400, instant); fade(this.done, n >= 2, 400, instant);
      if (n >= 2 && !this.spinning && !document.body.dataset.bare) { this.spinning = true; this.spin(); }
      if (n < 2) { this.spinning = false; this.dot.interrupt().attr('opacity', 0); }
      if (n >= 3 && !this.ts.selectAll('rect').size()) {
        const data = (S.tools_top || []).slice(0, 6);
        const y = d3.scaleBand().domain(data.map(d => d[0])).range([0, 390]).padding(.25);
        const x = d3.scaleLinear().domain([0, d3.max(data, d => d[1]) || 1]).range([0, 560]);
        const g = this.ts.selectAll('g').data(data).enter().append('g').attr('transform', d => `translate(0,${y(d[0])})`);
        g.append('text').attr('class', 'lbl-ink').attr('x', 190).attr('y', y.bandwidth() / 2).attr('dy', '.35em').attr('text-anchor', 'end').text(d => d[0]);
        g.append('rect').attr('x', 210).attr('height', y.bandwidth()).attr('rx', 6).attr('fill', (d, i) => i ? COL.conv : COL.neu).attr('width', 0)
          .transition().delay((d, i) => D(i * 90, instant)).duration(D(700, instant)).attr('width', d => x(d[1]));
        g.append('text').attr('class', 'lbl').attr('y', y.bandwidth() / 2).attr('dy', '.35em').attr('x', d => 222 + x(d[1])).text(d => fmt(d[1]));
        text(this.ts, 0, 428, fmt(S.tools_total || 0) + ' tool calls in total', 'lbl');
      }
      if (n < 3) this.ts.selectAll('*').remove();
    },
    leave() { if (this.dot) this.dot.interrupt(); this.spinning = false; }
  };

  /* Real steps from building this deck (this session's own tool calls). */
  const LOOP_LINES = [
    ['p', '> make a 30-minute talk on LLMs for ESD'],
    ['d', 'Read      claudetober.ai.txt'],
    ['d', 'WebFetch  prompt-caching docs'],
    ['d', 'Bash      python scripts/usage_stats.py'],
    ['d', 'Write     src/slides-b.html'],
    ['d', 'Bash      python scripts/eval_deck.py'],
    ['p', '          10/10 checks pass']
  ];

  /* ---------- s-toolcall · Tool call as a key press (generic side-scroller, no game assets) ---------- */
  C['s-toolcall'] = {
    steps: 3,
    enter(slide, instant) {
      stop('game');
      const box = slide.querySelector('.clip');
      if (box && !box.dataset.probed) {
        box.dataset.probed = '1';
        const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.src = box.dataset.clip;
        v.addEventListener('loadeddata', () => { box.classList.add('has-video'); box.innerHTML = ''; box.appendChild(v); const p = v.play(); if (p && p.catch) p.catch(() => { }); });
      }
      const s = clear('game-svg');
      if (s.empty()) return;
      s.append('rect').attr('width', 900).attr('height', 520).attr('fill', '#0d1420');
      d3.range(40).forEach(i => s.append('circle').attr('cx', (i * 97) % 900).attr('cy', (i * 53) % 260).attr('r', 1.6).attr('fill', COL.ink).attr('opacity', .35));
      s.append('rect').attr('x', 0).attr('y', 380).attr('width', 900).attr('height', 140).attr('fill', '#1d2a1f');
      s.append('rect').attr('x', 0).attr('y', 380).attr('width', 900).attr('height', 10).attr('fill', '#3c6b3f');
      s.append('rect').attr('x', 520).attr('y', 250).attr('width', 260).attr('height', 14).attr('rx', 4).attr('fill', '#3c6b3f');
      // hp bar
      s.append('rect').attr('x', 30).attr('y', 30).attr('width', 220).attr('height', 22).attr('rx', 5).attr('fill', COL.surf2);
      this.hp = s.append('rect').attr('x', 30).attr('y', 30).attr('width', 220).attr('height', 22).attr('rx', 5).attr('fill', COL.bad);
      text(s, 30, 78, 'HP', 'lbl');
      // monsters
      this.mobs = s.append('g');
      [[620, 380], [700, 380], [640, 250]].forEach(([x, y]) => {
        const m = this.mobs.append('g').attr('transform', `translate(${x},${y})`);
        m.append('path').attr('d', 'M-26,0 Q-26,-40 0,-40 Q26,-40 26,0 Z').attr('fill', '#e07a3f');
        m.append('circle').attr('cx', -9).attr('cy', -22).attr('r', 4).attr('fill', '#000'); m.append('circle').attr('cx', 9).attr('cy', -22).attr('r', 4).attr('fill', '#000');
      });
      // hero
      this.hero = s.append('g').attr('transform', 'translate(260,380)');
      this.hero.append('rect').attr('x', -16).attr('y', -64).attr('width', 32).attr('height', 44).attr('rx', 8).attr('fill', COL.sys);
      this.hero.append('circle').attr('cy', -78).attr('r', 16).attr('fill', '#f2c9a0');
      this.hero.append('rect').attr('x', -14).attr('y', -20).attr('width', 10).attr('height', 20).attr('fill', '#333');
      this.hero.append('rect').attr('x', 4).attr('y', -20).attr('width', 10).attr('height', 20).attr('fill', '#333');
      this.slash = this.hero.append('path').attr('d', 'M20,-80 A70,70 0 0,1 20,10').attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 6).attr('opacity', 0);
      // key strip
      this.keys = {};
      ['←', '→', 'Alt', 'Ctrl', 'Home'].forEach((k, i) => {
        const g = s.append('g').attr('transform', `translate(${300 + i * 116},440)`);
        g.append('rect').attr('width', 100).attr('height', 50).attr('rx', 8).attr('fill', COL.surf2).attr('stroke', COL.line).attr('stroke-width', 2);
        text(g, 50, 33, k, '', 'middle').style('font', '700 22px var(--f-mono)');
        this.keys[k] = g.select('rect');
      });
      text(s, 30, 470, 'keys pressed:', 'lbl');
      this.loop(instant);
    },
    press(k) { const r = this.keys[k]; if (!r) return; r.interrupt().attr('fill', COL.neu).transition().duration(400).attr('fill', COL.surf2); },
    loop(instant) {
      if (instant || reduce) { this.hp.attr('width', 200); return; }
      const h = this.hero, seq = [
        ['→', () => h.transition().duration(600).attr('transform', 'translate(420,380)')],
        ['Ctrl', () => { this.slash.attr('opacity', 1).transition().duration(300).attr('opacity', 0); this.mobs.select('g').transition().duration(300).attr('opacity', .2); }],
        ['Alt', () => h.transition().duration(300).attr('transform', 'translate(470,300)').transition().duration(300).attr('transform', 'translate(560,250)')],
        ['Ctrl', () => { this.slash.attr('opacity', 1).transition().duration(300).attr('opacity', 0); this.hp.transition().duration(500).attr('width', 90); }],
        ['Home', () => this.hp.transition().duration(500).attr('width', 220)],
        ['←', () => { h.transition().duration(900).attr('transform', 'translate(260,380)'); this.mobs.selectAll('g').transition().duration(600).attr('opacity', 1); }]
      ];
      let i = 0;
      const tick = () => { const [k, fn] = seq[i % seq.length]; this.press(k); fn(); i++; later('game', tick, 900); };
      tick();
    },
    step(slide, n, instant) {
      if (this.st === n) return; this.st = n;
      typeLines(document.getElementById('term-bot'), BOT, n >= 1, instant, 'bot', 49);
      typeLines(document.getElementById('term-agent'), AGENT, n >= 2, instant, 'agent', 105);
    },
    leave() { stop('game'); stop('bot'); stop('agent'); this.st = undefined; }
  };
  /* Verbatim lines from my MapleStory bot (two of the five key presses left out). */
  const BOT = [
    ['', 'if cnt2 > 460:'],
    ['', '    if random.random() > 0.5:'],
    ['', '        time.sleep(random.random() * 2)'],
    ['n', '        interception.press("f")'],
    ['', '        time.sleep(1.2 + random.random() * 1)'],
    ['n', '        interception.press("g")'],
    ['', '        if random.random() > 0.05:'],
    ['', '            time.sleep(0.8 + random.random() * 1.4)'],
    ['n', '            interception.press("1")'],
    ['d', '        # ... then "3" and "7" the same way'],
    ['', '        cnt2 = 0']
  ];
  const AGENT = [['p', '> model decides: call("Bash", "pytest")']];

  /* ---------- s-stack · Stack centrepiece ---------- */
  C['s-stack'] = {
    steps: 7,
    enter() {
      const s = clear('stack-svg');
      const A = arrows(s, 9);
      this.g = s.append('g').attr('transform', 'translate(0,10)');
      let y = 0;
      this.rows = LAYERS.map((L, i) => {
        const g = this.g.append('g').attr('transform', `translate(0,${y})`).attr('opacity', 0);
        g.append('rect').attr('width', 760).attr('height', L.h).attr('rx', 10).attr('fill', COL[L.k]).attr('opacity', .9);
        text(g, 24, Math.min(L.h / 2 + 10, 40), L.t, '').style('font', '600 26px var(--f-body)').style('fill', '#000');
        text(g, 790, L.h / 2 + 8, L.scope, 'lbl-ink');
        const r = { g, y, L }; y += L.h + 8; return r;
      });
      this.h = y;
      this.top = text(s, 0, 0, '', 'lbl');
      const m = s.append('g').attr('transform', 'translate(1330,250)').attr('opacity', 0);
      m.append('rect').attr('x', -140).attr('y', -70).attr('width', 280).attr('height', 140).attr('rx', 28).attr('fill', COL.surf).attr('stroke', COL.ink).attr('stroke-width', 3);
      text(m, 0, 14, 'Model', '', 'middle').style('font', '700 44px var(--f-display)');
      this.model = m;
      this.arrow = s.append('path').attr('d', 'M1110,250 L1180,250').attr('stroke', COL.mute).attr('stroke-width', 4).attr('marker-end', A('arr')).attr('opacity', 0);
      this.reply = s.append('g').attr('transform', 'translate(1230,460)').attr('opacity', 0);
      this.reply.append('rect').attr('width', 200).attr('height', 54).attr('rx', 10).attr('fill', COL.ok);
      text(this.reply, 100, 36, 'reply', '', 'middle').style('font', '700 26px var(--f-mono)').style('fill', '#000');
      this.loopLbl = s.append('g').attr('opacity', 0);
      text(this.loopLbl, 1330, 380, 'reply appended to the conversation', 'lbl', 'middle');
      text(this.loopLbl, 1330, 414, 'whole stack re-sent next turn', 'lbl', 'middle');
    },
    step(slide, n, instant) {
      this.rows.forEach((r, i) => r.g.transition().duration(D(450, instant)).attr('opacity', n >= i + 1 ? 1 : 0));
      fade(this.model, n >= 6, 400, instant); fade(this.arrow, n >= 6, 400, instant);
      if (n >= 6) {
        const conv = this.rows[3];
        if (n >= 7) {
          this.reply.attr('opacity', 1).transition().duration(D(900, instant)).attr('transform', `translate(24,${10 + conv.y + conv.L.h - 64})`);
        } else {
          this.reply.interrupt().attr('transform', 'translate(1230,460)').transition().delay(D(300, instant)).duration(D(400, instant)).attr('opacity', 1);
        }
      } else this.reply.interrupt().attr('opacity', 0).attr('transform', 'translate(1230,460)');
      fade(this.loopLbl, n >= 7, 400, instant);
    }
  };

  /* ---------- s-skills · Skill spec typing (verbatim from prompts.txt, VIDEOS) ---------- */
  const SPEC = [
    ['p', 'Make a 30 s vertical (1080×1920, 30 fps) Apple-style'],
    ['p', 'product film for my app.'],
    ['d', 'Inputs: screenshots in ./screens, phone model ./phone.glb'],
    ['', '- three.js in headless Chromium (Playwright), one frame'],
    ['', '  per timestamp, encoded with ffmpeg. Deterministic.'],
    ['', '- Phone floats in a pure black void. Titanium and glass,'],
    ['', '  lit by light strips: warm rim behind-left, cool behind-right.'],
    ['', '- Screenshots as a canvas texture, never redrawn.'],
    ['', '- Swap screens only while the phone is edge-on.'],
    ['', '- One camera move per shot. Spins get motion blur.'],
    ['', '- Music at 100 BPM, generated in code; cuts on the beat.'],
    ['', '- Titles: Inter Display Semibold ~90 px.'],
    ['d', 'Structure: cold open → hero reveal → 3–5 feature shots'],
    ['d', '           → fan of 3 phones → logo → fade to black.']
  ];
  C['s-skills'] = {
    steps: 3,
    enter() { const p = document.getElementById('term-spec'); if (p) p.classList.add('verbatim'); },
    step(slide, n, instant) {
      if (this.shown !== (n >= 2)) {
        this.shown = n >= 2;
        typeLines(document.getElementById('term-spec'), SPEC, n >= 2, instant, 'spec', 56);
        // the clock runs from 21:00 to 02:47 while the spec types out
        const clock = document.getElementById('meme-clock');
        if (clock) {
          const show = m => { m = Math.round(m) % 1440; clock.textContent = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
          const end = 21 * 60 + 347;
          if (n < 2) show(21 * 60);
          else if (instant || reduce) show(end);
          else { const tm = d3.timer(e => { const k = Math.min(1, e / 2600); show(21 * 60 + 347 * d3.easeCubicOut(k)); if (k >= 1) tm.stop(); }); (timers.spec = timers.spec || []).push(tm); }
        }
      }
    },
    leave() { stop('spec'); this.shown = undefined; }
  };

  /* ---------- s-determinism · Determinism: slider + counters ---------- */
  C['s-determinism'] = {
    steps: 5,
    enter(slide, instant) {
      const s = clear('det-svg');
      const lg = s.append('defs').append('linearGradient').attr('id', 'detg2');
      lg.append('stop').attr('offset', '0%').attr('stop-color', COL.proj); lg.append('stop').attr('offset', '100%').attr('stop-color', COL.ok);
      s.append('rect').attr('x', 0).attr('y', 64).attr('width', 1680).attr('height', 18).attr('rx', 9).attr('fill', 'url(#detg2)');
      text(s, 0, 36, 'JUDGMENT · the agent (or you)', 'lbl-ink');
      text(s, 1680, 36, 'COUNTING · a script', 'lbl-ink', 'end');
      this.ex = s.append('g').attr('opacity', 0);
      [[230, 'is the argument convincing?'], [600, 'which result matters most?'], [1170, 'how many sources are closed?'], [1540, 'do the numbers match?']].forEach(([x, t]) => {
        this.ex.append('circle').attr('cx', x).attr('cy', 73).attr('r', 12).attr('fill', COL.ink);
        text(this.ex, x, 130, t, 'lbl', 'middle').style('font-size', '22px');
      });
      ['cnt-numbers', 'cnt-closed', 'cnt-rules'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '0'; });
      this.done = {};
    },
    step(slide, n, instant) {
      fade(this.ex, n >= 1, 600, instant);
      [[2, 'cnt-numbers', 1126], [3, 'cnt-closed', 10], [4, 'cnt-rules', 12]].forEach(([k, id, v]) => {
        if (n >= k && !this.done[id]) { this.done[id] = true; countUp(document.getElementById(id), v, instant); }
        if (n < k) { this.done[id] = false; const e = document.getElementById(id); if (e) e.textContent = '0'; }
      });
    }
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
    steps: 6,
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
      this.mates = [boat('mid', 1426, g => brig(g, 'APP'), 0.6), boat('mid', 1588, g => brig(g, 'PAPER'), 0.6), boat('back', 1376, dinghy, 0.42), boat('back', 1508, dinghy, 0.42), boat('back', 1650, dinghy, 0.42)];
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
      text(this.capMates, 1507, R.mid + 44, 'second mates', '', 'middle').style('font', '700 20px var(--f-mono)').style('fill', COL.proj);
      text(this.capMates, 1507, R.mid + 70, 'each runs a whole project', 'lbl', 'middle').style('font-size', '19px');
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
      this.mates.forEach(b => fade(b.g, n >= 4, 700, instant)); fade(this.capMates, n >= 4, 700, instant);
      fade(this.shore, n >= 5, 700, instant); fade(this.beamG, n >= 5, 700, instant);
      fade(this.dock, n >= 6, 700, instant);
      if (reduce) this.frame(0);
    },
    leave() { stop('sea'); }
  };

  /* ---------- s-trust · Trust bars ---------- */
  C['s-trust'] = {
    steps: 2,
    enter() { clear('trust-svg'); },
    step(slide, n, instant) {
      const s = svg('trust-svg');
      if (n < 2) { s.selectAll('*').remove(); return; }
      if (s.selectAll('rect').size()) return;
      const data = [['Human review', 13.6, COL.bad], ['Auto mode', 89, COL.ok]];
      const x = d3.scaleLinear().domain([0, 100]).range([0, 640]);
      data.forEach(([t, v, c], i) => {
        const g = s.append('g').attr('transform', `translate(0,${20 + i * 100})`);
        text(g, 230, 42, t, 'lbl-ink', 'end');
        g.append('rect').attr('x', 250).attr('height', 64).attr('rx', 8).attr('fill', c).attr('width', 0).transition().delay(D(i * 200, instant)).duration(D(900, instant)).attr('width', x(v));
        text(g, 262 + x(v), 44, v + '%', '').style('font', '700 32px var(--f-display)');
      });
    }
  };

  /* ---------- s-cache · Cache columns ---------- */
  C['s-cache'] = {
    steps: 5,
    enter() {
      const s = clear('cache-svg');
      this.cols = s.append('g');
      this.turns = [];
      const base = [['sys', 130], ['proj', 44], ['sess', 30]];
      const mk = (turn) => { const conv = []; for (let i = 1; i < turn; i++) conv.push(['conv', 34]); return base.concat(conv, [['neu', 26]]); };
      // column specs: segments + which are cached
      this.specs = [
        { label: 'Turn 1', segs: mk(1), cachedUpTo: 0, step: 1 },
        { label: 'Turn 2', segs: mk(2), cachedUpTo: mk(2).length - 1, step: 2 },
        { label: 'Turn 3', segs: mk(3), cachedUpTo: mk(3).length - 1, step: 3 },
        { label: 'A · edit the top', segs: mk(4), cachedUpTo: 0, step: 4, mark: 0 },
        { label: 'B · edit near the end', segs: mk(4), cachedUpTo: mk(4).length - 2, step: 5, mark: mk(4).length - 2 }
      ];
      // turn 4 is one turn with two alternative futures: a bracket over both columns, and "or" between them
      this.t4 = s.append('g').attr('opacity', 0);
      this.t4.append('path').attr('d', 'M1008,46 L1008,36 L1604,36 L1604,46').attr('fill', 'none').attr('stroke', COL.bad).attr('stroke-width', 2.5);
      const hdr = text(this.t4, 1306, 24, 'Turn 4 · two alternatives', 'lbl-ink', 'middle').style('fill', COL.bad);
      void hdr;
      this.or = text(s, 1306, 250, 'or', '', 'middle').style('font', '700 34px var(--f-display)').style('fill', COL.mute).attr('opacity', 0);
    },
    step(slide, n, instant) {
      const s = svg('cache-svg');
      fade(this.t4, n >= 4, 400, instant); fade(this.or, n >= 5, 400, instant);
      this.specs.forEach((sp, ci) => {
        let g = this.cols.select('.col' + ci);
        if (n < sp.step) { g.remove(); return; }
        if (!g.empty()) return;
        g = this.cols.append('g').attr('class', 'col' + ci).attr('transform', `translate(${ci * 336},0)`).attr('opacity', 0);
        g.transition().duration(D(400, instant)).attr('opacity', 1);
        text(g, 0, 70, sp.label, 'lbl-ink').style('fill', sp.mark !== undefined ? COL.bad : COL.ink);
        let y = 88, paid = 0, total = 0;
        sp.segs.forEach(([k, h], i) => {
          const cached = i < sp.cachedUpTo;
          const r = g.append('rect').attr('x', 0).attr('y', y).attr('width', 260).attr('height', h).attr('rx', 5)
            .attr('fill', COL[k]).attr('stroke', 'none');
          r.transition().delay(D(400 + i * 60, instant)).duration(D(400, instant))
            .attr('fill', cached ? COL.ok : COL.neu).attr('opacity', cached ? .85 : 1);
          if (sp.mark === i) {
            g.append('path').attr('d', `M-14,${y + 4} l10,${h / 2 - 4} l-10,${h / 2 - 4}`).attr('fill', COL.bad);
          }
          paid += cached ? h * 0.05 : h; total += h;
          y += h + 3;
        });
        const w = 260 * paid / total;
        // faint outline = full price; the orange fill = what this turn actually costs
        g.append('rect').attr('x', 0).attr('y', 520).attr('height', 22).attr('rx', 4).attr('width', 260).attr('fill', 'none').attr('stroke', COL.mute).attr('stroke-dasharray', '5 4').attr('opacity', .7);
        g.append('rect').attr('x', 0).attr('y', 520).attr('height', 22).attr('rx', 4).attr('fill', COL.neu).attr('width', 0)
          .transition().delay(D(900, instant)).duration(D(500, instant)).attr('width', w);
        text(g, 0, 512, 'paid ' + Math.round(100 * paid / total) + '% of full price', 'lbl').style('font-size', '18px');
        text(g, 260, 566, '100%', 'lbl', 'end').style('font-size', '16px');
      });
    }
  };

  /* ---------- s-append · Append without editing ---------- */
  C['s-append'] = {
    steps: 4,
    enter() {
      const s = clear('append-svg');
      const A = arrows(s, 9);
      let y = 10;
      this.y = {};
      [['sys', 130], ['proj', 50], ['sess', 40], ['conv', 120]].forEach(([k, h]) => {
        s.append('rect').attr('x', 0).attr('y', y).attr('width', 400).attr('height', h).attr('rx', 8).attr('fill', COL.ok).attr('opacity', .8);
        this.y[k] = y; y += h + 6;
      });
      text(s, 410, 30, 'cached', 'lbl').style('fill', COL.ok);
      this.rem = s.append('g').attr('opacity', 0);
      this.rem.append('rect').attr('x', 0).attr('y', y).attr('width', 400).attr('height', 40).attr('rx', 8).attr('fill', COL.neu);
      text(this.rem, 200, y + 28, '<system-reminder> date, plan mode', '', 'middle').style('font', '600 18px var(--f-mono)').style('fill', '#000');
      this.stubs = s.append('g').attr('opacity', 0);
      d3.range(9).forEach(i => this.stubs.append('rect').attr('x', 20 + i * 40).attr('y', 90).attr('width', 30).attr('height', 34).attr('rx', 4).attr('fill', '#000').attr('opacity', .45));
      text(this.stubs, 410, 112, 'tool stubs', 'lbl');
      this.fork = s.append('g').attr('opacity', 0);
      this.fork.append('path').attr('d', `M400,${y - 100} C470,${y - 100} 470,${y + 110} 400,${y + 110}`).attr('fill', 'none').attr('stroke', COL.mute).attr('stroke-width', 2.5).attr('marker-end', A('arr'));
      this.fork.append('rect').attr('x', 0).attr('y', y + 90).attr('width', 400).attr('height', 40).attr('rx', 8).attr('fill', COL.sys);
      text(this.fork, 200, y + 118, 'same stack + "summarise this"', '', 'middle').style('font', '600 18px var(--f-mono)').style('fill', '#000');
      this.sw = s.append('g').attr('opacity', 0);
      text(this.sw, 0, y + 190, 'Opus → Haiku mid-session = cold cache', '', 'start').style('font', '600 22px var(--f-mono)').style('fill', COL.bad);
    },
    step(slide, n, instant) { fade(this.rem, n >= 1, 400, instant); fade(this.stubs, n >= 2, 400, instant); fade(this.fork, n >= 3, 400, instant); fade(this.sw, n >= 4, 400, instant); }
  };

  /* ---------- s-receipt · Bill with breakdown ---------- */
  C['s-receipt'] = {
    steps: 3,
    enter() {
      d3.select('#bill-svg').selectAll('*').remove();
      const bf = document.getElementById('bill-factor');
      if (bf && tot.cost_actual_usd) bf.textContent = Math.round(tot.cost_nocache_usd / tot.cost_actual_usd) + '×';
      const tt = document.getElementById('tok-total'); if (tt && tot.processed) tt.textContent = (tot.processed / 1e9).toFixed(2) + 'B';
      const rel = document.getElementById('tok-relate');
      if (rel && tot.processed) rel.textContent = 'tokens processed ≈ ' + fmt(Math.round(tot.processed * 0.75 / 250000 / 1000) * 1000) + ' engineering textbooks (250k words each)';
    },
    step(slide, n, instant) {
      const s = d3.select('#bill-svg');
      if (n < 2) { s.selectAll('*').remove(); return; }
      if (s.selectAll('rect').size()) return;
      const a = tot.cost_nocache_usd || 0, act = tot.cost_actual_usd || 0;
      const parts = [['cache reads', tot.cost_cacheread_usd || 0, COL.ok], ['cache writes', Math.max(0, act - (tot.cost_cacheread_usd || 0) - (tot.cost_output_usd || 0)), COL.sess], ['output', tot.cost_output_usd || 0, COL.neu]];
      const x = d3.scaleLinear().domain([0, a]).range([0, 640]);
      const g1 = s.append('g').attr('transform', 'translate(0,30)');
      text(g1, 0, 0, 'Without caching', 'lbl-ink');
      g1.append('rect').attr('y', 18).attr('height', 96).attr('rx', 10).attr('fill', COL.conv).attr('width', 0).transition().duration(D(1000, instant)).attr('width', x(a));
      const l1 = text(g1, x(a) + 20, 86, '$' + fmt(Math.round(a)), '').style('font', '800 60px var(--f-display)');
      const g2 = s.append('g').attr('transform', 'translate(0,220)');
      text(g2, 0, 0, 'With caching', 'lbl-ink');
      let cx = 0;
      parts.forEach(([t, v, c], i) => {
        const w = x(v);
        g2.append('rect').attr('x', cx).attr('y', 18).attr('height', 96).attr('fill', c).attr('width', 0).transition().delay(D(500 + i * 250, instant)).duration(D(600, instant)).attr('width', w);
        const lg = g2.append('g').attr('transform', `translate(${cx},${150 + i * 34})`).attr('opacity', 0);
        lg.append('rect').attr('width', 16).attr('height', 16).attr('y', -13).attr('fill', c);
        text(lg, 26, 0, `${t} $${fmt(Math.round(v))}${i ? ' · never discounted' : ' · 0.05–0.1× price'}`, 'lbl');
        lg.transition().delay(D(900 + i * 250, instant)).duration(D(300, instant)).attr('opacity', 1);
        cx += w;
      });
      text(g2, cx + 20, 86, '$' + fmt(Math.round(act)), '').style('font', '800 60px var(--f-display)').attr('opacity', 0).transition().delay(D(1200, instant)).duration(D(300, instant)).attr('opacity', 1);
      l1.attr('opacity', 1);
    }
  };

  /* ---------- s-compact · Compaction: the same context window as the opening, filled to 95%, then wiped down to a summary ----------
     Instructions stay; the conversation dissolves; a few key lines condense into one summary block (about 87% cleared). */
  C['s-compact'] = {
    steps: 3,
    enter(slide, instant) {
      stop('still');
      const s = clear('compact-svg');
      this.s = s;
      const WX = 40, WY = 44, WW = 320, WH = 520, ROWS = 40, RH = 12;
      this.geo = { WX, WY, WW, WH, ROWS, RH };
      text(s, WX, 28, 'CONTEXT WINDOW', 'lbl');
      s.append('rect').attr('x', WX).attr('y', WY).attr('width', WW).attr('height', WH).attr('rx', 16).attr('fill', 'none').attr('stroke', COL.mute).attr('stroke-width', 2.5);
      const rng = d3.randomLcg(11);
      const KEY = [9, 17, 26, 33];
      this.rows = d3.range(ROWS - 2).map(i => {
        const kind = i < 3 ? 'sys' : KEY.includes(i) ? 'key' : (rng() < 0.28 ? 'tool' : 'conv');
        return { i, kind, w: i < 3 ? WW - 24 : 120 + rng() * (WW - 144) };
      });
      this.blocks = s.append('g').selectAll('rect').data(this.rows).enter().append('rect')
        .attr('x', WX + 12).attr('y', d => WY + 10 + d.i * RH).attr('height', RH - 3).attr('rx', 3).attr('width', d => d.w)
        .attr('fill', d => d.kind === 'sys' ? COL.sys : d.kind === 'tool' ? COL.neu : d.kind === 'key' ? COL.ink : COL.conv)
        .attr('opacity', 0);
      this.summary = s.append('g').attr('opacity', 0);
      this.summary.append('rect').attr('x', WX + 12).attr('y', WY + 10 + 3 * RH).attr('width', WW - 24).attr('height', 2 * RH - 3).attr('rx', 4).attr('fill', COL.ok);
      text(this.summary, WX + 24, WY + 10 + 3 * RH + 16, 'summary', '').style('font', '700 15px var(--f-mono)').style('fill', '#000');
      ['goal: 40 flights, 12 gates', 'decided: SQ322 → C4', 'open: towing times'].forEach((t, i) => text(this.summary, WX + 22, WY + 104 + i * 28, t, '').style('font', '500 17px var(--f-mono)').style('fill', COL.ok));
      // faint outlines where the conversation used to be
      this.ghost = s.append('g').attr('opacity', 0);
      this.rows.filter(d => d.i >= 17).forEach(d => this.ghost.append('rect').attr('x', WX + 12).attr('y', WY + 10 + d.i * RH).attr('height', RH - 3).attr('rx', 3).attr('width', d.w).attr('fill', 'none').attr('stroke', COL.line).attr('stroke-dasharray', '3 3'));
      this.dust = s.append('g');
      this.beam = s.append('rect').attr('x', WX + 4).attr('width', WW - 8).attr('height', 4).attr('rx', 2).attr('fill', COL.bad).attr('opacity', 0);
      // fill gauge
      const GX = 392;
      s.append('rect').attr('x', GX).attr('y', WY).attr('width', 26).attr('height', WH).attr('rx', 8).attr('fill', COL.surf2);
      this.gauge = s.append('rect').attr('x', GX).attr('width', 26).attr('rx', 8);
      this.gLbl = text(s, GX + 40, WY + 20, '', '').style('font', '800 30px var(--f-display)');
      this.gSub = text(s, GX + 40, WY + 48, '', 'lbl').style('font-size', '19px');
      this.cut = text(s, GX + 40, WY + WH - 56, '−87%', '').style('font', '800 58px var(--f-display)').style('fill', COL.bad).attr('opacity', 0);
      this.cutSub = text(s, GX + 40, WY + WH - 24, 'of the window cleared', 'lbl').style('font-size', '19px').attr('opacity', 0);
      // what the summary drops, struck through as it goes
      this.lost = s.append('g');
      text(this.lost, 552, 150, 'LOST', 'lbl').style('fill', COL.bad).attr('class', 'lbl lost-h').attr('opacity', 0);
      this.lostItems = ['exact error messages', 'attempts that failed', 'who asked for what', 'files it had read', 'numbers not written down'].map((t, i) => {
        const g = this.lost.append('g').attr('opacity', 0);
        const tx = text(g, 552, 190 + i * 38, t, '').style('font', '500 21px var(--f-body)').style('fill', COL.mute);
        g.append('line').attr('x1', 552).attr('y1', 183 + i * 38).attr('y2', 183 + i * 38).attr('stroke', COL.bad).attr('stroke-width', 2).attr('x2', 552).datum(tx);
        return g;
      });
      this.setGauge(0, true);
      this.state = 'empty';
      this.fill(instant);
    },
    setGauge(p, instant, ms) {
      const { WY, WH } = this.geo;
      const c = p > 0.8 ? COL.bad : p > 0.5 ? COL.neu : COL.ok;
      this.gauge.interrupt().transition().duration(D(ms || 300, instant)).attr('y', WY + WH * (1 - p)).attr('height', WH * p).attr('fill', c);
      this.gLbl.text(Math.round(p * 100) + '% full').style('fill', c);
      this.gSub.text(p > 0.8 ? 'window full: compact now' : p > 0.01 ? 'instructions + summary' : '');
    },
    fill(instant) {
      this.blocks.interrupt().attr('x', this.geo.WX + 12).attr('width', d => d.w).attr('y', d => this.geo.WY + 10 + d.i * this.geo.RH).attr('height', this.geo.RH - 3)
        .transition().delay(d => D(d.i * 32, instant)).duration(D(200, instant)).attr('opacity', .9);
      this.summary.interrupt().attr('opacity', 0);
      [this.cut, this.cutSub, this.beam].forEach(e => e.interrupt().attr('opacity', 0));
      this.lost.select('.lost-h').attr('opacity', 0);
      this.lostItems.forEach(g => { g.interrupt().attr('opacity', 0); g.select('line').attr('x2', 552); });
      this.ghost.interrupt().attr('opacity', 0);
      this.dust.selectAll('*').interrupt().remove();
      if (instant || reduce) this.setGauge(0.95, true);
      else { this.gauge.attr('y', this.geo.WY + this.geo.WH).attr('height', 0); this.setGauge(0.95, false, 1300); }
      this.state = 'full';
    },
    compact(instant) {
      const { WX, WY, RH } = this.geo;
      const quick = instant || reduce;
      const T = ms => quick ? 0 : ms;
      const rowAt = i => T(150 + (i - 3) / 35 * 1100);
      if (!quick) this.beam.attr('opacity', .9).attr('y', WY + 8).transition().duration(1250).ease(d3.easeLinear).attr('y', WY + this.geo.WH - 12).transition().duration(200).attr('opacity', 0);
      const rnd = d3.randomLcg(5);
      this.blocks.each((d, k, nodes) => {
        const b = d3.select(nodes[k]);
        if (d.kind === 'sys') return;
        if (d.kind === 'key') {
          b.transition().delay(T(1450)).duration(T(500)).ease(d3.easeCubicInOut).attr('y', WY + 10 + 3 * RH + 4).attr('opacity', 0);
          return;
        }
        b.transition().delay(rowAt(d.i)).duration(T(180)).attr('opacity', 0);
        if (!quick) d3.range(5).forEach(() => {
          const x0 = WX + 12 + rnd() * d.w, y0 = WY + 10 + d.i * RH;
          this.dust.append('rect').attr('x', x0).attr('y', y0).attr('width', 5).attr('height', 5).attr('fill', d.kind === 'tool' ? COL.neu : COL.conv).attr('opacity', 0)
            .transition().delay(rowAt(d.i)).duration(0).attr('opacity', .9)
            .transition().duration(900 + rnd() * 600).ease(d3.easeCubicOut)
            .attr('x', x0 + 120 + rnd() * 260).attr('y', y0 - 40 - rnd() * 120).attr('opacity', 0).remove();
        });
      });
      this.summary.transition().delay(T(1800)).duration(T(400)).attr('opacity', 1);
      this.ghost.transition().delay(T(1300)).duration(T(600)).attr('opacity', 0.6);
      setTimeoutD(() => this.setGauge(0.12, quick, 800), T(1500));
      this.cut.transition().delay(T(2100)).duration(T(400)).attr('opacity', 1);
      this.cutSub.transition().delay(T(2100)).duration(T(400)).attr('opacity', 1);
      this.lost.select('.lost-h').transition().delay(T(200)).duration(T(300)).attr('opacity', 1);
      this.lostItems.forEach((g, i) => {
        g.transition().delay(T(300 + i * 230)).duration(T(250)).attr('opacity', 1);
        const ln = g.select('line'), tx = ln.datum();
        ln.transition().delay(T(500 + i * 230)).duration(T(300)).attr('x2', 552 + tx.node().getComputedTextLength());
      });
      this.state = 'compacted';
      function setTimeoutD(fn, ms) { if (!ms) fn(); else later('still', fn, ms); }
    },
    step(slide, n, instant) {
      if (n >= 1 && this.state !== 'compacted') this.compact(instant);
      if (n < 1 && this.state === 'compacted') { stop('still'); this.fill(true); }
      loopClips(slide, true);
    },
    leave(slide) { stop('still'); if (slide) loopClips(slide, false); }
  };

  /* ---------- s-hill · Hill-climb loop ---------- */
  C['s-hill'] = {
    steps: 1,
    enter() {
      stop('climb');
      const s = clear('climb-svg');
      const A = arrows(s);
      const nodes = [['change one thing', 170, 110], ['run the evals', 600, 110], ['score went up?', 600, 300], ['keep it', 370, 470], ['revert', 720, 470]];
      this.nodes = nodes.map(([t, x, y], i) => {
        const g = s.append('g').attr('transform', `translate(${x},${y})`).attr('opacity', 0);
        g.append('rect').attr('x', -130).attr('y', -38).attr('width', 260).attr('height', 76).attr('rx', 18).attr('fill', COL.surf).attr('stroke', i === 3 ? COL.ok : i === 4 ? COL.bad : COL.mute).attr('stroke-width', 3);
        text(g, 0, 10, t, '', 'middle').style('font', '600 28px var(--f-body)');
        return g;
      });
      const e = 0;
      this.edges = s.append('g').attr('opacity', 0);
      this.edges.append('path').attr('d', 'M300,110 L466,110').attr('stroke', COL.mute).attr('stroke-width', 3).attr('marker-end', A('arr'));
      this.edges.append('path').attr('d', 'M600,148 L600,258').attr('stroke', COL.mute).attr('stroke-width', 3).attr('marker-end', A('arr'));
      this.edges.append('path').attr('d', 'M560,338 L430,428').attr('stroke', COL.ok).attr('stroke-width', 3).attr('marker-end', A('ok'));
      this.edges.append('path').attr('d', 'M640,338 L690,428').attr('stroke', COL.bad).attr('stroke-width', 3).attr('fill', 'none').attr('marker-end', A('arr'));
      this.edges.append('path').attr('d', 'M240,470 C70,470 50,230 120,152').attr('stroke', COL.ok).attr('stroke-width', 3).attr('fill', 'none').attr('marker-end', A('ok'));
      this.edges.append('path').attr('d', 'M850,470 C866,470 866,24 600,24 L190,24 L176,66').attr('stroke', COL.bad).attr('stroke-width', 2).attr('stroke-dasharray', '6 6').attr('fill', 'none').attr('marker-end', A('arr'));
      text(this.edges, 470, 400, 'yes', 'lbl').style('fill', COL.ok);
      text(this.edges, 690, 380, 'no', 'lbl').style('fill', COL.bad);
      this.score = s.append('g').attr('transform', 'translate(40,580)').attr('opacity', 0);
      text(this.score, 0, 0, 'score', 'lbl');
      this.scoreVal = text(this.score, 90, 4, '74%', '').style('font', '800 34px var(--f-display)').style('fill', COL.ok);
      text(this.score, 210, 0, 'illustrative: a few kept changes, many reverts', 'lbl');
      void e;
    },
    step(slide, n, instant) {
      const on = n >= 1;
      this.nodes.forEach((g, i) => g.transition().delay(D(on ? i * 120 : 0, instant)).duration(D(400, instant)).attr('opacity', on ? 1 : 0));
      fade(this.edges, on, 600, instant); fade(this.score, on, 600, instant);
      stop('climb');
      if (!on || instant || reduce) { this.scoreVal.text(on ? '93%' : '74%'); return; }
      const seq = [[1, 74], [0, 74], [1, 79], [0, 79], [0, 79], [1, 84], [0, 84], [1, 88], [1, 91], [0, 91], [1, 93]];
      let k = 0;
      const tick = () => {
        if (k >= seq.length) return;
        const [keep, v] = seq[k++];
        const hl = this.nodes[keep ? 3 : 4].select('rect');
        hl.transition().duration(150).attr('fill', keep ? '#123d22' : '#3d1212').transition().duration(500).attr('fill', COL.surf);
        this.scoreVal.text(v + '%');
        later('climb', tick, 700);
      };
      later('climb', tick, 900);
    },
    leave() { stop('climb'); }
  };

  /* ---------- Anthropic's hill-climb chart: drawn by s-hill-ex, which adds the steps beside it ---------- */
  const hillChart = {
    enter() {
      const s = clear('hill-svg');
      const m = { l: 110, r: 30, t: 56, b: 90 };
      const W = 1080 - m.l - m.r, H = 600 - m.t - m.b;
      const g = s.append('g').attr('transform', `translate(${m.l},${m.t})`);
      const x = d3.scaleLinear().domain([5, 0.5]).range([0, W]);
      const y = d3.scaleLinear().domain([70, 100]).range([H, 0]);
      // landscape shading: better toward top-right
      const defs = s.append('defs');
      const rg = defs.append('radialGradient').attr('id', 'hillg').attr('cx', '100%').attr('cy', '0%').attr('r', '120%');
      rg.append('stop').attr('offset', '0%').attr('stop-color', COL.ok).attr('stop-opacity', .22);
      rg.append('stop').attr('offset', '100%').attr('stop-color', COL.ok).attr('stop-opacity', 0);
      g.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#hillg)');
      g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => d + '¢').tickSize(0).tickPadding(12))
        .call(a => a.select('.domain').attr('stroke', COL.line)).selectAll('text').attr('class', 'lbl');
      g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(d => d + '%').tickSize(-W).tickPadding(12))
        .call(a => a.select('.domain').remove()).call(a => a.selectAll('line').attr('stroke', COL.line).attr('stroke-opacity', .5)).selectAll('text').attr('class', 'lbl');
      text(g, W, H + 70, 'cost per ticket → cheaper', 'lbl', 'end');
      text(g, -100, -30, 'accuracy', 'lbl');
      this.pts = [
        { c: 4.6, a: 74.4, t: 'start' },
        { c: 1.9, a: 87.8, t: 'audit prompt' },
        { c: 1.0, a: 88.9, t: 'cheaper model', below: true },
        { c: 1.0, a: 98.9, t: 'routing rules' }
      ];
      this.g = g; this.x = x; this.y = y;
      this.path = g.append('path').attr('fill', 'none').attr('stroke', COL.ok).attr('stroke-width', 4);
      this.dots = g.append('g');
    },
    step(slide, n, instant) {
      const k = Math.min(n, 4);
      const pts = this.pts.slice(0, k);
      this.path.transition().duration(D(600, instant)).attr('d', pts.length > 1 ? d3.line().x(d => this.x(d.c)).y(d => this.y(d.a))(pts) : null);
      const sel = this.dots.selectAll('g').data(pts, d => d.t);
      sel.exit().remove();
      const en = sel.enter().append('g').attr('transform', d => `translate(${this.x(d.c)},${this.y(d.a)})`).attr('opacity', 0);
      en.append('circle').attr('r', 13).attr('fill', (d, i) => COL.ok).attr('stroke', COL.bg).attr('stroke-width', 3);
      en.append('text').attr('class', 'lbl-ink').attr('x', d => d.c > 2 ? 22 : -22).attr('text-anchor', d => d.c > 2 ? 'start' : 'end').attr('y', d => d.below ? 44 : -20)
        .text(d => d.a + '% · ' + d.c + '¢');
      en.append('text').attr('class', 'lbl').attr('x', d => d.c > 2 ? 22 : -22).attr('text-anchor', d => d.c > 2 ? 'start' : 'end').attr('y', d => d.below ? 72 : 12).style('font-size', '19px').text(d => d.t);
      en.transition().duration(D(500, instant)).attr('opacity', 1);
    }
  };

  /* ---------- s-hill-ex · Hill-climb examples: Anthropic's chart, then each step beside it and the held-out check ---------- */
  /* The steps of Anthropic's own climb (L. Martin, claude.dev): each chart point gets its change on the right,
     then the held-out check that shows the climb did not just overfit the 30 search tickets. */
  const CLIMB = [
    ['74.4% · 4.6¢', ['Start: Opus 4.8 at high effort.']],
    ['87.8% · 1.9¢', ['Removed tool-call rituals, a scratchpad', 'step and contradictory rules. Opus 5.5, low effort.']],
    ['88.9% · 1¢', ['Same prompt on a cheaper model, Sonnet 5.']],
    ['98.9% · 1¢', ['Added routing rules and a refund-cap', 'cross-reference.']]
  ];
  C['s-hill-ex'] = {
    steps: 5,
    enter(slide, instant) {
      hillChart.enter(slide, instant);
      const s = d3.select('#myclimb-svg'); s.selectAll('*').remove();
      this.rows = CLIMB.map(([v, lines], i) => {
        const g = s.append('g').attr('transform', `translate(0,${[4, 90, 202, 288][i]})`).attr('opacity', 0);
        g.append('circle').attr('cx', 14).attr('cy', 22).attr('r', 12).attr('fill', COL.ok);
        text(g, 40, 34, v, '').style('font', '800 32px var(--f-display)');
        lines.forEach((l, j) => text(g, 40, 66 + j * 27, l, '').style('font', '400 21px var(--f-body)').style('fill', COL.mute));
        return g;
      });
      const h = s.append('g').attr('transform', 'translate(0,418)').attr('opacity', 0);
      text(h, 0, 0, 'HELD OUT · 14 TICKETS IT NEVER SAW', 'lbl');
      this.held = [['original', 78.6, COL.conv], ['after the climb', 90.5, COL.ok]].map(([t, v, c], i) => {
        const g = h.append('g').attr('transform', `translate(0,${22 + i * 62})`);
        text(g, 0, 32, t, 'lbl-ink').style('font-size', '21px');
        g.append('rect').attr('x', 214).attr('width', 290).attr('height', 44).attr('rx', 8).attr('fill', COL.surf2);
        const bar = g.append('rect').attr('x', 214).attr('height', 44).attr('rx', 8).attr('fill', c).attr('width', 0);
        text(g, 518, 33, v + '%', '').style('font', '800 28px var(--f-display)');
        return { bar, w: 290 * v / 100, i };
      });
      this.h = h;
    },
    step(slide, n, instant) {
      hillChart.step(slide, Math.min(n, 4), instant);
      this.rows.forEach((g, i) => fade(g, n >= i + 1, 400, instant));
      fade(this.h, n >= 5, 400, instant);
      this.held.forEach(b => b.bar.interrupt().transition().delay(D(n >= 5 ? 300 + b.i * 350 : 0, instant)).duration(D(800, instant)).attr('width', n >= 5 ? b.w : 0));
    }
  };

  /* ---------- s-twoloops · Two loops on a calendar: a tick every day (fix loop), a new model every few months,
     evals that expire twice a year. Illustrative timing after Robinson (fix/model loops) and my Day 18 post (6 months). */
  const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  C['s-twoloops'] = {
    steps: 3,
    enter() {
      stop('cal');
      const s = clear('loops-svg');
      const CW = 124, GAP = 16, X0 = 8, Y0 = 84;
      // a real year, Nov 2026 to Oct 2027: each month has its own number of days, laid out Monday to Sunday.
      // Fixes per day are uneven (busy weekdays, quiet weekends); a bigger dot means more fixes that day.
      this.days = [];
      const rng = d3.randomLcg(42);
      let total = 0;
      const monthStart = [];
      this.cells = MONTHS.map((m, i) => {
        const x = X0 + i * (CW + GAP);
        const g = s.append('g').attr('transform', `translate(${x},${Y0})`);
        const box = g.append('rect').attr('width', CW).attr('height', 158).attr('rx', 12).attr('fill', COL.surf).attr('stroke', COL.line).attr('stroke-width', 2);
        text(g, 12, 26, m, '').style('font', '700 21px var(--f-mono)');
        const first = new Date(2026, 10 + i, 1), n = new Date(2026, 11 + i, 0).getDate(), off = (first.getDay() + 6) % 7;
        monthStart.push(this.days.length);
        d3.range(n).forEach(d => {
          const k = d + off, wd = k % 7, weekend = wd >= 5;
          const r = rng();
          const fixes = weekend ? (r < 0.7 ? 0 : 1) : (r < 0.15 ? 0 : r < 0.45 ? 1 : r < 0.75 ? 2 : r < 0.92 ? 3 : 5);
          total += fixes;
          const c = g.append('circle').attr('cx', 12 + wd * 16.5).attr('cy', 46 + Math.floor(k / 7) * 19).attr('r', 3).attr('fill', COL.surf2);
          this.days.push({ c, fixes, cum: total, month: i });
        });
        return { g, box, x };
      });
      this.ND = this.days.length;
      this.monthStart = monthStart;
      // model pins and expiry badges sit above and below their month
      this.pins = [2, 6, 10].map(i => {
        const g = s.append('g').attr('opacity', 0).attr('transform', `translate(${X0 + i * (CW + GAP) + CW / 2},${Y0 - 14})`);
        g.append('path').attr('d', 'M-16,-30 L16,-30 L0,0 Z').attr('fill', COL.sys);
        text(g, 0, -40, 'new model', '', 'middle').style('font', '700 19px var(--f-mono)').style('fill', COL.sys);
        return { g, at: monthStart[i] + 12 };
      });
      this.exp = [5, 11].map(i => {
        const g = s.append('g').attr('opacity', 0).attr('transform', `translate(${Math.min(X0 + i * (CW + GAP) + CW / 2, 1680 - 84)},${Y0 + 172})`);
        g.append('rect').attr('x', -82).attr('y', 0).attr('width', 164).attr('height', 40).attr('rx', 20).attr('fill', COL.bg).attr('stroke', COL.neu).attr('stroke-width', 2.5);
        g.append('path').attr('d', 'M-66,11 L-52,11 L-66,29 L-52,29 Z').attr('fill', COL.neu);
        text(g, 12, 27, 'redo evals', '', 'middle').style('font', '700 19px var(--f-mono)').style('fill', COL.neu);
        return { g, at: monthStart[i] + 29 };
      });
      this.counter = text(s, 1664, 344, '', '', 'end').style('font', '700 24px var(--f-mono)').style('fill', COL.ok);
      // the key, built up one loop per click
      const key = (y, mark, title, sub, c) => {
        const g = s.append('g').attr('transform', `translate(8,${y})`).attr('opacity', 0);
        mark(g, c);
        text(g, 48, 8, title, '').style('font', '700 26px var(--f-body)').style('fill', c);
        text(g, 48, 40, sub, 'lbl').style('font-size', '21px');
        return g;
      };
      this.k1 = key(336, (g, c) => g.append('circle').attr('cx', 14).attr('cy', 0).attr('r', 11).attr('fill', c), 'Fix loop · every day',
        'the agent gets something wrong → it becomes an eval → the fix ships', COL.ok);
      this.k2 = key(418, (g, c) => g.append('path').attr('d', 'M0,-12 L28,-12 L14,12 Z').attr('fill', c), 'Model loop · every few months',
        'a new model is trained, partly on those failures, and dropped in', COL.sys);
      this.k3 = key(500, (g, c) => g.append('path').attr('d', 'M4,-12 L24,-12 L4,12 L24,12 Z').attr('fill', c), 'Evals expire · about every 6 months',
        'redo them, and measure each new model on your own task: newer is not always better', COL.neu);
      this.t = 0; this.n = 0;
    },
    render(day) {
      const cur = Math.floor(day), ND = this.ND;
      this.days.forEach((d, i) => d.c.attr('fill', i < day ? (d.fixes ? COL.ok : '#1f3a28') : COL.surf2).attr('r', i < day && d.fixes ? 2.6 + d.fixes * 0.9 : (i === cur ? 5 : 3)));
      const m = cur < ND ? this.days[cur].month : -1;
      this.cells.forEach((c, i) => c.box.attr('stroke', i === m ? COL.ok : COL.line));
      const done = this.days[Math.min(ND, Math.max(1, cur)) - 1];
      this.counter.text(this.n >= 1 && cur > 0 ? fmt(done.cum) + ' fixes shipped' : '');
      this.pins.forEach(p => p.g.attr('opacity', this.n >= 2 && day >= p.at ? 1 : 0));
      this.exp.forEach(p => p.g.attr('opacity', this.n >= 3 && day >= p.at ? 1 : 0));
    },
    step(slide, n, instant) {
      this.n = n;
      fade(this.k1, n >= 1, 500, instant); fade(this.k2, n >= 2, 500, instant); fade(this.k3, n >= 3, 500, instant);
      stop('cal');
      if (n < 1) { this.day = 0; this.render(0); return; }
      const ND = this.ND;
      if (instant || reduce) { this.day = ND; this.render(ND); return; }
      // the year runs once, over 8 s; later clicks keep the days already counted and reveal the pins and badges
      const from = this.day || 0;
      if (from >= ND) { this.render(ND); return; }
      const tm = d3.timer(e => { this.day = Math.min(ND, from + e / 8000 * ND); this.render(this.day); if (this.day >= ND) tm.stop(); });
      (timers.cal = timers.cal || []).push(tm);
    },
    leave() { stop('cal'); }
  };

  /* ---------- s-app-scaffold · Scaffold: recall + classes found ---------- */
  C['s-app-scaffold'] = {
    steps: 4,
    enter() { d3.select('#scaffold-svg').selectAll('*').remove(); },
    step(slide, n, instant) {
      const s = d3.select('#scaffold-svg');
      if (n < 4) { s.selectAll('*').remove(); return; }
      if (s.selectAll('rect').size()) return;
      const panel = (gx, title, data, max, f) => {
        const g = s.append('g').attr('transform', `translate(${gx},0)`);
        text(g, 0, 30, title, 'lbl-ink');
        const y = d3.scaleLinear().domain([0, max]).range([0, 330]);
        data.forEach(([t, v, c], i) => {
          const x = 20 + i * 180;
          g.append('rect').attr('x', x).attr('width', 130).attr('rx', 8).attr('fill', c).attr('y', 440).attr('height', 0)
            .transition().delay(D(i * 250, instant)).duration(D(900, instant)).attr('y', 440 - y(v)).attr('height', y(v));
          text(g, x + 65, 430 - y(v), f(v), '', 'middle').style('font', '800 46px var(--f-display)').attr('opacity', 0)
            .transition().delay(D(i * 250 + 700, instant)).duration(D(300, instant)).attr('opacity', 1);
          text(g, x + 65, 482, t, 'lbl', 'middle');
        });
      };
      panel(0, 'RECALL (researcher A)', [['scaffold', 0.90, COL.ok], ['none', 0.69, COL.bad]], 1, v => v.toFixed(2));
      panel(440, 'CLASSES FOUND', [['scaffold', 49, COL.ok], ['none', 13, COL.bad]], 55, v => String(v));
    }
  };

  /* ---------- s-app-multi · optional recorded clip ---------- */
  C['s-app-multi'] = { steps: 2, enter(slide) { setupClip(slide, 0, true, 2); }, step(slide, n, instant) { setupClip(slide, n, instant, 2); } };

  /* ---------- s-app-grader · Grader results: precision and recall as each grader saw them (grades.tex, all 200 items) ---------- */
  const GRADES = { Recall: [0.88, 0.89, 0.93, 0.90], Precision: [0.90, 0.92, 0.98, 0.96] };
  const GRADERS = [['A', '#8e8e93'], ['B', '#c7c7cc'], ['Opus 5', COL.proj], ['Sonnet 5', COL.neu]];
  C['s-app-grader'] = {
    steps: 4,
    enter() {
      const s = clear('grader-svg');
      const y = d3.scaleLinear().domain([0, 1]).range([400, 30]);
      [0, 0.5, 1].forEach(v => {
        s.append('line').attr('x1', 50).attr('x2', 890).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', COL.line).attr('stroke-dasharray', v ? '4 6' : null);
        text(s, 40, y(v) + 7, v.toFixed(1), 'lbl tick', 'end');
      });
      this.bars = [];
      Object.entries(GRADES).forEach(([k, vals], gi) => {
        const gx = 90 + gi * 420;
        text(s, gx + 170, 446, k, '', 'middle').style('font', '700 28px var(--f-body)').style('fill', COL.sess);
        vals.forEach((v, i) => {
          const x = gx + i * 88;
          const r = s.append('rect').attr('x', x).attr('width', 70).attr('rx', 6).attr('fill', GRADERS[i][1]).attr('y', y(0)).attr('height', 0);
          const t = text(s, x + 35, y(v) - 12, v.toFixed(2), '', 'middle').style('font', '800 24px var(--f-display)').attr('opacity', 0);
          this.bars.push({ r, t, h: y(0) - y(v), yv: y(v), i, gi });
        });
      });
      const lg = s.append('g').attr('transform', 'translate(90,484)');
      let lx = 0;
      GRADERS.forEach(([n, c], i) => {
        lg.append('rect').attr('x', lx).attr('y', -14).attr('width', 16).attr('height', 16).attr('rx', 3).attr('fill', c);
        const t = text(lg, lx + 24, 0, i < 2 ? 'researcher ' + n : n, 'lbl').style('font-size', '19px');
        lx += 24 + t.node().getComputedTextLength() + 34;
      });
    },
    step(slide, n, instant) {
      const on = n >= 1;
      this.bars.forEach(b => {
        const d = D(on ? b.gi * 500 + b.i * 120 : 0, instant);
        b.r.interrupt().transition().delay(d).duration(D(700, instant)).attr('y', on ? b.yv : 400).attr('height', on ? b.h : 0);
        b.t.interrupt().transition().delay(d + D(on ? 500 : 0, instant)).duration(D(300, instant)).attr('opacity', on ? 1 : 0);
      });
    }
  };

  /* ---------- s-app-writing · Writing: real source, real checker, real run ---------- */
  /* A simple version of the paper's number pipeline: names in the source, values from the data, one check. */
  const TEX = [
    ['d', '% main.tex: what I write'],
    ['', 'Recall rose from \val{before} to \val{after}.']
  ];
  const TEX2 = [
    ['d', '% the PDF: what readers see'],
    ['', 'Recall rose from 0.69 to 0.90.'],
    ['p', '↑ both filled in from the results']
  ];
  const CODE = [
    ['d', '# check_numbers.py (simplified from my checker)'],
    ['', 'values = read("numbers.tex")   # written from the data'],
    ['', 'for name in names_used_in("main.tex"):'],
    ['', '    if name not in values:'],
    ['w', '        fail(name + " has no value from the data")'],
    ['p', 'print("every number traces to the data")']
  ];
  const RUN = [
    ['p', '> python check_numbers.py'],
    ['', 'every number traces to the data ✓'],
    ['d', ' '],
    ['p', '> /adversarial-review paper/main.tex'],
    ['w', 'WRONG  title says Multi-Agent; result says no gain'],
    ['w', 'WRONG  5 claims false against the repository'],
    ['w', 'WEAK   3 citations misrepresented'],
    ['p', 'fixed before submission']
  ];
  C['s-app-writing'] = {
    steps: 3,
    enter(slide) {
      ['term-tex', 'term-code', 'term-run'].forEach(id => { const e = document.getElementById(id); if (e) { e.innerHTML = ''; e.classList.add('verbatim'); } });
      const box = slide.querySelector('.clip');
      if (box && !box.dataset.probed) {
        box.dataset.probed = '1';
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = box.dataset.clip;
        v.addEventListener('loadeddata', () => { box.classList.add('has-video'); box.innerHTML = ''; box.appendChild(v); });
      }
      this.st = -1;
    },
    step(slide, n, instant) {
      if (n === this.st) return; this.st = n;
      const tex = document.getElementById('term-tex');
      // main.tex turns into the PDF once; later builds leave it as it is
      const texDone = n >= 1 && (typed(tex, TEX2) || (!instant && (typed(tex, TEX) || typing(tex, TEX, 'tex'))));
      if (!texDone) {
        typeLines(tex, TEX, n >= 1, instant, 'tex', 88);
        if (n >= 1 && !instant && !reduce) later('tex', () => typeLines(tex, TEX2, true, true, 'tex2'), 2200);
        else if (n >= 1) typeLines(tex, TEX2, true, true, 'tex2');
      }
      typeLines(document.getElementById('term-code'), CODE, n >= 2, instant, 'code', 77);
      const v = slide.querySelector('.clip video');
      if (v) { if (n >= 3 && !instant) { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } return; }
      typeLines(document.getElementById('term-run'), RUN, n >= 3, instant, 'run', 158);
    },
    leave() { ['tex', 'tex2', 'code', 'run'].forEach(stop); }
  };

  /* ---------- s-app-notes · Meeting notes ---------- */
  C['s-app-notes'] = {
    steps: 3,
    enter() {
      const s = clear('notes-svg');
      const A = arrows(s, 9);
      this.tr = s.append('g').attr('opacity', 0);
      this.tr.append('rect').attr('width', 470).attr('height', 440).attr('rx', 16).attr('fill', COL.surf).attr('stroke', COL.line);
      text(this.tr, 24, 40, 'TRANSCRIPT · 58 min', 'lbl');
      // who said what: speaker names, then their words as bars; the few lines that matter glow orange
      const rng = d3.randomLcg(3);
      const who = [['ATC', COL.sys], ['Researcher', COL.proj], ['Ops manager', COL.sess], ['Pilot', COL.ok], ['Researcher', COL.proj], ['ATC', COL.sys],
        ['Ops manager', COL.sess], ['Ground crew', COL.mute], ['Pilot', COL.ok], ['Researcher', COL.proj], ['Ops manager', COL.sess], ['ATC', COL.sys], ['Researcher', COL.proj]];
      const key = [2, 6, 9, 10];
      who.forEach(([n, c], i) => {
        const y = 66 + i * 28;
        text(this.tr, 24, y + 10, n + ':', '').style('font', '600 16px var(--f-mono)').style('fill', c);
        this.tr.append('rect').attr('x', 160).attr('y', y).attr('height', 11).attr('rx', 3).attr('width', 90 + rng() * 200)
          .attr('fill', key.includes(i) ? COL.neu : COL.dim).attr('opacity', key.includes(i) ? 1 : 0.7);
      });
      this.card = s.append('g').attr('opacity', 0);
      this.card.append('path').attr('d', 'M490,220 L590,220').attr('stroke', COL.mute).attr('stroke-width', 3).attr('marker-end', A('arr'));
      this.card.append('rect').attr('x', 600).attr('width', 520).attr('height', 440).attr('rx', 16).attr('fill', COL.surf).attr('stroke', COL.neu).attr('stroke-width', 2);
      [['DECISIONS', 'Use Oct data for the stand model'], ['OWNERS', 'Data request: airport ops team'], ['DATA NEEDS', 'Block times, stand IDs, 2025–26'], ['DEADLINE', 'Draft results by 14 Nov']].forEach(([h, t], i) => {
        text(this.card, 630, 50 + i * 100, h, 'lbl').style('fill', COL.neu);
        text(this.card, 630, 86 + i * 100, t, '').style('font', '500 26px var(--f-body)');
      });
      this.log = s.append('g').attr('opacity', 0);
      this.log.append('path').attr('d', 'M1130,220 L1230,220').attr('stroke', COL.mute).attr('stroke-width', 3).attr('marker-end', A('arr'));
      ['2026-10-14.md', '2026-10-07.md', '2026-09-30.md', '2026-09-23.md'].forEach((f, i) => {
        this.log.append('rect').attr('x', 1240 + i * 10).attr('y', 40 + i * 14).attr('width', 380).attr('height', 64).attr('rx', 10).attr('fill', COL.surf2).attr('stroke', COL.line);
      });
      text(this.log, 1270, 82, 'meetings/2026-10-14.md', '').style('font', '500 22px var(--f-mono)');
      this.log.append('rect').attr('x', 1240).attr('y', 260).attr('width', 420).attr('height', 120).attr('rx', 14).attr('fill', 'none').attr('stroke', COL.sess).attr('stroke-width', 2);
      text(this.log, 1262, 302, '“What did we decide about', '').style('font', '500 24px var(--f-body)');
      text(this.log, 1262, 336, 'the data request?”', '').style('font', '500 24px var(--f-body)');
      text(this.log, 1262, 368, 'agent greps the logs', 'lbl').style('font-size', '18px');
    },
    step(slide, n, instant) { fade(this.tr, n >= 1, 400, instant); fade(this.card, n >= 2, 400, instant); fade(this.log, n >= 3, 400, instant); }
  };

  /* ---------- s-try · Course cards: three small live pictures (all illustrative) ---------- */
  // 40.015: an airport security queue, three lanes, arrivals from a "live" feed
  function simScene(s) {
    s.selectAll('*').remove();
    const rng = d3.randomLcg(8), LOOP = 30, GATES = [60, 115, 170];
    let t = 0.2; const ents = [];
    while (t < LOOP) { t += 0.35 + rng() * 0.9; ents.push({ a: t, d: 1.6 + rng() * 2.2 }); }
    const free = [0, 0, 0];
    ents.forEach(e => { let g = 0; free.forEach((f, i) => { if (f < free[g]) g = i; }); e.g = g; e.s = Math.max(e.a, free[g]); e.e = e.s + e.d; free[g] = e.e; });
    s.append('line').attr('x1', 20).attr('x2', 330).attr('y1', 115).attr('y2', 115).attr('stroke', COL.line).attr('stroke-width', 26).attr('stroke-linecap', 'round');
    GATES.forEach((y, i) => {
      s.append('rect').attr('x', 372).attr('y', y - 18).attr('width', 46).attr('height', 36).attr('rx', 6).attr('fill', COL.surf2).attr('stroke', COL.sess);
    });
    const live = s.append('g');
    live.append('circle').attr('cx', 26).attr('cy', 24).attr('r', 6).attr('fill', COL.bad).attr('class', 'live-dot');
    text(live, 40, 30, 'LIVE · flight arrivals API', '').style('font', '600 15px var(--f-mono)').style('fill', COL.mute);
    const qTxt = text(s, 20, 212, '', '').style('font', '600 16px var(--f-mono)').style('fill', COL.sess);
    const dots = s.append('g').selectAll('circle').data(ents).enter().append('circle').attr('r', 7).attr('fill', COL.sess);
    return T => {
      const tt = T % LOOP;
      let q = 0;
      dots.each(function (e) {
        const el = d3.select(this);
        if (tt < e.a || tt > e.e + 1.2) { el.attr('opacity', 0); return; }
        let x, y;
        if (tt < e.s) { const ahead = ents.filter(o => o.a < e.a && o.s > tt && o.a <= tt).length; q++; x = Math.max(28, 330 - ahead * 17 - Math.max(0, 1 - (tt - e.a) * 3) * 120); y = 115; }
        else if (tt < e.s + 0.35) { const k = (tt - e.s) / 0.35; x = 330 + k * 65; y = 115 + k * (GATES[e.g] - 115); }
        else if (tt < e.e) { x = 395; y = GATES[e.g]; }
        else { const k = (tt - e.e) / 1.2; x = 430 + k * 50; y = GATES[e.g]; }
        el.attr('opacity', tt > e.e ? 1 - (tt - e.e) / 1.2 : 1).attr('cx', x).attr('cy', y).attr('fill', tt >= e.s && tt < e.e ? COL.ok : COL.sess);
      });
      qTxt.text('in queue: ' + q);
      live.select('.live-dot').attr('opacity', Math.floor(T * 2) % 2 ? 0.25 : 1);
    };
  }
  // 40.002: a feasible region, the objective line sliding out until it touches the optimal corner
  function lpScene(s) {
    s.selectAll('*').remove();
    const x = d3.scaleLinear().domain([0, 6]).range([40, 300]), y = d3.scaleLinear().domain([0, 5]).range([200, 20]);
    s.append('line').attr('x1', 40).attr('x2', 310).attr('y1', 200).attr('y2', 200).attr('stroke', COL.mute);
    s.append('line').attr('x1', 40).attr('x2', 40).attr('y1', 200).attr('y2', 14).attr('stroke', COL.mute);
    const V = [[0, 0], [0, 4], [2, 4], [4, 2], [5, 0]];
    s.append('path').attr('d', 'M' + V.map(([a, b]) => x(a) + ',' + y(b)).join('L') + 'Z').attr('fill', COL.proj).attr('fill-opacity', .22).attr('stroke', COL.proj).attr('stroke-width', 2);
    const obj = s.append('line').attr('stroke', COL.neu).attr('stroke-width', 3).attr('stroke-dasharray', '8 6');
    const opt = s.append('g');
    opt.append('circle').attr('cx', x(4)).attr('cy', y(2)).attr('r', 9).attr('fill', COL.ok);
    text(opt, x(4) + 16, y(2) - 10, 'optimum', '').style('font', '700 16px var(--f-mono)').style('fill', COL.ok);
    const side = s.append('g').attr('transform', 'translate(330,0)');
    text(side, 0, 44, 'max 3x + 2y', '').style('font', '600 16px var(--f-mono)').style('fill', COL.neu);
    ['x + y ≤ 6', 'y ≤ 4', 'x ≤ 5'].forEach((c, i) => text(side, 0, 74 + i * 24, c, '').style('font', '500 15px var(--f-mono)').style('fill', COL.mute));
    const duals = text(side, 0, 168, 'duals ✓', '').style('font', '700 16px var(--f-mono)').style('fill', COL.ok);
    return T => {
      const k = Math.min(1, (T % 5) / 3);
      const z = 16 * d3.easeCubicOut(k);   // 3x + 2y = z, optimum z = 16 at (4, 2)
      const pts = [[0, z / 2], [z / 3, 0]];
      obj.attr('x1', x(pts[0][0])).attr('y1', y(pts[0][1])).attr('x2', x(pts[1][0])).attr('y2', y(pts[1][1])).attr('opacity', z > 0.5 ? 1 : 0);
      opt.attr('opacity', k >= 1 ? 1 : 0); duals.attr('opacity', k >= 1 ? 1 : 0);
    };
  }
  // 40.011: cargo volumes with a forecast and its band; last year is held back as the backtest
  function dbaScene(s) {
    s.selectAll('*').remove();
    const N = 36, F = 12;
    const hist = d3.range(N).map(i => 40 + i * 1.3 + 7 * Math.sin(i / 12 * 2 * Math.PI) + (i % 5) * 1.2);
    const x = d3.scaleLinear().domain([0, N + F]).range([30, 460]), y = d3.scaleLinear().domain([30, 128]).range([205, 20]);
    s.append('rect').attr('x', x(24)).attr('y', 14).attr('width', x(36) - x(24)).attr('height', 192).attr('fill', COL.surf2);
    text(s, x(30), 34, 'held back', '', 'middle').style('font', '600 14px var(--f-mono)').style('fill', COL.mute);
    const line = d3.line().x((d, i) => x(i)).y(d => y(d));
    const hp = s.append('path').datum(hist).attr('d', line).attr('fill', 'none').attr('stroke', COL.ink).attr('stroke-width', 2.5);
    const fc = d3.range(F + 1).map(j => { const i = N - 1 + j; return { i, v: 40 + i * 1.3 + 7 * Math.sin(i / 12 * 2 * Math.PI) + 2.4, w: 2 + j * 1.3 }; });
    const band = s.append('path').datum(fc).attr('fill', COL.ok).attr('fill-opacity', .2)
      .attr('d', d3.area().x(d => x(d.i)).y0(d => y(d.v - d.w)).y1(d => y(d.v + d.w)));
    const fp = s.append('path').datum(fc).attr('fill', 'none').attr('stroke', COL.ok).attr('stroke-width', 2.5).attr('stroke-dasharray', '7 5')
      .attr('d', d3.line().x(d => x(d.i)).y(d => y(d.v)));
    const bt = d3.range(24, 36).map(i => ({ i, v: 40 + i * 1.3 + 7 * Math.sin(i / 12 * 2 * Math.PI) + 2.4 }));
    const btp = s.append('path').datum(bt).attr('fill', 'none').attr('stroke', COL.neu).attr('stroke-width', 2.5).attr('stroke-dasharray', '4 4')
      .attr('d', d3.line().x(d => x(d.i)).y(d => y(d.v)));
    const err = text(s, x(30), 222, 'backtest error 4%', '', 'middle').style('font', '700 14px var(--f-mono)').style('fill', COL.neu);
    text(s, x(N + F) - 4, y(fc[F].v - fc[F].w) + 22, 'forecast', '', 'end').style('font', '600 14px var(--f-mono)').style('fill', COL.ok);
    const L = hp.node().getTotalLength();
    return T => {
      const k = (T % 7) / 7;
      hp.attr('stroke-dasharray', L).attr('stroke-dashoffset', L * (1 - Math.min(1, k / 0.35)));
      const showBt = k > 0.4, showF = k > 0.62;
      btp.attr('opacity', showBt ? 1 : 0); err.attr('opacity', showBt ? 1 : 0);
      band.attr('opacity', showF ? 1 : 0); fp.attr('opacity', showF ? 1 : 0);
    };
  }
  C['s-try'] = {
    steps: 4,
    enter() {
      stop('try');
      this.f = [simScene(d3.select('#try-sim')), lpScene(d3.select('#try-lp')), dbaScene(d3.select('#try-dba'))];
      this.still = [6.9, 4, 6.9];
      this.f.forEach((f, i) => f(this.still[i]));
      // each card's clock starts when the card appears; headless renders and print keep the settled frame
      this.t0 = [];
      const still = reduce || document.body.dataset.bare || document.body.classList.contains('print');
      if (!still) { const tm = d3.timer(() => { const now = d3.now() / 1000; this.f.forEach((f, i) => { if ((this.n || 0) >= i + 1) { if (this.t0[i] === undefined) this.t0[i] = now; f(now - this.t0[i]); } }); }); (timers.try = timers.try || []).push(tm); }
    },
    step(slide, n, instant) { this.n = n; this.f.forEach((f, i) => { if (n < i + 1) this.t0[i] = undefined; }); if (instant || reduce) this.f.forEach((f, i) => f(this.still[i])); },
    leave() { stop('try'); }
  };

  /* ---------- s-close · Close: the WALL-E clip, then the questions screen ----------
     Step 1 plays the clip full-bleed (muted); when it ends, or on the next click, the screen becomes a neon floor
     that echoes the clip's Axiom deck, a cursor types "Questions?" and one soft swell plays (film/close.m4a). */
  const TOKENS = ['context', 'cache hit', 'eval', 'receipt', 'tool_use', '0.90', '✓', 'Bash', 'prefix', 'harness', 'first mate', '98%', 'grader',
    'scaffold', 'Read', 'Edit', 'pytest', '8×', 'compact', 'skill', 'CLAUDE.md', 'subagent', 'recall', 'AC2', 'token', 'reply', 'loop', 'stack'];
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
      ro(92, 100, 'GUEST LECTURE · LLMS FOR ESD', 'start');
      ro(1828, 100, 'CONTEXT ' + fmt(tot.processed || 0) + ' TOKENS', 'end');
      ro(1828, 132, 'CACHE HIT ' + Math.round((tot.cache_hit_rate || 0) * 100) + '%', 'end').style('fill', COL.ok);
      const st = ro(92, 996, 'STATUS ▸ AWAITING INPUT', 'start');
      ro(1828, 996, 'BUILD · CHECK · IMPROVE', 'end');
      const qa = slide.querySelector('.qa'), out = document.getElementById('qa-type');
      const WORD = 'Questions?';
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
  /* key times (s) for typing "Questions?", shared with film/src/close.py so each keystroke has its sound */
  const QA_TYPE_AT = [2.90, 3.02, 3.13, 3.27, 3.38, 3.49, 3.63, 3.74, 3.86, 4.12];

  window.SLIDES = C;
})();
