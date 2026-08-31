/* ===========================================================
   terminal.js — the black window with the blinking cursor.
   History, Tab-completion, Ctrl+C, and streaming commands.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, VFS = global.VFS, Shell = global.Shell, ROS = global.ROS, Bus = U.Bus;

  const Term = {
    out: null, input: null, promptEl: null, wrap: null, stopBtn: null,
    hist: [], histIdx: 0, draft: '',
    stream: null,
    typing: null,

    init(root) {
      this.wrap = root;
      this.out = U.$('#term-out', root);
      this.input = U.$('#term-input', root);
      this.promptEl = U.$('#term-prompt', root);
      this.stopBtn = U.$('#term-stop', root);

      this.hist = U.Store.get('ros2academy.history', []) || [];
      this.histIdx = this.hist.length;

      this.input.addEventListener('keydown', (e) => this.onKey(e));
      root.addEventListener('mousedown', (e) => {
        if (window.getSelection().toString()) return;
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        setTimeout(() => this.focus(), 0);
      });
      this.stopBtn.addEventListener('click', () => this.interrupt());

      Bus.on('term:write', (p) => this.write(p.text, p.cls));
      Bus.on('term:clear', () => this.clear());
      Bus.on('term:endstream', () => this.endStream(true));
      Bus.on('vfs:cwd', () => this.setPrompt());
      Bus.on('term:type', (p) => this.typeCommand(p.text, p.run !== false, p.instant));

      this.setPrompt();
      this.banner();
    },

    banner() {
      const art =
        '  ____   ___  ____    ____      _                _                       \n' +
        ' |  _ \\ / _ \\/ ___|  |___ \\    / \\   ___ __ _  __| | ___ _ __ ___  _   _ \n' +
        " | |_) | | | \\___ \\    __) |  / _ \\ / __/ _` |/ _` |/ _ \\ '_ ` _ \\| | | |\n" +
        ' |  _ <| |_| |___) |  / __/  / ___ \\ (_| (_| | (_| |  __/ | | | | | |_| |\n' +
        ' |_| \\_\\\\___/|____/  |_____|/_/   \\_\\___\\__,_|\\__,_|\\___|_| |_| |_|\\__, |\n' +
        '                                                                   |___/ ';
      this.write(art, 'banner');
      this.writeHtml('<b class="small-title">ROS 2 ACADEMY</b>');
      this.write('');
      this.writeHtml('Welcome! This is a <b>pretend Linux computer</b> with ROS 2 installed on it.');
      this.writeHtml('Nothing here can break. Nothing here is real. Try everything.');
      this.write('');
      this.writeHtml('Type <span class="x">help</span> to see what you can do, or follow the lesson on the left.');
      this.writeHtml('Press <span class="x">Tab</span> to complete, <span class="x">↑</span> for your last command, ' +
        '<span class="x">Ctrl+C</span> to stop something.');
      this.write('');
    },

    setPrompt() {
      const p = 'student@ros2' + ':' + VFS.pretty(VFS.cwd) + '$';
      this.promptEl.textContent = p;
    },

    focus() { if (!this.stream) this.input.focus({ preventScroll: true }); },

    /* ---- output ---------------------------------------- */
    write(text, cls) {
      if (text === undefined || text === null) text = '';
      const isHtml = cls && cls.indexOf('html') >= 0;
      String(text).split('\n').forEach((line) => {
        const div = document.createElement('div');
        div.className = 'tline ' + (cls ? cls.replace('html', '').trim() : '');
        if (isHtml) div.innerHTML = line || '&nbsp;';
        else if (/<span class="(d|x)">/.test(line)) div.innerHTML = line;  // from ls/help
        else div.textContent = line;
        this.out.appendChild(div);
      });
      this.trim();
      this.scroll();
    },

    writeHtml(text) { this.write(text, 'html'); },

    trim() {
      while (this.out.childNodes.length > 900) this.out.removeChild(this.out.firstChild);
    },

    scroll() {
      const box = this.out.parentNode;
      box.scrollTop = box.scrollHeight;
    },

    clear() { this.out.innerHTML = ''; },

    /* ---- running --------------------------------------- */
    submit(line) {
      const prompt = this.promptEl.textContent;
      const div = document.createElement('div');
      div.className = 'tline cmd';
      div.innerHTML = '<span class="p">' + U.escapeHtml(prompt) + '</span> ' + U.escapeHtml(line);
      this.out.appendChild(div);

      if (line.trim()) {
        this.hist.push(line);
        if (this.hist.length > 200) this.hist.shift();
        U.Store.set('ros2academy.history', this.hist);
        Shell.history.push(line);
      }
      this.histIdx = this.hist.length;

      const io = {
        write: (t, c) => this.write(t, c),
        explain: (kid, pro) => Bus.emit('explain', { kid: kid, pro: pro, cmd: line })
      };

      let res = null;
      try {
        res = Shell.exec(line, io);
      } catch (e) {
        this.write(String(e && e.message ? e.message : e), 'err');
        console.error(e);
      }

      if (res && res.stream) this.beginStream(res.stream);
      this.setPrompt();
      this.scroll();
      Bus.emit('command', { line: line, code: res ? res.code : 0 });
    },

    beginStream(stream) {
      this.stream = stream;
      this.wrap.classList.add('streaming');
      this.input.blur();
      this.input.disabled = true;
      U.$('#term-streamlabel', this.wrap).textContent = stream.label || 'running';
    },

    endStream(quiet) {
      if (!this.stream) return;
      const s = this.stream;
      this.stream = null;
      try { if (s.stop) s.stop(); } catch (e) { console.error(e); }
      if (!quiet) this.write('^C', 'dim');
      this.wrap.classList.remove('streaming');
      this.input.disabled = false;
      this.setPrompt();
      this.focus();
      this.scroll();
    },

    interrupt() {
      if (this.stream) { this.endStream(false); return; }
      if (this.input.value) {
        this.write(this.promptEl.textContent + ' ' + this.input.value + '^C', 'dim');
        this.input.value = '';
      }
    },

    /* ---- keyboard -------------------------------------- */
    onKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        /* mid-animation, Enter finishes the line rather than running a
           half-typed command */
        if (this.typing) { this.finishTyping(); return; }
        const line = this.input.value;
        this.input.value = '';
        this.submit(line);
        return;
      }
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (window.getSelection().toString()) return;  // let copy work
        e.preventDefault();
        this.interrupt();
        return;
      }
      if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); this.clear(); return; }
      if (e.key === 'u' && e.ctrlKey) { e.preventDefault(); this.input.value = ''; return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx === this.hist.length) this.draft = this.input.value;
        if (this.histIdx > 0) { this.histIdx--; this.input.value = this.hist[this.histIdx]; this.toEnd(); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.histIdx < this.hist.length - 1) { this.histIdx++; this.input.value = this.hist[this.histIdx]; }
        else { this.histIdx = this.hist.length; this.input.value = this.draft || ''; }
        this.toEnd();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        this.complete();
        return;
      }
    },

    toEnd() {
      const v = this.input.value;
      setTimeout(() => this.input.setSelectionRange(v.length, v.length), 0);
    },

    /* ---- tab completion -------------------------------- */
    complete() {
      const value = this.input.value;
      const parts = value.split(/\s+/);
      const isFirst = parts.length === 1;
      const word = parts[parts.length - 1];
      let options = [];

      if (isFirst) {
        options = Shell.names().filter((n) => n.indexOf(word) === 0);
      } else if (parts[0] === 'ros2') {
        options = this.completeRos2(parts, word);
      } else if (parts[0] === 'colcon') {
        options = ['build', 'list', 'test', '--packages-select', '--symlink-install'].filter((n) => n.indexOf(word) === 0);
      } else if (parts[0] === 'kill') {
        options = ROS.nodeList().map((n) => ROS.nodes[n].name).concat(['all']).filter((n) => n.indexOf(word) === 0);
      } else {
        options = this.completePath(word);
      }

      if (!options.length) return;
      if (options.length === 1) {
        parts[parts.length - 1] = options[0];
        this.input.value = parts.join(' ') + (options[0].slice(-1) === '/' ? '' : ' ');
        this.toEnd();
        return;
      }
      const common = commonPrefix(options);
      if (common.length > word.length) {
        parts[parts.length - 1] = common;
        this.input.value = parts.join(' ');
        this.toEnd();
      }
      this.write(this.promptEl.textContent + ' ' + value, 'dim');
      this.write(U.columns(options.map(U.escapeHtml)), 'html dim');
    },

    completeRos2(parts, word) {
      const verbs = ['action', 'bag', 'daemon', 'doctor', 'interface', 'launch', 'node', 'param', 'pkg', 'run', 'service', 'topic'];
      if (parts.length === 2) return verbs.filter((v) => v.indexOf(word) === 0);
      const verb = parts[1];
      const subs = {
        topic: ['list', 'echo', 'info', 'hz', 'pub', 'type', 'find'],
        node: ['list', 'info'],
        service: ['list', 'call', 'type', 'find'],
        param: ['list', 'get', 'set', 'describe', 'dump'],
        action: ['list', 'info', 'send_goal'],
        interface: ['list', 'show', 'package', 'proto'],
        pkg: ['create', 'list', 'executables', 'prefix'],
        bag: ['record', 'info', 'play'],
        daemon: ['status', 'stop']
      };
      if (parts.length === 3 && subs[verb]) return subs[verb].filter((v) => v.indexOf(word) === 0);

      if (verb === 'run' && parts.length === 3) return Object.keys(ROS.packages).filter((p) => p.indexOf(word) === 0);
      if (verb === 'run' && parts.length === 4) return ROS.execsForPackage(parts[2]).filter((p) => p.indexOf(word) === 0);
      if (verb === 'topic') return Object.keys(ROS.topics).filter((t) => t.indexOf(word) === 0)
        .concat(Object.keys(global.IFACE.defs).filter((t) => t.indexOf(word) === 0));
      if (verb === 'node' || verb === 'param') return ROS.nodeList().filter((t) => t.indexOf(word) === 0);
      if (verb === 'service') return Object.keys(ROS.services).filter((t) => t.indexOf(word) === 0)
        .concat(Object.keys(global.IFACE.srvs).filter((t) => t.indexOf(word) === 0));
      if (verb === 'action') return Object.keys(ROS.actions).filter((t) => t.indexOf(word) === 0)
        .concat(Object.keys(global.IFACE.acts).filter((t) => t.indexOf(word) === 0));
      if (verb === 'interface') return global.IFACE.list().filter((t) => t.indexOf(word) === 0);
      if (verb === 'launch' || verb === 'bag') return this.completePath(word).concat(Object.keys(ROS.packages).filter((p) => p.indexOf(word) === 0));
      return [];
    },

    completePath(word) {
      const slash = word.lastIndexOf('/');
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
      const base = slash >= 0 ? word.slice(slash + 1) : word;
      const listing = VFS.list(dirPart || '.') || [];
      return listing.filter((n) => n.indexOf(base) === 0).map((n) => {
        const full = VFS.resolve((dirPart || '.') + '/' + n);
        return dirPart + n + (VFS.isDir(full) ? '/' : '');
      });
    },

    /* ---- auto-typing (the "Show me" button) ------------- */
    /**
     * @param instant  put the whole line in at once. Tapping a command
     *   button is a request for that command, not a typing demo — and an
     *   animation you can interrupt with Enter runs a truncated command.
     */
    typeCommand(text, run, instant) {
      if (this.typing) { clearInterval(this.typing); this.typing = null; }
      if (this.stream) this.endStream(true);
      this.pending = { text: text, run: !!run };
      this.input.value = '';

      if (instant) {
        this.input.value = text;
        this.toEnd();
        this.focus();
        if (run) setTimeout(() => { this.input.value = ''; this.submit(text); }, 120);
        return;
      }

      this.focus();
      let i = 0;
      this.typing = setInterval(() => {
        this.input.value = text.slice(0, ++i);
        if (i >= text.length) {
          clearInterval(this.typing);
          this.typing = null;
          if (run) setTimeout(() => { const v = this.input.value; this.input.value = ''; this.submit(v); }, 260);
        }
      }, 32);
    },

    /** Jump to the end of an in-progress typewriter. */
    finishTyping() {
      if (!this.typing) return;
      clearInterval(this.typing);
      this.typing = null;
      if (this.pending) this.input.value = this.pending.text;
      this.toEnd();
    }
  };

  function commonPrefix(list) {
    if (!list.length) return '';
    let p = list[0];
    list.forEach((s) => { while (s.indexOf(p) !== 0 && p) p = p.slice(0, -1); });
    return p;
  }

  global.Term = Term;
})(window);
