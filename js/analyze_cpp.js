/* ===========================================================
   analyze_cpp.js — read the student's C++ node the same way
   analyze.js reads their Python.

   It produces the identical shape, so the one spec builder in
   analyze.js runs either language. That is the point of the
   lesson too: the language changes, the graph does not.
   =========================================================== */
(function (global) {
  'use strict';
  const Analyze = global.Analyze;

  /** std_msgs::msg::String  ->  std_msgs/msg/String */
  function typeOf(cxx) {
    return String(cxx).trim().replace(/^::/, '').split('::').join('/');
  }

  /** 500ms · 1s · std::chrono::milliseconds(500) -> seconds */
  function period(text) {
    const t = String(text).trim();
    let m = t.match(/^(\d+(?:\.\d+)?)\s*ms$/);
    if (m) return parseFloat(m[1]) / 1000;
    m = t.match(/^(\d+(?:\.\d+)?)\s*s$/);
    if (m) return parseFloat(m[1]);
    m = t.match(/milliseconds\s*\(\s*(\d+)\s*\)/);
    if (m) return parseInt(m[1], 10) / 1000;
    m = t.match(/seconds\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
    if (m) return parseFloat(m[1]);
    m = t.match(/^(\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]);
    return 1;
  }

  /**
   * Split C++ into { methodName: body } by matching braces. Regex alone
   * cannot find the end of a function, so walk the depth.
   */
  function splitDefs(src) {
    const defs = Object.create(null);
    const re = /(?:^|\n)\s*(?:[\w:<>,\s&*~]+?\s+)?([A-Za-z_]\w*)\s*\(([^;{)]*)\)\s*(?:const\s*)?(?::[^{]*)?\{/g;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (/^(if|for|while|switch|catch|return|sizeof)$/.test(name)) continue;
      let i = src.indexOf('{', m.index + m[0].length - 1);
      if (i < 0) continue;
      let depth = 0, end = i;
      for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      defs[name] = src.slice(i + 1, end);
      re.lastIndex = end;
    }
    return defs;
  }

  /** RCLCPP_INFO(this->get_logger(), "fmt", a, b) */
  function logCalls(body) {
    const out = [];
    const re = /RCLCPP_(INFO|WARN|ERROR|DEBUG)(?:_STREAM)?\s*\(([\s\S]*?)\)\s*;/g;
    let m;
    while ((m = re.exec(body || ''))) {
      const level = m[1] === 'WARN' ? 'WARN' : m[1];
      const args = splitArgs(m[2]);
      args.shift();                                  // the logger itself
      const first = (args.shift() || '').trim();
      const lit = first.match(/^"([\s\S]*)"$/);
      out.push({ level: level, fmt: lit ? lit[1] : first, args: args.map((x) => x.trim()), stream: !lit });
    }
    return out;
  }

  /**
   * Split "a, b(c, d), e" on the commas that are not inside brackets.
   *
   * Only ( [ { count. Angle brackets must not: `this->get_logger()` would
   * push the depth negative on the `>` of the arrow, and then no comma is
   * ever at depth 0 — which silently emptied every log line.
   */
  function splitArgs(text) {
    const out = [];
    let depth = 0, cur = '', q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { cur += c; if (c === q && text[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      if (c === ')' || c === ']' || c === '}') depth--;
      if (c === ',' && depth <= 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  /** message.data = "Hello " + std::to_string(count_++);  ·  msg.linear.x = 2.0; */
  function fieldAssigns(body) {
    const out = [];
    const re = /(\w+)((?:\.\w+)+)\s*=\s*([^;]+);/g;
    let m;
    while ((m = re.exec(body || ''))) {
      out.push({ target: m[1], path: m[2].slice(1).split('.'), expr: m[3].trim() });
    }
    return out;
  }

  /**
   * Work out what a simple C++ right-hand side comes to. Handles the
   * shapes the tutorials use: a literal, a number, and string
   * concatenation with std::to_string(counter).
   */
  function evalExpr(expr, ctx) {
    const e = String(expr).trim();
    const num = e.match(/^-?\d+(\.\d+)?$/);
    if (num) return parseFloat(e);
    if (/^".*"$/.test(e) && e.indexOf('+') < 0) return e.slice(1, -1);

    if (e.indexOf('+') >= 0 || /to_string/.test(e)) {
      let out = '';
      splitPlus(e).forEach((part) => {
        const p = part.trim();
        const lit = p.match(/^"([\s\S]*)"$/);
        if (lit) { out += lit[1]; return; }
        if (/to_string/.test(p)) { out += String(ctx.count); return; }
        if (/count_?/.test(p)) { out += String(ctx.count); return; }
        if (/^msg(->|\.)/.test(p)) { out += ctx.msgData !== undefined ? ctx.msgData : ''; return; }
      });
      return out;
    }
    if (/count_?/.test(e)) return ctx.count;
    return '';
  }

  function splitPlus(text) {
    const out = [];
    let depth = 0, cur = '', q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { cur += c; if (c === q && text[i - 1] !== '\\') q = null; continue; }
      if (c === '"') { q = c; cur += c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === '+' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  /** printf-style: "Publishing: '%s'" + ["message.data.c_str()"] */
  function format(fmt, args, ctx) {
    let i = 0;
    return String(fmt)
      .replace(/%[-+ 0-9.]*(?:l|ll|z|h)?[sdifugxc]/g, () => {
        const a = args[i++];
        return a === undefined ? '' : resolveArg(a, ctx);
      })
      .replace(/\\n/g, '\n');
  }

  function resolveArg(arg, ctx) {
    const a = String(arg).replace(/\.c_str\(\)\s*$/, '').trim();
    if (/^msg(->|\.)/.test(a) || /\bmsg\b/.test(a)) {
      return ctx.msgData !== undefined ? ctx.msgData : (ctx.outData !== undefined ? ctx.outData : '');
    }
    if (/count_?/.test(a)) return String(ctx.count);
    if (/get_parameter/.test(a)) {
      const p = a.match(/["']([^"']+)["']/);
      return p && ctx.params && ctx.params[p[1]] !== undefined ? String(ctx.params[p[1]]) : '';
    }
    if (ctx.outData !== undefined) return ctx.outData;
    return '';
  }

  /* ---- the parser ------------------------------------- */
  function cpp(src) {
    const a = {
      ok: true, errors: [], warnings: [], lang: 'cpp',
      className: null, nodeName: null, imports: Object.create(null),
      publishers: [], subscriptions: [], services: [], timers: [], params: [],
      defs: splitDefs(src), initLogs: [], usesRclcpp: /#include\s*[<"]rclcpp\/rclcpp\.hpp/.test(src)
    };

    if (!a.usesRclcpp) a.warnings.push('This file never includes <rclcpp/rclcpp.hpp> — a C++ ROS 2 node needs it.');

    let m = src.match(/class\s+(\w+)\s*:\s*public\s+rclcpp::Node/);
    if (m) a.className = m[1];
    else a.warnings.push('No `class Something : public rclcpp::Node` found — is this a ROS 2 node?');

    m = src.match(/:\s*(?:rclcpp::)?Node\s*\(\s*"([^"]+)"/);
    if (m) a.nodeName = m[1];
    else a.warnings.push('No node name found — expected  : Node("some_name")  in the constructor.');

    const pubRe = /(?:(\w+)\s*=\s*)?(?:this->)?create_publisher\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"\s*,\s*([^)]*)\)/g;
    while ((m = pubRe.exec(src))) {
      a.publishers.push({
        varName: m[1] ? m[1].replace(/_$/, '_') : null,
        type: typeOf(m[2]), cls: m[2], topic: m[3], qos: (m[4] || '10').trim()
      });
    }

    const subRe = /create_subscription\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"\s*,\s*([^,]+),\s*([\s\S]*?)\)\s*;/g;
    while ((m = subRe.exec(src))) {
      const bind = m[4].match(/&\s*\w+\s*::\s*(\w+)/);
      a.subscriptions.push({
        type: typeOf(m[1]), cls: m[1], topic: m[2], qos: m[3].trim(),
        cb: bind ? bind[1] : null, lambda: !bind
      });
    }

    const timerRe = /(?:(\w+)\s*=\s*)?(?:this->)?create_wall_timer\s*\(\s*([^,]+),\s*([\s\S]*?)\)\s*;/g;
    while ((m = timerRe.exec(src))) {
      const bind = m[3].match(/&\s*\w+\s*::\s*(\w+)/);
      a.timers.push({ varName: m[1] || null, period: period(m[2]), cb: bind ? bind[1] : null, lambda: !bind });
    }

    const srvRe = /create_service\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"\s*,\s*([\s\S]*?)\)\s*;/g;
    while ((m = srvRe.exec(src))) {
      const bind = m[3].match(/&\s*(\w+)/);
      a.services.push({ type: typeOf(m[1]), name: m[2], cb: bind ? bind[1] : null });
    }

    const parRe = /declare_parameter\s*(?:<[\w:]+>)?\s*\(\s*"([^"]+)"\s*,\s*([^)]*)\)/g;
    while ((m = parRe.exec(src))) {
      let v = m[2].trim();
      if (/^".*"$/.test(v)) v = v.slice(1, -1);
      else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
      else if (/^-?[\d.]+$/.test(v)) v = parseFloat(v);
      else if (v === 'true' || v === 'false') v = v === 'true';
      a.params.push({ name: m[1], value: v });
    }

    if (!/rclcpp::spin\s*\(/.test(src)) {
      a.warnings.push('main() never calls rclcpp::spin(...), so the node would start and immediately exit.');
    }
    if (!a.publishers.length && !a.subscriptions.length && !a.services.length) {
      a.warnings.push('This node neither publishes, subscribes, nor serves anything. It will just sit there.');
    }
    return a;
  }

  Analyze.cpp = cpp;
  Analyze.cppHelpers = {
    typeOf: typeOf, period: period, splitDefs: splitDefs, logCalls: logCalls,
    fieldAssigns: fieldAssigns, evalExpr: evalExpr, format: format, splitArgs: splitArgs
  };
})(window);
