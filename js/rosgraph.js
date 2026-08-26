/* ===========================================================
   rosgraph.js — the pretend ROS 2 system.

   A "node" here is a little JavaScript object that wakes up 20
   times a second, maybe publishes a message, and maybe reacts to
   messages other nodes sent. That is genuinely how ROS 2 works,
   minus the network.
   =========================================================== */
(function (global) {
  'use strict';
  const Bus = global.U.Bus;
  const IFACE = global.IFACE;

  const TICK_MS = 50;

  const ROS = {
    distro: 'jazzy',
    sourced: false,          // has the student run `source ...setup.bash` yet?
    nodes: Object.create(null),
    topics: Object.create(null),
    services: Object.create(null),
    actions: Object.create(null),
    programs: Object.create(null),   // "pkg/exe" -> spec  (filled by programs.js)
    packages: Object.create(null),   // pkg -> {name, path, kind, execs:{}}
    bags: Object.create(null),
    started: 0,
    _timer: null,
    _streams: [],
    _t0: Date.now(),

    /* ---- clock ----------------------------------------- */
    time() { return (Date.now() - this._t0) / 1000; },
    stamp() {
      const t = Date.now() / 1000;
      return { sec: Math.floor(t), nanosec: Math.round((t % 1) * 1e9) };
    },

    /* ---- registration ---------------------------------- */
    register(key, spec) { this.programs[key] = spec; },

    knownExecutables() { return Object.keys(this.programs).sort(); },

    execsForPackage(pkg) {
      return Object.keys(this.programs)
        .filter((k) => k.split('/')[0] === pkg)
        .map((k) => k.split('/')[1]);
    },

    /* ---- topics ---------------------------------------- */
    ensureTopic(name, type) {
      let t = this.topics[name];
      if (!t) {
        t = this.topics[name] = {
          name: name, type: type || 'unknown', pubs: [], subs: [],
          count: 0, last: null, times: [], qos: { reliability: 'RELIABLE', durability: 'VOLATILE', depth: 10 }
        };
        Bus.emit('ros:topic', { action: 'create', topic: name, type: t.type });
      }
      if (type && (t.type === 'unknown' || !t.type)) t.type = type;
      return t;
    },

    dropTopicIfEmpty(name) {
      const t = this.topics[name];
      if (t && !t.pubs.length && !t.subs.length && !this._streams.some((s) => s.topic === name)) {
        delete this.topics[name];
        Bus.emit('ros:topic', { action: 'delete', topic: name });
      }
    },

    /* ---- starting a node ------------------------------- */
    /**
     * start('turtlesim', 'turtlesim_node', {args: [...]})
     * Returns {ok:true, node} or {ok:false, error}.
     */
    start(pkg, exe, opts) {
      opts = opts || {};
      const key = pkg + '/' + exe;
      const spec = this.programs[key];
      if (!spec) return { ok: false, error: "No executable found (package '" + pkg + "', executable '" + exe + "')" };

      const parsed = parseRosArgs(opts.args || []);
      const ns = parsed.ns || spec.ns || '/';
      const baseName = parsed.nodeName || spec.node || exe;
      const fullname = (ns === '/' ? '/' : ns + '/') + baseName;

      if (this.nodes[fullname] && !spec.multi) {
        return { ok: false, error: null, duplicate: true, node: this.nodes[fullname] };
      }

      const node = {
        id: ++this.started,
        name: baseName,
        ns: ns,
        fullname: fullname,
        pkg: pkg, exe: exe, spec: spec,
        remaps: parsed.remaps,
        params: Object.assign({}, spec.params || {}, parsed.params),
        paramTypes: Object.assign({}, spec.paramTypes || {}),
        pubs: [], subs: [], srvs: [], acts: [],
        rawArgs: (opts.args || []).slice(),
        state: {},
        startedAt: this.time(),
        timers: [],
        _log: []
      };

      node.resolve = (topic) => {
        let t = topic;
        if (node.remaps[t] !== undefined) t = node.remaps[t];
        if (t[0] !== '/') t = '/' + t;
        if (node.ns !== '/') t = node.ns + t;
        return t;
      };

      node.publish = (topic, msg, type) => {
        const full = node.resolve(topic);
        ROS.publish(full, msg, node, type);
      };

      node.log = (text, level) => {
        const line = '[' + (level || 'INFO') + '] [' + global.U.f(ROS.time(), 6) + '] [' + node.name + ']: ' + text;
        node._log.push(line);
        if (node._log.length > 200) node._log.shift();
        const rosout = ROS.topics['/rosout'];
        if (rosout) {
          rosout.count++;
          rosout.times.push(Date.now());
          if (rosout.times.length > 60) rosout.times.shift();
          const m = { level: level === 'WARN' ? 30 : level === 'ERROR' ? 40 : 20, name: node.name, msg: text };
          rosout.last = m;
          ROS._streams.slice().forEach((s) => { if (s.topic === '/rosout') s.cb(m, rosout); });
        }
        Bus.emit('term:write', { text: line, cls: 'log-' + (level || 'INFO').toLowerCase() });
      };

      node.every = (period, fn) => { node.timers.push({ period: period, next: ROS.time() + period, fn: fn }); };

      /* declare interfaces from the spec */
      (spec.publishers || []).forEach((p) => {
        const full = node.resolve(p.topic);
        const t = this.ensureTopic(full, p.type);
        t.pubs.push(node.fullname);
        node.pubs.push({ topic: full, type: p.type, rate: p.rate });
        if (p.rate) {
          node.every(1 / p.rate, () => {
            const m = p.build ? p.build(node) : IFACE.template(p.type);
            if (m !== null && m !== undefined) node.publish(p.topic, m, p.type);
          });
        }
      });
      (spec.subscribers || []).forEach((s) => {
        const full = node.resolve(s.topic);
        const t = this.ensureTopic(full, s.type);
        t.subs.push(node.fullname);
        node.subs.push({ topic: full, type: s.type });
      });
      (spec.services || []).forEach((s) => {
        const full = node.resolve(s.name);
        this.services[full] = { name: full, type: s.type, node: node.fullname, handler: s.handler };
        node.srvs.push({ name: full, type: s.type });
      });
      (spec.actions || []).forEach((a) => {
        const full = node.resolve(a.name);
        this.actions[full] = { name: full, type: a.type, node: node.fullname, handler: a.handler };
        node.acts.push({ name: full, type: a.type });
      });

      /* Every real ROS 2 node quietly publishes on these two. */
      ['/rosout', '/parameter_events'].forEach((t, i) => {
        const type = i === 0 ? 'rcl_interfaces/msg/Log' : 'rcl_interfaces/msg/ParameterEvent';
        const topic = this.ensureTopic(t, type);
        topic.hidden = true;
        topic.pubs.push(fullname);
        node.pubs.push({ topic: t, type: type, hidden: true });
      });

      this.nodes[fullname] = node;
      if (spec.start) spec.start(node, this);

      Bus.emit('ros:node', { action: 'start', node: fullname, pkg: pkg, exe: exe });
      Bus.emit('graph:dirty', {});
      this._ensureTimer();
      return { ok: true, node: node };
    },

    stop(fullname) {
      const node = this.nodes[fullname];
      if (!node) return false;
      if (node.spec.stop) { try { node.spec.stop(node, this); } catch (e) { console.error(e); } }
      node.pubs.forEach((p) => {
        const t = this.topics[p.topic];
        if (t) { const i = t.pubs.indexOf(fullname); if (i >= 0) t.pubs.splice(i, 1); }
      });
      node.subs.forEach((s) => {
        const t = this.topics[s.topic];
        if (t) { const i = t.subs.indexOf(fullname); if (i >= 0) t.subs.splice(i, 1); }
      });
      node.srvs.forEach((s) => { delete this.services[s.name]; });
      node.acts.forEach((a) => { delete this.actions[a.name]; });
      delete this.nodes[fullname];
      node.pubs.concat(node.subs).forEach((x) => this.dropTopicIfEmpty(x.topic));
      Bus.emit('ros:node', { action: 'stop', node: fullname });
      Bus.emit('graph:dirty', {});
      return true;
    },

    stopAll() { Object.keys(this.nodes).forEach((n) => this.stop(n)); },

    nodeList() { return Object.keys(this.nodes).sort(); },

    /** Find a running node by short name, full name, or "pkg/exe". */
    findNode(q) {
      if (this.nodes[q]) return this.nodes[q];
      if (this.nodes['/' + q]) return this.nodes['/' + q];
      const hit = Object.keys(this.nodes).filter((n) => this.nodes[n].name === q || n.endsWith('/' + q));
      return hit.length ? this.nodes[hit[0]] : null;
    },

    /* ---- message delivery ------------------------------ */
    publish(topic, msg, fromNode, type) {
      const t = this.ensureTopic(topic, type);
      t.count++;
      t.last = msg;
      t.times.push(Date.now());
      if (t.times.length > 60) t.times.shift();

      t.subs.slice().forEach((subName) => {
        const n = this.nodes[subName];
        if (n && n.spec.onMessage) {
          try { n.spec.onMessage(n, topic, msg, this); } catch (e) { console.error('[node ' + subName + ']', e); }
        }
      });

      this._streams.slice().forEach((s) => {
        if (s.topic === topic) { try { s.cb(msg, t); } catch (e) { console.error(e); } }
      });

      Object.keys(this.bags).forEach((b) => {
        const bag = this.bags[b];
        if (bag.recording && (bag.all || bag.topics.indexOf(topic) >= 0)) {
          bag.messages.push({ t: this.time(), topic: topic, type: t.type, msg: JSON.parse(JSON.stringify(msg)) });
          bag.counts[topic] = (bag.counts[topic] || 0) + 1;
        }
      });

      Bus.emit('ros:msg', { topic: topic, msg: msg, from: fromNode ? fromNode.fullname : null, type: t.type });
    },

    /** Used by `ros2 topic echo` — returns an unsubscribe function. */
    subscribeRaw(topic, cb) {
      const s = { topic: topic, cb: cb };
      this._streams.push(s);
      this.ensureTopic(topic);
      Bus.emit('graph:dirty', {});
      return () => {
        const i = this._streams.indexOf(s);
        if (i >= 0) this._streams.splice(i, 1);
        this.dropTopicIfEmpty(topic);
        Bus.emit('graph:dirty', {});
      };
    },

    hz(topic) {
      const t = this.topics[topic];
      if (!t || t.times.length < 2) return null;
      const times = t.times.filter((x) => Date.now() - x < 5000);
      if (times.length < 2) return null;
      const span = (times[times.length - 1] - times[0]) / 1000;
      const rate = (times.length - 1) / span;
      const deltas = [];
      for (let i = 1; i < times.length; i++) deltas.push((times[i] - times[i - 1]) / 1000);
      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const varr = deltas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / deltas.length;
      return {
        rate: rate, min: Math.min.apply(null, deltas), max: Math.max.apply(null, deltas),
        std: Math.sqrt(varr), window: times.length
      };
    },

    /* ---- services & actions ---------------------------- */
    callService(name, request) {
      const s = this.services[name];
      if (!s) return { ok: false, error: "service '" + name + "' not available" };
      const node = this.nodes[s.node];
      let response = {};
      try { response = s.handler ? (s.handler(request, node, this) || {}) : {}; }
      catch (e) { return { ok: false, error: String(e.message || e) }; }
      Bus.emit('ros:service', { name: name, request: request, response: response });
      return { ok: true, response: response, type: s.type };
    },

    sendGoal(name, goal, onFeedback, onResult) {
      const a = this.actions[name];
      if (!a) return { ok: false, error: "action '" + name + "' not available" };
      const node = this.nodes[a.node];
      try { a.handler(goal, node, this, onFeedback, onResult); }
      catch (e) { return { ok: false, error: String(e.message || e) }; }
      Bus.emit('ros:action', { name: name, goal: goal });
      return { ok: true, type: a.type };
    },

    /* ---- parameters ------------------------------------ */
    setParam(nodeName, key, value) {
      const n = this.findNode(nodeName);
      if (!n) return { ok: false, error: 'Node not found' };
      if (!(key in n.params)) return { ok: false, error: 'Parameter not declared: ' + key };
      const old = n.params[key];
      n.params[key] = value;
      if (n.spec.onParam) { try { n.spec.onParam(n, key, value, old, this); } catch (e) { console.error(e); } }
      Bus.emit('ros:param', { node: n.fullname, key: key, value: value });
      return { ok: true };
    },

    /* ---- the heartbeat --------------------------------- */
    _ensureTimer() {
      if (this._timer) return;
      let last = Date.now();
      this._timer = setInterval(() => {
        const now = Date.now();
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        this.tick(dt);
      }, TICK_MS);
    },

    tick(dt) {
      const t = this.time();
      Object.keys(this.nodes).forEach((name) => {
        const node = this.nodes[name];
        if (!node) return;
        node.timers.forEach((tm) => {
          while (t >= tm.next) {
            tm.next += tm.period;
            try { tm.fn(node); } catch (e) { console.error('[timer ' + name + ']', e); }
          }
        });
        if (node.spec.tick) {
          try { node.spec.tick(node, dt, this); } catch (e) { console.error('[tick ' + name + ']', e); }
        }
      });
      Bus.emit('ros:tick', { dt: dt, t: t });
    },


    /* ---- adding interfaces while a node is running ------ */
    addPub(node, topic, type) {
      const full = node.resolve(topic);
      const t = this.ensureTopic(full, type);
      if (t.pubs.indexOf(node.fullname) < 0) t.pubs.push(node.fullname);
      if (!node.pubs.some((p) => p.topic === full)) node.pubs.push({ topic: full, type: type });
      Bus.emit('graph:dirty', {});
      return full;
    },

    addSub(node, topic, type) {
      const full = node.resolve(topic);
      const t = this.ensureTopic(full, type);
      if (t.subs.indexOf(node.fullname) < 0) t.subs.push(node.fullname);
      if (!node.subs.some((s) => s.topic === full)) node.subs.push({ topic: full, type: type });
      Bus.emit('graph:dirty', {});
      return full;
    },

    removePub(node, topic) {
      const full = node.resolve(topic);
      const t = this.topics[full];
      if (t) { const i = t.pubs.indexOf(node.fullname); if (i >= 0) t.pubs.splice(i, 1); }
      node.pubs = node.pubs.filter((p) => p.topic !== full);
      this.dropTopicIfEmpty(full);
      Bus.emit('graph:dirty', {});
    },

    addService(node, name, type, handler) {
      const full = node.resolve(name);
      this.services[full] = { name: full, type: type, node: node.fullname, handler: handler };
      if (!node.srvs.some((s) => s.name === full)) node.srvs.push({ name: full, type: type });
      Bus.emit('graph:dirty', {});
      return full;
    },

    removeService(node, name) {
      const full = node.resolve(name);
      delete this.services[full];
      node.srvs = node.srvs.filter((s) => s.name !== full);
      Bus.emit('graph:dirty', {});
    },

    /* ---- housekeeping ---------------------------------- */
    reset() {
      this.stopAll();
      this.topics = Object.create(null);
      this.services = Object.create(null);
      this.actions = Object.create(null);
      this.bags = Object.create(null);
      Object.keys(this.packages).forEach((p) => {
        if (this.packages[p].kind !== 'installed') delete this.packages[p];
      });
      this.frames = [];
      this._streams = [];
      this.sourced = false;
      Object.keys(this.programs).forEach((k) => {
        if (this.programs[k].userDefined) delete this.programs[k];
      });
      Bus.emit('graph:dirty', {});
      Bus.emit('ros:reset', {});
    },

    /** Everything the Graph panel needs, in one object. */
    snapshot() {
      const nodes = Object.keys(this.nodes).map((n) => ({
        name: n, pkg: this.nodes[n].pkg, exe: this.nodes[n].exe,
        pubs: this.nodes[n].pubs.map((p) => p.topic),
        subs: this.nodes[n].subs.map((s) => s.topic)
      }));
      const topics = Object.keys(this.topics).map((t) => ({
        name: t, type: this.topics[t].type,
        pubs: this.topics[t].pubs.slice(), subs: this.topics[t].subs.slice(),
        count: this.topics[t].count
      }));
      return { nodes: nodes, topics: topics };
    }
  };

  /* ---- `--ros-args` parsing --------------------------- */
  function parseRosArgs(args) {
    const out = { remaps: Object.create(null), params: Object.create(null), ns: null, nodeName: null };
    let inRos = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--ros-args') { inRos = true; continue; }
      if (a === '--') { inRos = false; continue; }
      if (!inRos) continue;
      if (a === '-r' || a === '--remap') {
        const rule = args[++i] || '';
        const m = rule.split(':=');
        if (m.length === 2) {
          const from = m[0].trim(), to = m[1].trim();
          if (from === '__node') out.nodeName = to;
          else if (from === '__ns') out.ns = to;
          else out.remaps[from[0] === '/' ? from : '/' + from] = to;
        }
      } else if (a === '-p' || a === '--param') {
        const rule = args[++i] || '';
        const m = rule.split(':=');
        if (m.length === 2) out.params[m[0].trim()] = coerce(m[1].trim());
      }
    }
    return out;
  }

  function coerce(v) {
    if (v === 'true' || v === 'True') return true;
    if (v === 'false' || v === 'False') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
    if ((v[0] === '"' && v.slice(-1) === '"') || (v[0] === "'" && v.slice(-1) === "'")) return v.slice(1, -1);
    return v;
  }

  ROS.parseRosArgs = parseRosArgs;
  ROS.coerce = coerce;
  ROS._ensureTimer();

  global.ROS = ROS;
})(window);
