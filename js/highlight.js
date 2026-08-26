/* ===========================================================
   highlight.js — colours for the editor.

   A textarea cannot show colours, so the editor stacks a
   coloured <pre> underneath a see-through textarea. Both use
   the same font and metrics, so the letters line up exactly.
   =========================================================== */
(function (global) {
  'use strict';
  const esc = global.U.escapeHtml;

  const PY_KEYWORDS = ('False None True and as assert async await break class continue def del elif else ' +
    'except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield')
    .split(' ');

  /* ROS-flavoured names worth making obvious to a learner */
  const ROS_NAMES = ('rclpy Node create_publisher create_subscription create_timer create_service ' +
    'declare_parameter get_parameter get_logger publish spin init shutdown destroy_node super ' +
    'LaunchDescription generate_launch_description').split(' ');

  /**
   * Tokenise, then escape. Never build HTML out of raw source: the
   * source is whatever the student typed.
   */
  function python(src) {
    const out = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
      const c = src[i];

      /* comment */
      if (c === '#') {
        let j = src.indexOf('\n', i);
        if (j < 0) j = n;
        out.push(span('c', src.slice(i, j)));
        i = j;
        continue;
      }

      /* string, including f-strings and triple quotes */
      if (c === '"' || c === "'" || ((c === 'f' || c === 'r' || c === 'b') && (src[i + 1] === '"' || src[i + 1] === "'"))) {
        const start = i;
        if (c === 'f' || c === 'r' || c === 'b') i++;
        const q = src[i];
        const triple = src.slice(i, i + 3) === q + q + q;
        i += triple ? 3 : 1;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (triple ? src.slice(i, i + 3) === q + q + q : src[i] === q) { i += triple ? 3 : 1; break; }
          if (!triple && src[i] === '\n') break;
          i++;
        }
        out.push(span('s', src.slice(start, i)));
        continue;
      }

      /* number */
      if (/[0-9]/.test(c) && !/[\w.]/.test(src[i - 1] || '')) {
        const start = i;
        while (i < n && /[0-9._eE]/.test(src[i])) i++;
        out.push(span('n', src.slice(start, i)));
        continue;
      }

      /* word */
      if (/[A-Za-z_]/.test(c)) {
        const start = i;
        while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
        const word = src.slice(start, i);
        const isCall = src[i] === '(';
        const afterDef = /\b(def|class)\s+$/.test(src.slice(Math.max(0, start - 8), start));
        if (PY_KEYWORDS.indexOf(word) >= 0) out.push(span('k', word));
        else if (afterDef) out.push(span('d', word));
        else if (ROS_NAMES.indexOf(word) >= 0) out.push(span('r', word));
        else if (word === 'self') out.push(span('self', word));
        else if (isCall) out.push(span('f', word));
        else out.push(esc(word));
        continue;
      }

      out.push(esc(c));
      i++;
    }
    return out.join('');
  }

  function xml(src) {
    return esc(src)
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<i class="c">$1</i>')
      .replace(/(&lt;\/?)([\w:-]+)/g, '$1<i class="k">$2</i>')
      .replace(/([\w:-]+)=(&quot;.*?&quot;)/g, '<i class="r">$1</i>=<i class="s">$2</i>');
  }

  function yaml(src) {
    return esc(src)
      .split('\n')
      .map((line) => line
        .replace(/^(\s*)(#.*)$/, '$1<i class="c">$2</i>')
        .replace(/^(\s*-?\s*)([\w./-]+)(:)/, '$1<i class="r">$2</i>$3'))
      .join('\n');
  }

  function span(cls, text) { return '<i class="' + cls + '">' + esc(text) + '</i>'; }

  /** Pick a highlighter from the file name. */
  function forPath(path, src) {
    if (/\.py$/.test(path)) return python(src);
    if (/\.(xml|launch)$/.test(path)) return xml(src);
    if (/\.(yaml|yml|cfg|msg|srv|action)$/.test(path)) return yaml(src);
    return esc(src);
  }

  global.Highlight = { python: python, xml: xml, yaml: yaml, forPath: forPath };
})(window);
