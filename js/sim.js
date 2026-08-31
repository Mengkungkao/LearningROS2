/* ===========================================================
   sim.js — draws the turtle world.
   Reads ROS.world (owned by the turtlesim node) 60 times a
   second and paints it. Arrow keys become real cmd_vel messages
   when turtle_teleop_key is running.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, ROS = global.ROS, Bus = U.Bus;

  const Sim = {
    canvas: null, ctx: null, host: null, hint: null,
    focused: false, keys: Object.create(null), raf: null,

    init(host) {
      this.host = host;
      this.canvas = U.$('#sim-canvas', host);
      this.ctx = this.canvas.getContext('2d');
      this.hint = U.$('#sim-hint', host);

      this.canvas.setAttribute('tabindex', '0');
      this.canvas.addEventListener('focus', () => { this.focused = true; this.updateHint(); });
      this.canvas.addEventListener('blur', () => { this.focused = false; this.keys = {}; this.updateHint(); });
      this.canvas.addEventListener('keydown', (e) => this.onKey(e, true));
      this.canvas.addEventListener('keyup', (e) => this.onKey(e, false));
      this.canvas.addEventListener('mousedown', () => this.canvas.focus());

      /* on-screen arrows, for tablets and small fingers */
      U.$$('.dpad button', host).forEach((b) => {
        const dir = b.getAttribute('data-dir');
        const press = (on) => { this.keys[dir] = on; this.pump(); };
        b.addEventListener('mousedown', (e) => { e.preventDefault(); press(true); });
        b.addEventListener('mouseup', () => press(false));
        b.addEventListener('mouseleave', () => press(false));
        b.addEventListener('touchstart', (e) => { e.preventDefault(); press(true); }, { passive: false });
        b.addEventListener('touchend', (e) => { e.preventDefault(); press(false); }, { passive: false });
      });

      Bus.on('sim:teleop', () => this.updateHint());
      Bus.on('sim:start', () => this.updateHint());
      Bus.on('sim:stop', () => this.updateHint());
      Bus.on('dock:applied', () => this.updateHint());

      /* Every command the robot is given, written out in full. This is
         the whole point of the Robot+Graph split: press a button, and
         see the exact message that press produced. */
      this.wire = U.$('#sim-wire', host);
      this.wireBody = U.$('#sim-wire-body', host);
      Bus.on('ros:msg', (m) => {
        if (!/\/cmd_vel$/.test(m.topic)) return;
        this.showWire(m);
      });
      window.addEventListener('resize', () => this.resize());

      this.resize();
      this.updateHint();
      this.loop();
      setInterval(() => this.pump(), 100);   // repeat key -> cmd_vel, like real teleop
    },

    onKey(e, down) {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right'
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      this.keys[dir] = down;
      if (down) this.pump();
    },

    /** Turn held keys into a Twist message, exactly like turtle_teleop_key does. */
    pump() {
      const k = this.keys;
      if (!k.up && !k.down && !k.left && !k.right) return;
      if (!ROS.teleop || !ROS.teleop.active) {
        if (!this._warned) {
          this._warned = true;
          setTimeout(() => { this._warned = false; }, 3000);
          Bus.emit('explain', {
            kid: 'Those buttons do nothing yet — nothing is listening to them. Start the driver first:\n`ros2 run turtlesim turtle_teleop_key`',
            pro: 'No teleop node is running, so there is no publisher on /turtle1/cmd_vel.'
          });
        }
        return;
      }
      const lin = (k.up ? 2 : 0) + (k.down ? -2 : 0);
      const ang = (k.left ? 2 : 0) + (k.right ? -2 : 0);
      ROS.teleopDrive(lin, ang);
    },

    /** Render the Twist that was just sent, with the live numbers picked out. */
    showWire(m) {
      if (!this.wireBody) return;
      const lin = (m.msg.linear || {}), ang = (m.msg.angular || {});
      const num = (v) => {
        const n = Number(v) || 0;
        const cls = n === 0 ? 'wzero' : 'wval';
        return '<span class="' + cls + '">' + (Math.round(n * 100) / 100).toFixed(2) + '</span>';
      };
      const who = m.from ? '<span class="wtype">from ' + U.escapeHtml(m.from) + '</span>' : '';
      this.wireBody.innerHTML =
        '<span class="wtopic">' + U.escapeHtml(m.topic) + '</span> ' +
        '<span class="wtype">geometry_msgs/msg/Twist</span> ' + who + '<br>' +
        'linear.x ' + num(lin.x) + '  ·  angular.z ' + num(ang.z) +
        '<span class="wtype">' +
        (Number(lin.x) ? (Number(lin.x) > 0 ? '  → forwards' : '  → backwards') : '') +
        (Number(ang.z) ? (Number(ang.z) > 0 ? '  ↺ turning left' : '  ↻ turning right') : '') +
        (!Number(lin.x) && !Number(ang.z) ? '  → stop' : '') +
        '</span>';

      if (this.wire) {
        this.wire.classList.remove('pulse');
        void this.wire.offsetWidth;         // restart the animation
        this.wire.classList.add('pulse');
      }
    },

    updateHint() {
      const teleop = ROS.teleop && ROS.teleop.active;
      const running = ROS.world.running;
      /* a phone has no arrow keys, so do not tell a phone to press them */
      const touch = (global.Mobile && global.Mobile.on) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      this.host.classList.toggle('teleop-on', !!teleop);
      if (!running) {
        this.hint.innerHTML = 'No turtle yet. Start one:  <code>ros2 run turtlesim turtlesim_node</code>';
      } else if (!teleop) {
        this.hint.innerHTML = 'Drive it: <code>ros2 run turtlesim turtle_teleop_key</code> ' +
          '&nbsp;or&nbsp; <code>ros2 topic pub /turtle1/cmd_vel ...</code>';
      } else if (touch) {
        this.hint.innerHTML = '<b class="live">Tap the ▲ ◀ ▼ ▶ buttons on the turtle.</b> Every tap sends a ' +
          'real <code>geometry_msgs/msg/Twist</code> on <code>/turtle1/cmd_vel</code>';
      } else if (!this.focused) {
        this.hint.innerHTML = '<b>Click the blue square</b>, then use the arrow keys 🡄 🡅 🡇 🡆';
      } else {
        this.hint.innerHTML = '<b class="live">Listening to your arrow keys →</b> every press sends a real ' +
          '<code>geometry_msgs/msg/Twist</code> on <code>/turtle1/cmd_vel</code>';
      }

      /* offer the side-by-side view exactly when it would teach something */
      if (running && !global.Dock.isVisible('graph')) {
        const b = document.createElement('button');
        b.className = 'watchbtn';
        b.textContent = '⫽ Watch it happen (Robot + Graph)';
        b.title = 'Show the graph beside the robot, so you can see the message travel';
        b.addEventListener('click', () => global.Dock.watchItHappen());
        this.hint.appendChild(document.createElement('br'));
        this.hint.appendChild(b);
      }
    },

    resize() {
      if (!this.canvas) return;
      const box = this.canvas.parentNode.getBoundingClientRect();
      const size = Math.max(160, Math.min(box.width - 4, box.height - 4));
      const dpr = window.devicePixelRatio || 1;
      this.canvas.style.width = size + 'px';
      this.canvas.style.height = size + 'px';
      this.canvas.width = Math.round(size * dpr);
      this.canvas.height = Math.round(size * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.px = size;
    },

    loop() {
      this.draw();
      this.raf = requestAnimationFrame(() => this.loop());
    },

    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      const w = this.px || 300;
      const world = ROS.world;
      const S = w / world.size;                       // metres -> pixels
      const X = (x) => x * S;
      const Y = (y) => w - y * S;                     // ROS y points up, canvas y points down

      ctx.clearRect(0, 0, w, w);
      ctx.fillStyle = world.running
        ? 'rgb(' + world.bg.r + ',' + world.bg.g + ',' + world.bg.b + ')'
        : '#141a2e';
      ctx.fillRect(0, 0, w, w);

      if (!world.running) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('no turtle running', w / 2, w / 2 - 8);
        ctx.font = '32px serif';
        ctx.fillText('🐢', w / 2, w / 2 + 28);
        ctx.textAlign = 'left';
        return;
      }

      /* faint metre grid, so the numbers in Pose mean something */
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.lineWidth = 1;
      for (let m = 1; m < world.size; m++) {
        ctx.beginPath(); ctx.moveTo(X(m), 0); ctx.lineTo(X(m), w); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, Y(m)); ctx.lineTo(w, Y(m)); ctx.stroke();
      }

      /* pen trails */
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      world.strokes.forEach((s) => {
        if (s.pts.length < 2) return;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = Math.max(1, s.width);
        ctx.beginPath();
        ctx.moveTo(X(s.pts[0].x), Y(s.pts[0].y));
        for (let i = 1; i < s.pts.length; i++) ctx.lineTo(X(s.pts[i].x), Y(s.pts[i].y));
        ctx.stroke();
      });

      Object.keys(world.turtles).forEach((name) => {
        const t = world.turtles[name];
        drawTurtle(ctx, X(t.x), Y(t.y), -t.theta, Math.max(12, S * 0.42), name, t);
      });

      /* live pose readout, bottom-left */
      const t1 = world.turtles.turtle1;
      if (t1) {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(6, w - 24, 190, 18);
        ctx.fillStyle = '#dbe7ff';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText('x=' + U.f(t1.x, 2) + '  y=' + U.f(t1.y, 2) + '  θ=' + U.f(t1.theta, 2), 12, w - 11);
      }
    },

    snapshot() { return this.canvas ? this.canvas.toDataURL('image/png') : null; }
  };

  /** A small vector turtle: shell, head, four legs. */
  function drawTurtle(ctx, cx, cy, rot, r, name, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(1.5, 2, r * 0.62, r * 0.52, 0, 0, Math.PI * 2); ctx.fill();

    /* legs */
    ctx.fillStyle = '#2f8f4e';
    [[0.42, 0.42], [0.42, -0.42], [-0.42, 0.42], [-0.42, -0.42]].forEach((p) => {
      ctx.beginPath();
      ctx.ellipse(p[0] * r, p[1] * r, r * 0.2, r * 0.14, p[0] * p[1] > 0 ? 0.7 : -0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    /* head, pointing along +x = the direction theta means */
    ctx.beginPath(); ctx.arc(r * 0.62, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d2417';
    ctx.beginPath(); ctx.arc(r * 0.72, -r * 0.09, r * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.72, r * 0.09, r * 0.05, 0, Math.PI * 2); ctx.fill();

    /* shell */
    const g = ctx.createRadialGradient(-r * 0.1, -r * 0.1, r * 0.1, 0, 0, r * 0.62);
    g.addColorStop(0, '#6fd88a');
    g.addColorStop(1, '#2c7a45');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.58, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10,40,20,.55)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.26, 0, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();

    if (name !== 'turtle1') {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, cx, cy - r * 0.8);
      ctx.textAlign = 'left';
    }
    void t;
  }

  global.Sim = Sim;
})(window);
