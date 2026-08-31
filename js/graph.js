/* ===========================================================
   graph.js — the live picture of your robot.
   Bubbles are nodes, pills are topics, and every message you
   send flies down the wire as a little dot.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, ROS = global.ROS, Bus = U.Bus;

  const Graph = {
    canvas: null, ctx: null, host: null,
    items: Object.create(null),   // id -> {id, kind, label, x, y, vx, vy}
    edges: [],
    packets: [],
    showHidden: false,
    dirty: true,
    px: 0, py: 0,

    init(host) {
      this.host = host;
      this.canvas = U.$('#graph-canvas', host);
      this.ctx = this.canvas.getContext('2d');

      const toggle = U.$('#graph-hidden', host);
      if (toggle) toggle.addEventListener('change', () => { this.showHidden = toggle.checked; this.rebuild(); });

      Bus.on('graph:dirty', () => { this.dirty = true; });
      Bus.on('ros:node', () => { this.dirty = true; });
      Bus.on('ros:topic', () => { this.dirty = true; });
      Bus.on('ros:msg', (m) => this.onMessage(m));
      Bus.on('ros:reset', () => { this.items = Object.create(null); this.edges = []; this.packets = []; this.dirty = true; });
      window.addEventListener('resize', () => this.resize());

      this.resize();
      this.rebuild();
      this.loop();
    },

    resize() {
      if (!this.canvas) return;
      const box = this.canvas.parentNode.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(200, box.width), h = Math.max(180, box.height);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.px = w; this.py = h;
    },

    visibleTopic(name) {
      if (this.showHidden) return true;
      return name !== '/rosout' && name !== '/parameter_events';
    },
    visibleNode(name) {
      if (this.showHidden) return true;
      return name.indexOf('/_ros2cli') !== 0;
    },

    measure(it) {
      const ctx = this.ctx;
      ctx.font = '600 11.5px ui-sans-serif, system-ui, -apple-system, sans-serif';
      it.w = ctx.measureText(it.label).width + 22;
      it.h = it.kind === 'node' ? 28 : 22;
    },

    rebuild() {
      const snap = ROS.snapshot();
      const keep = Object.create(null);
      const cx = this.px / 2, cy = this.py / 2;

      snap.nodes.forEach((n) => {
        if (!this.visibleNode(n.name)) return;
        keep['n:' + n.name] = true;
        if (!this.items['n:' + n.name]) {
          this.items['n:' + n.name] = spawn('n:' + n.name, 'node', n.name, cx, cy);
          this.measure(this.items['n:' + n.name]);
        }
      });
      snap.topics.forEach((t) => {
        if (!this.visibleTopic(t.name)) return;
        const hasVisible = t.pubs.concat(t.subs).some((n) => this.visibleNode(n));
        if (!hasVisible) return;
        keep['t:' + t.name] = true;
        if (!this.items['t:' + t.name]) {
          this.items['t:' + t.name] = spawn('t:' + t.name, 'topic', t.name, cx, cy);
          this.measure(this.items['t:' + t.name]);
        }
        this.items['t:' + t.name].type = t.type;
      });

      Object.keys(this.items).forEach((k) => { if (!keep[k]) delete this.items[k]; });

      this.edges = [];
      snap.topics.forEach((t) => {
        if (!this.items['t:' + t.name]) return;
        t.pubs.forEach((p) => {
          if (this.items['n:' + p]) this.edges.push({ from: 'n:' + p, to: 't:' + t.name, topic: t.name });
        });
        t.subs.forEach((s) => {
          if (this.items['n:' + s]) this.edges.push({ from: 't:' + t.name, to: 'n:' + s, topic: t.name });
        });
      });
      this.dirty = false;
    },

    onMessage(m) {
      if (!this.visibleTopic(m.topic)) return;
      const box = this.items['t:' + m.topic];
      if (box) box.hot = Date.now();          // brief glow, so the eye follows the traffic
      this.edges.forEach((e) => {
        if (e.topic !== m.topic) return;
        if (e.from[0] === 'n' && m.from && e.from !== 'n:' + m.from) return;   // only the sender's wire
        this.packets.push({ edge: e, t: 0 });
      });
      if (this.packets.length > 160) this.packets.splice(0, this.packets.length - 160);
    },

    step() {
      const items = Object.keys(this.items).map((k) => this.items[k]);
      const W = this.px, H = this.py;
      const n = items.length;
      /* how far apart things want to sit, given how much room we have */
      const rest = U.clamp(Math.sqrt((W * H) / Math.max(2, n)) * 0.62, 120, 280);

      /* springs along the wires */
      this.edges.forEach((e) => {
        const a = this.items[e.from], b = this.items[e.to];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const force = (d - rest) * 0.0022;
        const fx = dx / d * force, fy = dy / d * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });

      /* everybody pushes everybody else away */
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = items[i], b = items[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 4) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 4; }
          const d = Math.sqrt(d2);
          const force = Math.min(16, (rest * rest * 2.6) / d2) * 0.075;
          a.vx -= dx / d * force; a.vy -= dy / d * force;
          b.vx += dx / d * force; b.vy += dy / d * force;

          /* labels must never sit on top of each other */
          const needX = ((a.w || 90) + (b.w || 90)) / 2 + 14;
          const needY = ((a.h || 26) + (b.h || 26)) / 2 + 10;
          if (Math.abs(dx) < needX && Math.abs(dy) < needY) {
            const push = 0.55;
            if (Math.abs(dx) / needX > Math.abs(dy) / needY) {
              const s2 = dx >= 0 ? push : -push;
              a.vx -= s2; b.vx += s2;
            } else {
              const s2 = dy >= 0 ? push : -push;
              a.vy -= s2; b.vy += s2;
            }
          }
        }
      }

      items.forEach((it) => {
        it.vx += (W / 2 - it.x) * 0.0005;
        it.vy += (H / 2 - it.y) * 0.0005;
        it.vx = U.clamp(it.vx * 0.85, -14, 14);
        it.vy = U.clamp(it.vy * 0.85, -14, 14);
        const halfW = (it.w || 90) / 2 + 6, halfH = (it.h || 26) / 2 + 6;
        it.x = U.clamp(it.x + it.vx, halfW, Math.max(halfW + 1, W - halfW));
        it.y = U.clamp(it.y + it.vy, halfH, Math.max(halfH + 1, H - halfH - 14));
      });

      this.packets.forEach((p) => { p.t += 0.05; });
      this.packets = this.packets.filter((p) => p.t < 1);
    },

    loop() {
      if (this.dirty) this.rebuild();
      this.step();
      this.draw();
      requestAnimationFrame(() => this.loop());
    },

    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      const W = this.px, H = this.py;
      ctx.clearRect(0, 0, W, H);

      const items = Object.keys(this.items);
      if (!items.length) {
        ctx.fillStyle = 'rgba(190,205,235,.45)';
        ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nothing is running yet.', W / 2, H / 2 - 10);
        ctx.font = '12px ui-monospace, Menlo, monospace';
        ctx.fillText('ros2 run demo_nodes_cpp talker', W / 2, H / 2 + 12);
        ctx.textAlign = 'left';
        return;
      }

      /* wires */
      this.edges.forEach((e) => {
        const a = this.items[e.from], b = this.items[e.to];
        if (!a || !b) return;
        ctx.strokeStyle = 'rgba(125,150,205,.42)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        arrowHead(ctx, a, b);
      });

      /* flying messages */
      this.packets.forEach((p) => {
        const a = this.items[p.edge.from], b = this.items[p.edge.to];
        if (!a || !b) return;
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        ctx.fillStyle = 'rgba(120,255,214,' + (1 - p.t * 0.55) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120,255,214,.18)';
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      });

      /* boxes */
      items.forEach((k) => {
        const it = this.items[k];
        ctx.font = '600 11.5px ui-sans-serif, system-ui, -apple-system, sans-serif';
        const label = it.label;
        const tw = ctx.measureText(label).width;
        const pad = 11;
        const w = tw + pad * 2, h = it.kind === 'node' ? 28 : 22;
        const x = it.x - w / 2, y = it.y - h / 2;
        it.w = w; it.h = h;

        ctx.beginPath();
        roundRect(ctx, x, y, w, h, it.kind === 'node' ? 8 : h / 2);
        if (it.kind === 'node') {
          const g = ctx.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, '#3f5fd0');
          g.addColorStop(1, '#2b3f96');
          ctx.fillStyle = g;
          ctx.strokeStyle = 'rgba(160,190,255,.65)';
        } else {
          const heat = it.hot ? Math.max(0, 1 - (Date.now() - it.hot) / 420) : 0;
          ctx.fillStyle = heat ? 'rgba(28,105,88,' + (0.92 + heat * 0.08) + ')' : 'rgba(20,70,60,.92)';
          ctx.strokeStyle = heat ? 'rgba(140,255,214,' + (0.7 + heat * 0.3) + ')' : 'rgba(90,230,190,.7)';
          if (heat) {
            ctx.shadowColor = 'rgba(120,255,214,' + (heat * 0.8) + ')';
            ctx.shadowBlur = 14 * heat;
          }
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.fillStyle = it.kind === 'node' ? '#eef3ff' : '#8ff0d2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, it.x, it.y + 0.5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      });

      /* legend */
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(190,205,235,.55)';
      ctx.fillText('▭ node   ◖ topic   ● message', 10, H - 9);
    },

    snapshot() { return this.canvas ? this.canvas.toDataURL('image/png') : null; }
  };

  function spawn(id, kind, label, cx, cy) {
    const ang = Math.random() * Math.PI * 2;
    return {
      id: id, kind: kind, label: label,
      x: cx + Math.cos(ang) * 70 + (Math.random() - 0.5) * 30,
      y: cy + Math.sin(ang) * 70 + (Math.random() - 0.5) * 30,
      vx: 0, vy: 0
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function arrowHead(ctx, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const back = (b.kind === 'node' ? 22 : 18);
    const x = b.x - dx / d * back, y = b.y - dy / d * back;
    const ang = Math.atan2(dy, dx);
    ctx.fillStyle = 'rgba(150,175,225,.75)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7 * Math.cos(ang - 0.4), y - 7 * Math.sin(ang - 0.4));
    ctx.lineTo(x - 7 * Math.cos(ang + 0.4), y - 7 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  global.Graph = Graph;
})(window);
