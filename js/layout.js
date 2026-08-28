/* ===========================================================
   layout.js — draggable dividers that snap.

   Every divider pulls towards a set of sensible sizes. Get within
   a few pixels of one and it clicks into place, with a guide line
   and a label telling you where you landed. Hold Shift to switch
   the magnet off and place it exactly where you like.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, Bus = U.Bus;

  const MAGNET = 13;          // px — how close before it grabs you
  const STORE = 'ros2academy.layout';

  /* Each divider: which CSS variable it drives, its limits, its
     defaults, and the sizes it likes to sit at. */
  const GUTTERS = {
    lessons: {
      varName: '--w-lessons', axis: 'x', def: 320, min: 0, max: 560,
      hideBelow: 130,                                   // drag it small and it hides
      snaps: [{ v: 0, label: 'hidden' }, { v: 260, label: 'narrow' },
              { v: 320, label: 'default' }, { v: 400, label: 'wide' }, { v: 480, label: 'widest' }]
    },
    views: {
      varName: '--w-views', axis: 'x', def: 420, min: 260, max: 760, fromEnd: true,
      snaps: [{ v: 300, label: 'narrow' }, { v: 360, label: '' }, { v: 420, label: 'default' },
              { v: 520, label: 'wide' }, { v: 620, label: 'widest' }]
    },
    explain: {
      varName: '--h-explain', axis: 'y', def: 190, min: 0, max: 520, fromEnd: true,
      hideBelow: 40,
      snaps: [{ v: 0, label: 'hidden' }, { v: 120, label: 'small' }, { v: 190, label: 'default' },
              { v: 300, label: 'big' }, { v: 420, label: 'huge' }]
    },
    split: {
      varName: '--split-a', axis: 'y', def: 50, min: 15, max: 85, unit: '%',
      snaps: [{ v: 25, label: '¼' }, { v: 33.333, label: '⅓' }, { v: 50, label: 'half' },
              { v: 66.667, label: '⅔' }, { v: 75, label: '¾' }]
    }
  };

  const Layout = {
    values: Object.create(null),

    init() {
      const saved = U.Store.get(STORE, {}) || {};
      Object.keys(GUTTERS).forEach((k) => {
        const g = GUTTERS[k];
        const v = typeof saved[k] === 'number' ? saved[k] : g.def;
        this.set(k, v, true);
      });

      this.guide = document.createElement('div');
      this.guide.id = 'snap-guide';
      this.guide.innerHTML = '<b></b>';
      document.body.appendChild(this.guide);

      U.$$('.gutter').forEach((el) => this.wire(el));
      window.addEventListener('resize', () => this.clampAll());
    },

    set(key, value, silent) {
      const g = GUTTERS[key];
      if (!g) return;
      const v = U.clamp(value, g.min, g.max);
      this.values[key] = v;
      document.documentElement.style.setProperty(g.varName, v + (g.unit || 'px'));
      if (key === 'lessons') document.body.classList.toggle('lessons-hidden', v < 8);
      if (key === 'explain') document.body.classList.toggle('explain-hidden', v < 8);
      if (!silent) {
        this.save();
        Bus.emit('layout:change', { key: key, value: v });
      }
    },

    save() { U.Store.set(STORE, this.values); },

    reset(key) {
      this.set(key, GUTTERS[key].def);
      flash(key);
    },

    clampAll() {
      Object.keys(GUTTERS).forEach((k) => this.set(k, this.values[k], true));
    },

    /** Nearest snap point, if the magnet can reach it. */
    magnet(key, raw, disabled) {
      const g = GUTTERS[key];
      if (disabled) return { v: raw, snap: null };
      /* on a percentage divider, work the threshold out in real pixels */
      const scale = g.unit === '%' ? (paneSpan(key) / 100) : 1;
      let best = null, bestD = Infinity;
      g.snaps.forEach((s) => {
        const d = Math.abs(s.v - raw) * scale;
        if (d < bestD) { bestD = d; best = s; }
      });
      if (best && bestD <= MAGNET) return { v: best.v, snap: best };
      return { v: raw, snap: null };
    },

    wire(el) {
      const key = el.getAttribute('data-gutter');
      const g = GUTTERS[key];
      if (!g) return;
      const horizontal = g.axis === 'y';

      let dragging = false, startPos = 0, startVal = 0, lastSnap = null;

      const posOf = (e) => (horizontal ? e.clientY : e.clientX);

      const move = (e) => {
        if (!dragging) return;
        e.preventDefault();
        const delta = posOf(e) - startPos;
        const dir = g.fromEnd ? -1 : 1;
        let raw;
        if (g.unit === '%') {
          raw = startVal + (delta / Math.max(1, paneSpan(key))) * 100;
        } else {
          raw = startVal + delta * dir;
        }
        const m = this.magnet(key, raw, e.shiftKey);
        this.set(key, m.v);

        if (m.snap && m.snap !== lastSnap) el.classList.add('snapped');
        else if (!m.snap) el.classList.remove('snapped');
        lastSnap = m.snap;
        this.showGuide(el, m.snap, key, m.v, g);
      };

      const up = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('dragging');
        el.classList.remove('active', 'snapped');
        this.hideGuide();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        /* a divider dragged almost shut is a request to close it */
        if (g.hideBelow && this.values[key] > 0 && this.values[key] < g.hideBelow) this.set(key, 0);
        this.save();
        Bus.emit('layout:done', { key: key, value: this.values[key] });
      };

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        startPos = posOf(e);
        startVal = this.values[key];
        lastSnap = null;
        el.classList.add('active');
        document.body.classList.add('dragging');
        document.body.style.cursor = horizontal ? 'row-resize' : 'col-resize';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: false });
        e.preventDefault();
      });

      el.addEventListener('dblclick', () => this.reset(key));

      el.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 2 : 16;
        const pct = g.unit === '%';
        const amount = pct ? (e.shiftKey ? 1 : 5) : step;
        const dir = g.fromEnd ? -1 : 1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { this.set(key, this.values[key] - amount * dir); e.preventDefault(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { this.set(key, this.values[key] + amount * dir); e.preventDefault(); }
        else if (e.key === 'Home' || e.key === 'Enter') { this.reset(key); e.preventDefault(); }
      });
    },

    showGuide(el, snap, key, value, g) {
      const r = el.getBoundingClientRect();
      const gd = this.guide;
      gd.classList.toggle('on', true);
      gd.classList.toggle('hit', !!snap);
      const label = snap ? snap.label || fmt(value, g) : fmt(value, g);
      gd.firstChild.textContent = label;
      if (g.axis === 'y') {
        gd.className = gd.className.replace(' vert', '') + ' horiz';
        gd.style.left = r.left + 'px';
        gd.style.width = r.width + 'px';
        gd.style.top = (r.top + r.height / 2) + 'px';
        gd.style.height = '';
      } else {
        gd.className = gd.className.replace(' horiz', '') + ' vert';
        gd.style.top = r.top + 'px';
        gd.style.height = r.height + 'px';
        gd.style.left = (r.left + r.width / 2) + 'px';
        gd.style.width = '';
      }
    },

    hideGuide() { this.guide.classList.remove('on', 'hit'); document.body.style.cursor = ''; },

    /* ---- used by the hide/show buttons ------------------ */
    toggle(key, openTo) {
      const hidden = this.values[key] < 8;
      this.set(key, hidden ? (openTo || GUTTERS[key].def) : 0);
      flash(key);
      return !hidden;
    },

    isHidden(key) { return this.values[key] < 8; },
    def(key) { return GUTTERS[key].def; }
  };

  function fmt(v, g) {
    return g.unit === '%' ? Math.round(v) + '%' : Math.round(v) + 'px';
  }

  /** How many pixels does a percentage divider divide up? */
  function paneSpan(key) {
    if (key !== 'split') return 1;
    const views = U.$('#views');
    return views ? views.getBoundingClientRect().height : 600;
  }

  function flash(key) {
    const el = U.$('.gutter[data-gutter="' + key + '"]');
    if (!el) return;
    el.classList.add('snapped');
    setTimeout(() => el.classList.remove('snapped'), 320);
  }

  Layout.GUTTERS = GUTTERS;
  global.Layout = Layout;
})(window);
