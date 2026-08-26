/* ===========================================================
   util.js — tiny helpers + a global event bus.
   No frameworks, no build step. Just plain browser JavaScript.
   =========================================================== */
(function (global) {
  'use strict';

  /* ---------- Event bus ---------------------------------- */
  const listeners = Object.create(null);

  const Bus = {
    on(evt, fn) {
      (listeners[evt] || (listeners[evt] = [])).push(fn);
      return () => Bus.off(evt, fn);
    },
    off(evt, fn) {
      const arr = listeners[evt];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    emit(evt, payload) {
      const arr = listeners[evt];
      if (arr) arr.slice().forEach((fn) => {
        try { fn(payload); } catch (e) { console.error('[bus:' + evt + ']', e); }
      });
      const star = listeners['*'];
      if (star) star.slice().forEach((fn) => {
        try { fn(evt, payload); } catch (e) { console.error(e); }
      });
    }
  };

  /* ---------- DOM helpers -------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- misc --------------------------------------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function pad(n, w) {
    let s = String(n);
    while (s.length < w) s = ' ' + s;
    return s;
  }

  /** Column-format a list of strings, `ls` style. */
  function columns(items, width) {
    if (!items.length) return '';
    width = width || 76;
    const w = Math.max.apply(null, items.map((s) => stripTags(s).length)) + 2;
    const cols = Math.max(1, Math.floor(width / w));
    const rows = Math.ceil(items.length / cols);
    const out = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const item = items[c * rows + r];
        if (item === undefined) continue;
        line += item + ' '.repeat(Math.max(1, w - stripTags(item).length));
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out.join('\n');
  }

  function stripTags(s) { return String(s).replace(/<[^>]*>/g, ''); }

  /** Deterministic-ish tiny id. */
  let _idc = 0;
  function uid(prefix) { return (prefix || 'id') + '_' + (++_idc); }

  /** localStorage that never throws (private mode, blocked cookies...). */
  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  function nowSec() { return Date.now() / 1000; }

  /** Format a float the way ROS 2 CLI tends to. */
  function f(n, digits) {
    const d = digits === undefined ? 3 : digits;
    if (!isFinite(n)) return String(n);
    return Number(n).toFixed(d);
  }

  global.U = { Bus, $, $$, el, escapeHtml, clamp, pad, columns, stripTags, uid, Store, nowSec, f };
})(window);
