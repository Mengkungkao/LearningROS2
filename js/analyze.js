/* ===========================================================
   analyze.js — read the student's Python node and imitate it.

   This is NOT a Python interpreter. It reads your file the way a
   patient teacher would: "ah, you made a publisher on /chatter
   with a timer every 0.5 seconds, and you log this text" — then
   the simulator behaves that way. Change your code, change the
   robot. That is the point.
   =========================================================== */
(function (global) {
  'use strict';
  const IFACE = global.IFACE;

  /* class name in a python import -> full ROS type */
  const KNOWN_TYPES = {
    String: 'std_msgs/msg/String', Int32: 'std_msgs/msg/Int32',
    Float64: 'std_msgs/msg/Float64', Bool: 'std_msgs/msg/Bool',
    Twist: 'geometry_msgs/msg/Twist', Vector3: 'geometry_msgs/msg/Vector3',
    Point: 'geometry_msgs/msg/Point', Pose: 'turtlesim/msg/Pose',
    Color: 'turtlesim/msg/Color', AddTwoInts: 'example_interfaces/srv/AddTwoInts',
    Spawn: 'turtlesim/srv/Spawn', Empty: 'std_srvs/srv/Empty'
  };

  /** Split a python file into {defName: bodyText} plus the top-level text. */
  function splitDefs(src) {
    const lines = src.split('\n');
    const defs = Object.create(null);
    let current = null, currentIndent = 0;
    lines.forEach((line) => {
      const m = line.match(/^(\s*)def\s+(\w+)\s*\(/);
      if (m) {
        current = m[2];
        currentIndent = m[1].length;
        defs[current] = [];
        return;
      }
      if (current) {
        if (line.trim() === '') { defs[current].push(line); return; }
        const indent = line.match(/^\s*/)[0].length;
        if (indent <= currentIndent) { current = null; return; }
        defs[current].push(line);
      }
    });
    const out = Object.create(null);
    Object.keys(defs).forEach((k) => { out[k] = defs[k].join('\n'); });
    return out;
  }

  function typeOf(cls, imports) {
    if (imports[cls]) return imports[cls];
    if (KNOWN_TYPES[cls]) return KNOWN_TYPES[cls];
    return 'unknown/msg/' + cls;
  }

  function python(src) {
    const a = {
      ok: true, errors: [], warnings: [],
      className: null, nodeName: null,
      imports: Object.create(null),
      publishers: [], subscriptions: [], services: [], timers: [], params: [],
      defs: splitDefs(src), initLogs: [], usesRclpy: false
    };

    /* imports: from std_msgs.msg import String  */
    let m;
    const importRe = /from\s+([\w.]+)\s+import\s+([\w,\s]+)/g;
    while ((m = importRe.exec(src))) {
      const mod = m[1];
      m[2].split(',').map((s) => s.trim()).filter(Boolean).forEach((cls) => {
        const parts = mod.split('.');
        if (parts.length >= 2 && (parts[1] === 'msg' || parts[1] === 'srv' || parts[1] === 'action')) {
          a.imports[cls] = parts[0] + '/' + parts[1] + '/' + cls;
        }
      });
    }
    if (/import\s+rclpy/.test(src)) a.usesRclpy = true;
    if (!a.usesRclpy) a.warnings.push("This file never does `import rclpy` — a real ROS 2 node needs it.");

    const cls = src.match(/class\s+(\w+)\s*\(\s*Node\s*\)/);
    if (cls) a.className = cls[1];
    else a.warnings.push("No `class Something(Node):` found — is this a ROS 2 node?");

    const nn = src.match(/super\(\)\s*\.\s*__init__\s*\(\s*['"]([^'"]+)['"]/);
    if (nn) a.nodeName = nn[1];
    else a.warnings.push("No node name found — expected super().__init__('some_name').");

    /* publishers */
    const pubRe = /(?:self\.(\w+)\s*=\s*)?self\.create_publisher\(\s*(\w+)\s*,\s*['"]([^'"]+)['"]\s*,\s*([^)]*)\)/g;
    while ((m = pubRe.exec(src))) {
      a.publishers.push({
        varName: m[1] || null, type: typeOf(m[2], a.imports), cls: m[2],
        topic: m[3], qos: (m[4] || '10').trim()
      });
    }

    /* subscriptions */
    const subRe = /self\.create_subscription\(\s*(\w+)\s*,\s*['"]([^'"]+)['"]\s*,\s*self\.(\w+)\s*,\s*([^)]*)\)/g;
    while ((m = subRe.exec(src))) {
      a.subscriptions.push({ type: typeOf(m[1], a.imports), cls: m[1], topic: m[2], cb: m[3], qos: (m[4] || '10').trim() });
    }

    /* timers */
    const timerRe = /(?:self\.(\w+)\s*=\s*)?self\.create_timer\(\s*([0-9.]+)\s*,\s*self\.(\w+)\s*\)/g;
    while ((m = timerRe.exec(src))) {
      a.timers.push({ varName: m[1] || null, period: parseFloat(m[2]) || 1, cb: m[3] });
    }

    /* services */
    const srvRe = /self\.create_service\(\s*(\w+)\s*,\s*['"]([^'"]+)['"]\s*,\s*self\.(\w+)\s*\)/g;
    while ((m = srvRe.exec(src))) {
      a.services.push({ type: typeOf(m[1], a.imports), name: m[2], cb: m[3] });
    }

    /* parameters */
    const parRe = /self\.declare_parameter\(\s*['"]([^'"]+)['"]\s*,\s*([^)]*)\)/g;
    while ((m = parRe.exec(src))) {
      a.params.push({ name: m[1], value: coerce(m[2].trim()) });
    }

    if (!a.publishers.length && !a.subscriptions.length && !a.services.length) {
      a.warnings.push('This node neither publishes, subscribes, nor serves anything. It will just sit there.');
    }
    return a;
  }

  function coerce(v) {
    v = String(v).trim().replace(/,$/, '');
    if (/^['"]/.test(v)) return v.slice(1, -1);
    if (v === 'True') return true;
    if (v === 'False') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?[\d.]+$/.test(v)) return parseFloat(v);
    return v;
  }

  /* ---- turning code text into behaviour ----------------- */

  /** Pull the text out of get_logger().info("...") calls in a body. */
  function logCalls(body) {
    const out = [];
    const re = /get_logger\(\)\s*\.\s*(info|warn|warning|error|debug)\s*\(\s*(f?)(['"])([\s\S]*?)\3\s*\)/g;
    let m;
    while ((m = re.exec(body || ''))) {
      out.push({ level: (m[1] === 'warning' ? 'warn' : m[1]).toUpperCase(), fstring: !!m[2], text: m[4] });
    }
    return out;
  }

  /** Assignments like  msg.data = f'Hello {i}'  or  msg.linear.x = 2.0 */
  function fieldAssigns(body) {
    const out = [];
    const re = /(\w+)((?:\.\w+)+)\s*=\s*(f?)(['"])([\s\S]*?)\4\s*$/gm;
    let m;
    while ((m = re.exec(body || ''))) {
      out.push({ target: m[1], path: m[2].slice(1).split('.'), str: true, fstring: !!m[3], value: m[5] });
    }
    const numRe = /(\w+)((?:\.\w+)+)\s*=\s*(-?[\d.]+)\s*$/gm;
    while ((m = numRe.exec(body || ''))) {
      out.push({ target: m[1], path: m[2].slice(1).split('.'), str: false, value: parseFloat(m[3]) });
    }
    return out;
  }

  /** Fill {placeholders} in an f-string with whatever we know right now. */
  function interpolate(text, ctx) {
    return String(text).replace(/\{([^}]*)\}/g, (whole, expr) => {
      const e = expr.trim();
      if (/msg\.data/.test(e)) return ctx.msgData !== undefined ? ctx.msgData : '';
      if (/^msg\./.test(e)) {
        const v = dig(ctx.msg, e.slice(4).split('.'));
        return v === undefined ? '' : (typeof v === 'number' ? round(v) : v);
      }
      if (/self\.get_parameter/.test(e)) {
        const p = e.match(/['"]([^'"]+)['"]/);
        return p && ctx.params && ctx.params[p[1]] !== undefined ? ctx.params[p[1]] : '';
      }
      if (/^self\.\w+$/.test(e)) return ctx.count;
      if (/^\w+$/.test(e)) return ctx.count;
      // f'{self.i:.2f}' and friends
      const base = e.split(':')[0].trim();
      if (/^self\.\w+$/.test(base) || /^\w+$/.test(base)) return ctx.count;
      return '';
    });
  }

  function dig(obj, path) {
    let o = obj;
    for (const k of path) { if (o === undefined || o === null) return undefined; o = o[k]; }
    return o;
  }
  function round(n) { return Math.round(n * 1000) / 1000; }

  function setPath(obj, path, value) {
    let o = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof o[path[i]] !== 'object' || o[path[i]] === null) o[path[i]] = {};
      o = o[path[i]];
    }
    o[path[path.length - 1]] = value;
  }

  /**
   * Build a runnable ROS program spec out of an analysis.
   * This is what `ros2 run my_pkg my_node` actually executes.
   */
  function toSpec(a, meta) {
    const spec = {
      node: a.nodeName || meta.exe,
      userDefined: true,
      describe: 'Your node, from ' + meta.file,
      publishers: [],
      subscribers: [],
      services: [],
      params: {},
      analysis: a,
      sourceFile: meta.file
    };

    a.params.forEach((p) => { spec.params[p.name] = p.value; });

    a.publishers.forEach((p) => {
      spec.publishers.push({ topic: p.topic, type: p.type });
    });
    a.subscriptions.forEach((s) => {
      spec.subscribers.push({ topic: s.topic, type: s.type });
    });
    a.services.forEach((s) => {
      spec.services.push({
        name: s.name, type: s.type,
        handler(req, node) {
          const body = a.defs[s.cb] || '';
          const ctx = { count: node.state.count || 0, msg: req, params: node.params };
          logCalls(body).forEach((l) => node.log(interp(l, ctx), l.level));
          const resTpl = IFACE.srvs[s.type] ? IFACE.fieldsTemplate(IFACE.srvs[s.type].response) : {};
          // response.sum = request.a + request.b   -> do the obvious arithmetic
          const arith = body.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\s*([-+*/])\s*(\w+)\.(\w+)/);
          if (arith) {
            const l = Number(req[arith[4]]) || 0, r = Number(req[arith[7]]) || 0;
            const op = arith[5];
            resTpl[arith[2]] = op === '+' ? l + r : op === '-' ? l - r : op === '*' ? l * r : (r ? l / r : 0);
          }
          return resTpl;
        }
      });
    });

    spec.start = function (node) {
      node.state.count = 0;
      const init = a.defs.__init__ || '';
      const ctx = { count: 0, params: node.params };
      logCalls(init).forEach((l) => node.log(interp(l, ctx), l.level));

      a.timers.forEach((timer) => {
        node.every(timer.period, () => {
          node.state.count = (node.state.count || 0) + 1;
          runCallback(node, a, timer.cb, null);
        });
      });
      if (!a.timers.length && a.publishers.length && !a.subscriptions.length) {
        node.log('This node has a publisher but no timer, so it publishes nothing. ' +
          'Add self.create_timer(1.0, self.timer_callback) to make it talk.', 'WARN');
      }
    };

    spec.onMessage = function (node, topic, msg) {
      a.subscriptions.forEach((s) => {
        if (node.resolve(s.topic) !== topic) return;
        runCallback(node, a, s.cb, msg);
      });
    };

    return spec;
  }

  function interp(l, ctx) { return l.fstring ? interpolate(l.text, ctx) : l.text; }

  /** Run one python callback "in spirit": logs + field writes + publish. */
  function runCallback(node, a, cbName, incoming) {
    const body = a.defs[cbName] || '';
    const ctx = {
      count: node.state.count || 0,
      msg: incoming,
      msgData: incoming ? incoming.data : undefined,
      params: node.params
    };

    /* which publisher does this callback send on? */
    const pubMatch = body.match(/self\.(\w+)\s*\.\s*publish\s*\(\s*(\w+)\s*\)/);
    let published = null;
    if (pubMatch) {
      const varName = pubMatch[1], msgVar = pubMatch[2];
      const pub = a.publishers.filter((p) => p.varName === varName)[0] || a.publishers[0];
      if (pub) {
        const msg = IFACE.template(pub.type);
        fieldAssigns(body).filter((f) => f.target === msgVar).forEach((f) => {
          setPath(msg, f.path, f.str ? (f.fstring ? interpolate(f.value, ctx) : f.value) : f.value);
        });
        ctx.outMsg = msg;
        node.publish(pub.topic, msg, pub.type);
        published = { topic: pub.topic, msg: msg };
      }
    }
    void published;

    logCalls(body).forEach((l) => {
      const c = Object.assign({}, ctx);
      if (ctx.outMsg && /msg\.data/.test(l.text) && !incoming) c.msgData = ctx.outMsg.data;
      node.log(interp(l, c), l.level);
    });
  }

  /**
   * Turn an analysis into plain sentences: exactly what the simulator
   * believes this file will do. Showing this makes the analyser's
   * understanding — and its limits — visible while you type.
   */
  function describe(a) {
    const out = [];
    if (a.nodeName) out.push({ icon: '🏷️', text: 'be a node called **' + a.nodeName + '**' });
    else out.push({ icon: '❓', text: 'have no name yet — add `super().__init__(\'some_name\')`', cls: 'warn' });

    a.publishers.forEach((p) => {
      const period = periodFor(a, p);
      out.push({
        icon: '📤',
        text: 'publish **' + short(p.type) + '** on **' + topic(p.topic) + '**' +
          (period ? ' every **' + period + 's** (' + rate(period) + ')' : ' — but nothing triggers it yet')
      });
    });

    a.subscriptions.forEach((s) => {
      out.push({ icon: '📥', text: 'listen to **' + topic(s.topic) + '** for **' + short(s.type) + '** messages' });
    });

    a.services.forEach((s) => {
      out.push({ icon: '🛎️', text: 'answer the **' + topic(s.name) + '** service' });
    });

    a.params.forEach((p) => {
      out.push({ icon: '⚙️', text: 'have a setting **' + p.name + '** starting at `' + p.value + '`' });
    });

    a.timers.forEach((t) => {
      const used = a.publishers.some((p) => periodFor(a, p) === String(t.period));
      if (!used) out.push({ icon: '⏱️', text: 'run **' + t.cb + '()** every **' + t.period + 's**' });
    });

    a.warnings.forEach((w) => out.push({ icon: '⚠️', text: w, cls: 'warn' }));
    return out;
  }

  /** Which timer fires the callback that publishes on this publisher? */
  function periodFor(a, pub) {
    for (const t of a.timers) {
      const body = a.defs[t.cb] || '';
      const m = body.match(/self\.(\w+)\s*\.\s*publish\s*\(/);
      if (!m) continue;
      if (!pub.varName || m[1] === pub.varName) return String(t.period);
    }
    return null;
  }

  function rate(period) {
    const hz = Math.round((1 / parseFloat(period)) * 10) / 10;
    if (hz === 1) return 'once a second';
    if (hz < 1) return 'once every ' + (Math.round(parseFloat(period) * 10) / 10) + ' seconds';
    return hz + ' times a second';
  }
  function short(type) { return String(type).split('/').pop(); }
  function topic(t) { return t && t[0] === '/' ? t : '/' + t; }

  global.Analyze = {
    python: python, toSpec: toSpec, splitDefs: splitDefs, describe: describe,
    logCalls: logCalls, interpolate: interpolate, KNOWN_TYPES: KNOWN_TYPES
  };
})(window);
