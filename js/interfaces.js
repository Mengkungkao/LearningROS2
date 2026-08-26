/* ===========================================================
   interfaces.js — ROS 2 message / service / action definitions,
   plus the small YAML reader+writer the CLI needs.

   `ros2 topic pub /turtle1/cmd_vel geometry_msgs/msg/Twist "{linear: {x: 2.0}}"`
   is really "parse that YAML, fill in the blanks from the message
   definition, then send it" — that is what lives here.
   =========================================================== */
(function (global) {
  'use strict';

  const P = 'primitive';

  /* Field: { n: name, t: type, d: default, c: trailing comment } */
  const defs = {
    /* ---- std_msgs ------------------------------------- */
    'std_msgs/msg/String': { header: '', fields: [{ n: 'data', t: 'string', d: '' }] },
    'std_msgs/msg/Int32': { header: '', fields: [{ n: 'data', t: 'int32', d: 0 }] },
    'std_msgs/msg/Float64': { header: '', fields: [{ n: 'data', t: 'float64', d: 0 }] },
    'std_msgs/msg/Bool': { header: '', fields: [{ n: 'data', t: 'bool', d: false }] },

    /* ---- geometry_msgs -------------------------------- */
    'geometry_msgs/msg/Vector3': {
      header: '# This represents a vector in free space.',
      fields: [{ n: 'x', t: 'float64', d: 0 }, { n: 'y', t: 'float64', d: 0 }, { n: 'z', t: 'float64', d: 0 }]
    },
    'geometry_msgs/msg/Twist': {
      header: '# This expresses velocity in free space broken into its linear and angular parts.',
      fields: [
        { n: 'linear', t: 'geometry_msgs/msg/Vector3', short: 'Vector3' },
        { n: 'angular', t: 'geometry_msgs/msg/Vector3', short: 'Vector3' }
      ]
    },
    'geometry_msgs/msg/Point': {
      header: '# This contains the position of a point in free space',
      fields: [{ n: 'x', t: 'float64', d: 0 }, { n: 'y', t: 'float64', d: 0 }, { n: 'z', t: 'float64', d: 0 }]
    },

    /* ---- turtlesim ------------------------------------ */
    'turtlesim/msg/Pose': {
      header: '',
      fields: [
        { n: 'x', t: 'float32', d: 0 }, { n: 'y', t: 'float32', d: 0 }, { n: 'theta', t: 'float32', d: 0 },
        { n: 'linear_velocity', t: 'float32', d: 0 }, { n: 'angular_velocity', t: 'float32', d: 0 }
      ]
    },
    'turtlesim/msg/Color': {
      header: '', fields: [{ n: 'r', t: 'uint8', d: 0 }, { n: 'g', t: 'uint8', d: 0 }, { n: 'b', t: 'uint8', d: 0 }]
    },

    /* ---- tf2 ------------------------------------------ */
    'tf2_msgs/msg/TFMessage': {
      header: '', fields: [{ n: 'transforms', t: 'array', d: [] }]
    },

    /* ---- rosgraph ------------------------------------- */
    'rcl_interfaces/msg/ParameterEvent': {
      header: '', fields: [{ n: 'node', t: 'string', d: '' }, { n: 'new_parameters', t: 'array', d: [] },
        { n: 'changed_parameters', t: 'array', d: [] }, { n: 'deleted_parameters', t: 'array', d: [] }]
    },
    'rcl_interfaces/msg/Log': {
      header: '', fields: [{ n: 'level', t: 'uint8', d: 20 }, { n: 'name', t: 'string', d: '' }, { n: 'msg', t: 'string', d: '' }]
    }
  };

  /* ---- services -------------------------------------- */
  const srvs = {
    'turtlesim/srv/Spawn': {
      request: [
        { n: 'x', t: 'float32', d: 0 }, { n: 'y', t: 'float32', d: 0 }, { n: 'theta', t: 'float32', d: 0 },
        { n: 'name', t: 'string', d: '', c: '# Optional.  A unique name will be created and returned if this is empty' }
      ],
      response: [{ n: 'name', t: 'string', d: '' }]
    },
    'turtlesim/srv/Kill': { request: [{ n: 'name', t: 'string', d: '' }], response: [] },
    'std_srvs/srv/Empty': { request: [], response: [] },
    'turtlesim/srv/SetPen': {
      request: [
        { n: 'r', t: 'uint8', d: 0 }, { n: 'g', t: 'uint8', d: 0 }, { n: 'b', t: 'uint8', d: 0 },
        { n: 'width', t: 'uint8', d: 0 }, { n: 'off', t: 'uint8', d: 0 }
      ],
      response: []
    },
    'turtlesim/srv/TeleportAbsolute': {
      request: [{ n: 'x', t: 'float32', d: 0 }, { n: 'y', t: 'float32', d: 0 }, { n: 'theta', t: 'float32', d: 0 }],
      response: []
    },
    'turtlesim/srv/TeleportRelative': {
      request: [{ n: 'linear', t: 'float32', d: 0 }, { n: 'angular', t: 'float32', d: 0 }],
      response: []
    },
    'rcl_interfaces/srv/SetParameters': { request: [{ n: 'parameters', t: 'array', d: [] }], response: [{ n: 'results', t: 'array', d: [] }] },
    'example_interfaces/srv/AddTwoInts': {
      request: [{ n: 'a', t: 'int64', d: 0 }, { n: 'b', t: 'int64', d: 0 }],
      response: [{ n: 'sum', t: 'int64', d: 0 }]
    }
  };

  /* ---- actions --------------------------------------- */
  const acts = {
    'turtlesim/action/RotateAbsolute': {
      goal: [{ n: 'theta', t: 'float32', d: 0, c: '# The desired heading in radians' }],
      result: [{ n: 'delta', t: 'float32', d: 0, c: '# The angular displacement in radians to the starting position' }],
      feedback: [{ n: 'remaining', t: 'float32', d: 0, c: '# The remaining rotation in radians' }]
    }
  };

  function isPrimitive(t) { return t.indexOf('/') === -1; }

  function defaultFor(t) {
    if (t === 'string') return '';
    if (t === 'bool') return false;
    if (t === 'array') return [];
    if (isPrimitive(t)) return 0;
    return template(t);
  }

  /** Build a fully-filled message object for a type name. */
  function template(type) {
    const d = defs[type];
    if (!d) return {};
    const out = {};
    d.fields.forEach((fl) => {
      out[fl.n] = fl.d !== undefined ? (Array.isArray(fl.d) ? [] : fl.d) : defaultFor(fl.t);
    });
    return out;
  }

  function fieldsTemplate(fields) {
    const out = {};
    (fields || []).forEach((fl) => {
      out[fl.n] = fl.d !== undefined ? (Array.isArray(fl.d) ? [] : fl.d) : defaultFor(fl.t);
    });
    return out;
  }

  /** Deep-merge user-supplied YAML values onto a template. */
  function merge(base, extra) {
    if (extra === null || extra === undefined) return base;
    if (typeof base !== 'object' || base === null || Array.isArray(base)) return extra;
    const out = {};
    for (const k in base) out[k] = base[k];
    for (const k in extra) {
      out[k] = (typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k]))
        ? merge(out[k], extra[k]) : extra[k];
    }
    return out;
  }

  /* ---- `ros2 interface show` ------------------------- */
  function renderFields(fields, indent) {
    const lines = [];
    (fields || []).forEach((fl) => {
      const short = fl.short || fl.t.split('/').pop();
      lines.push(indent + short + (short.length < 8 ? ' '.repeat(8 - short.length) : ' ') + fl.n + (fl.c ? ' ' + fl.c : ''));
      if (!isPrimitive(fl.t) && defs[fl.t]) {
        lines.push.apply(lines, renderFields(defs[fl.t].fields, indent + '\t'));
      }
    });
    return lines;
  }

  function show(type) {
    if (defs[type]) {
      const out = [];
      if (defs[type].header) { out.push(defs[type].header); out.push(''); }
      return out.concat(renderFields(defs[type].fields, '')).join('\n');
    }
    if (srvs[type]) {
      return renderFields(srvs[type].request, '').join('\n') + '\n---\n' + renderFields(srvs[type].response, '').join('\n');
    }
    if (acts[type]) {
      const a = acts[type];
      return renderFields(a.goal, '').join('\n') + '\n---\n' +
        renderFields(a.result, '').join('\n') + '\n---\n' +
        renderFields(a.feedback, '').join('\n');
    }
    return null;
  }

  function list() {
    return Object.keys(defs).concat(Object.keys(srvs)).concat(Object.keys(acts)).sort();
  }

  /* =========================================================
     YAML: a forgiving parser for the flow style the ROS 2 CLI
     uses, e.g.  "{linear: {x: 2.0}, angular: {z: 1.8}}"
     ========================================================= */
  function parseYaml(text) {
    if (text === undefined || text === null) return {};
    const s = String(text).trim();
    if (s === '' || s === '{}') return {};
    const p = new Parser(s);
    try {
      const v = p.parseValue();
      return v;
    } catch (e) {
      throw new Error('YAML parse error: ' + e.message);
    }
  }

  function Parser(s) { this.s = s; this.i = 0; }
  Parser.prototype = {
    ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; },
    peek() { return this.s[this.i]; },
    parseValue() {
      this.ws();
      const c = this.peek();
      if (c === '{') return this.parseMap();
      if (c === '[') return this.parseList();
      if (c === '"' || c === "'") return this.parseQuoted();
      return this.parseScalar();
    },
    parseMap() {
      const out = {};
      this.i++; // {
      this.ws();
      if (this.peek() === '}') { this.i++; return out; }
      for (;;) {
        this.ws();
        const key = (this.peek() === '"' || this.peek() === "'") ? this.parseQuoted() : this.parseKey();
        this.ws();
        if (this.peek() !== ':') throw new Error("expected ':' after key '" + key + "'");
        this.i++;
        out[key] = this.parseValue();
        this.ws();
        if (this.peek() === ',') { this.i++; continue; }
        if (this.peek() === '}') { this.i++; return out; }
        if (this.i >= this.s.length) return out;
        throw new Error("expected ',' or '}' near: " + this.s.slice(this.i, this.i + 12));
      }
    },
    parseList() {
      const out = [];
      this.i++; // [
      this.ws();
      if (this.peek() === ']') { this.i++; return out; }
      for (;;) {
        out.push(this.parseValue());
        this.ws();
        if (this.peek() === ',') { this.i++; continue; }
        if (this.peek() === ']') { this.i++; return out; }
        if (this.i >= this.s.length) return out;
        throw new Error("expected ',' or ']'");
      }
    },
    parseQuoted() {
      const q = this.s[this.i++];
      let out = '';
      while (this.i < this.s.length && this.s[this.i] !== q) {
        if (this.s[this.i] === '\\') { this.i++; out += this.s[this.i++]; }
        else out += this.s[this.i++];
      }
      this.i++;
      return out;
    },
    parseKey() {
      let out = '';
      while (this.i < this.s.length && ':,}]'.indexOf(this.s[this.i]) === -1) out += this.s[this.i++];
      return out.trim();
    },
    parseScalar() {
      let out = '';
      while (this.i < this.s.length && ',}]'.indexOf(this.s[this.i]) === -1) out += this.s[this.i++];
      out = out.trim();
      if (out === 'true' || out === 'True') return true;
      if (out === 'false' || out === 'False') return false;
      if (out === 'null' || out === '~' || out === '') return null;
      if (/^-?\d+$/.test(out)) return parseInt(out, 10);
      if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(out) || /^-?\d+\.$/.test(out)) return parseFloat(out);
      return out;
    }
  };

  /** Print a message object the way `ros2 topic echo` does. */
  function dump(obj, indent) {
    indent = indent || '';
    const lines = [];
    if (obj === null || typeof obj !== 'object') return indent + scalar(obj);
    if (Array.isArray(obj)) {
      if (!obj.length) return indent + '[]';
      obj.forEach((v) => {
        if (v !== null && typeof v === 'object') {
          const sub = dump(v, indent + '  ').replace(/^\s{2}/, '');
          lines.push(indent + '- ' + sub.split('\n').join('\n' + indent + '  ').trimStart());
        } else lines.push(indent + '- ' + scalar(v));
      });
      return lines.join('\n');
    }
    for (const k in obj) {
      const v = obj[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        lines.push(indent + k + ':');
        lines.push(dump(v, indent + '  '));
      } else if (Array.isArray(v)) {
        if (!v.length) lines.push(indent + k + ': []');
        else { lines.push(indent + k + ':'); lines.push(dump(v, indent + '  ')); }
      } else {
        lines.push(indent + k + ': ' + scalar(v));
      }
    }
    return lines.join('\n');
  }

  function scalar(v) {
    if (typeof v === 'string') return "'" + v + "'";
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) + (looksFloat(v) ? '' : '') : String(round(v));
    if (v === null || v === undefined) return 'null';
    return String(v);
  }
  function looksFloat() { return false; }
  function round(n) { return Math.round(n * 1e6) / 1e6; }

  /** Same as dump() but integers in float fields print as "1.0". */
  function dumpTyped(obj, type, indent) {
    const d = defs[type];
    if (!d) return dump(obj, indent);
    indent = indent || '';
    const lines = [];
    d.fields.forEach((fl) => {
      const v = obj ? obj[fl.n] : undefined;
      if (!isPrimitive(fl.t) && defs[fl.t]) {
        lines.push(indent + fl.n + ':');
        lines.push(dumpTyped(v || {}, fl.t, indent + '  '));
      } else if (fl.t === 'array') {
        lines.push(indent + fl.n + ': ' + (Array.isArray(v) && v.length ? JSON.stringify(v) : '[]'));
      } else if (fl.t.indexOf('float') === 0) {
        lines.push(indent + fl.n + ': ' + floatStr(v || 0));
      } else {
        lines.push(indent + fl.n + ': ' + scalar(v === undefined ? defaultFor(fl.t) : v));
      }
    });
    return lines.join('\n');
  }

  function floatStr(n) {
    const r = Math.round(Number(n) * 1e6) / 1e6;
    return Number.isInteger(r) ? r.toFixed(1) : String(r);
  }

  global.IFACE = {
    defs: defs, srvs: srvs, acts: acts,
    template: template, fieldsTemplate: fieldsTemplate, merge: merge,
    show: show, list: list, parseYaml: parseYaml, dump: dump, dumpTyped: dumpTyped,
    floatStr: floatStr, isPrimitive: isPrimitive, P: P
  };
})(window);
