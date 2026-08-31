/* ===========================================================
   panels.js — everything on the right-hand side.
   Files, Editor, Inspector, and the plain-English feed that
   explains what each command just did.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, VFS = global.VFS, ROS = global.ROS, Bus = U.Bus;
  const el = U.el;

  const Panels = {
    current: 'files',
    autoFollow: true,
    expanded: Object.create(null),

    init() {
      global.Dock.init();
      global.Layout.init();

      const af = U.$('#auto-follow');
      af.checked = U.Store.get('ros2academy.autofollow', true);
      this.autoFollow = af.checked;
      af.addEventListener('change', () => {
        this.autoFollow = af.checked;
        U.Store.set('ros2academy.autofollow', af.checked);
      });

      Bus.on('panel:show', (p) => this.show(p.panel, true));
      Bus.on('panel:suggest', (p) => { if (this.autoFollow) this.show(p.panel); });
      Bus.on('dock:applied', () => {
        if (global.Dock.isVisible('inspect')) Inspector.render();
        if (global.Dock.isVisible('files')) Files.render();
      });

      this.expanded[VFS.HOME] = true;
      this.expanded['/'] = true;

      Files.init();
      Editor.init();
      Inspector.init();
      Explain.init();

      global.Sim.init(U.$('#panel-robot'));
      global.Graph.init(U.$('#panel-graph'));

      global.Dock.apply();
    },

    /** Is this panel on screen right now, in either pane? */
    isVisible(name) { return global.Dock.isVisible(name); },

    /**
     * Show a panel. If it is already up in either pane, leave the
     * layout alone — stealing a pane the learner arranged on purpose
     * is the fastest way to make a split feel broken.
     */
    show(name, user) {
      if (!U.$('#panel-' + name)) return;
      const Dock = global.Dock;
      if (Dock.isVisible(name)) {
        if (name === 'inspect') Inspector.render();
        if (name === 'files') Files.render();
        return;
      }
      /* suggestions always land in pane A; pane B belongs to the learner */
      Dock.show('a', name, !!user);
      this.current = name;
    }
  };

  /* =========================================================
     Files
     ========================================================= */
  const Files = {
    root: null, flash: Object.create(null),

    init() {
      this.root = U.$('#file-tree');
      Bus.on('vfs:change', (c) => this.onChange(c));
      Bus.on('vfs:cwd', () => this.render());
      Bus.on('vfs:reset', () => { this.expandedReset(); this.render(); });
      this.render();
    },

    expandedReset() {
      Panels.expanded = Object.create(null);
      Panels.expanded[VFS.HOME] = true;
      Panels.expanded['/'] = true;
    },

    onChange(c) {
      /* build/, install/ and log/ are machine-generated: show them, but never
         unfold them automatically or the tree becomes a wall of noise */
      const generated = /\/(build|install|log)(\/|$)/.test(c.path || '');
      if (c.path && c.path !== '/' && !generated) {
        /* open every folder on the way to what just changed */
        let p = VFS.dirname(c.path);
        for (let i = 0; i < 12 && p !== '/'; i++) { Panels.expanded[p] = true; p = VFS.dirname(p); }
        if (c.action !== 'delete') this.flash[c.path] = Date.now();
      }
      this.render();
      if (c.action !== 'delete' && !generated && Panels.autoFollow && !Panels.isVisible('editor')) Panels.show('files');
    },

    render() {
      if (!this.root) return;
      const scroll = this.root.scrollTop;
      this.root.innerHTML = '';
      this.root.appendChild(this.renderNode('/home/student', 0));
      this.root.appendChild(el('div', { class: 'tree-sep' }, [
        el('span', { text: 'system folders' })
      ]));
      this.root.appendChild(this.renderNode('/opt', 0));
      this.root.scrollTop = scroll;
      U.$('#file-cwd').textContent = VFS.cwd;
    },

    renderNode(path, depth) {
      const node = VFS.get(path);
      const wrap = el('div', { class: 'tnode' });
      if (!node) return wrap;
      const name = VFS.basename(path) || '/';
      const isDir = node.type === 'dir';
      const open = !!Panels.expanded[path];
      const isCwd = VFS.cwd === path;
      const recent = this.flash[path] && Date.now() - this.flash[path] < 1600;

      const row = el('div', {
        class: 'trow' + (isDir ? ' dir' : ' file') + (isCwd ? ' cwd' : '') + (recent ? ' flash' : ''),
        style: 'padding-left:' + (6 + depth * 13) + 'px',
        title: path,
        onClick: () => {
          if (isDir) { Panels.expanded[path] = !open; this.render(); }
          else { Bus.emit('editor:open', { path: path }); Panels.show('editor', true); }
        }
      }, [
        el('span', { class: 'tw', text: isDir ? (open ? '▾' : '▸') : ' ' }),
        el('span', { class: 'ti', text: icon(name, isDir, open) }),
        el('span', { class: 'tn', text: name + (isDir ? '/' : '') }),
        isDir ? el('button', {
          class: 'tcd', title: 'cd into this folder',
          onClick: (e) => { e.stopPropagation(); Bus.emit('term:type', { text: 'cd ' + VFS.pretty(path), instant: true }); }
        }, ['cd']) : null
      ]);
      wrap.appendChild(row);

      if (isDir && open) {
        (VFS.list(path) || []).forEach((child) => {
          wrap.appendChild(this.renderNode((path === '/' ? '' : path) + '/' + child, depth + 1));
        });
      }
      return wrap;
    }
  };

  function icon(name, isDir, open) {
    if (isDir) {
      if (name === 'src') return '📦';
      if (name === 'build') return '🔧';
      if (name === 'install') return '✅';
      if (name === 'log') return '📄';
      if (name === 'launch') return '🚀';
      if (name === 'msg' || name === 'srv') return '✉️';
      return open ? '📂' : '📁';
    }
    if (/\.py$/.test(name)) return '🐍';
    if (/\.xml$/.test(name)) return '📋';
    if (/\.(yaml|yml|cfg)$/.test(name)) return '⚙️';
    if (/\.(txt|md)$/.test(name)) return '📝';
    if (/\.(bash|sh)$/.test(name)) return '📜';
    if (/\.(msg|srv|action)$/.test(name)) return '✉️';
    if (/\.db3$/.test(name)) return '🎬';
    return '📄';
  }

  /* =========================================================
     Editor
     ========================================================= */
  const Editor = {
    path: null, dirty: false,

    init() {
      this.area = U.$('#editor-area');
      this.hl = U.$('#editor-hl');
      this.insight = U.$('#editor-insight');
      this.insightList = U.$('#insight-list');
      this.title = U.$('#editor-title');
      this.status = U.$('#editor-status');
      this.saveBtn = U.$('#editor-save');
      this.lines = U.$('#editor-lines');

      this.area.addEventListener('input', () => { this.setDirty(true); this.renderLines(); this.repaint(); });
      this.area.addEventListener('scroll', () => {
        this.lines.scrollTop = this.area.scrollTop;
        this.hl.scrollTop = this.area.scrollTop;
        this.hl.scrollLeft = this.area.scrollLeft;
      });
      this.area.addEventListener('keydown', (e) => {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(); }
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = this.area.selectionStart, t = this.area.selectionEnd;
          this.area.value = this.area.value.slice(0, s) + '    ' + this.area.value.slice(t);
          this.area.selectionStart = this.area.selectionEnd = s + 4;
          this.setDirty(true);
          this.renderLines();
          this.repaint();
        }
      });
      this.saveBtn.addEventListener('click', () => this.save());

      Bus.on('editor:open', (p) => this.open(p.path));
      Bus.on('editor:insert', (p) => this.insert(p.text));
      Bus.on('vfs:reset', () => { this.path = null; this.open(null); });
      this.open(null);
    },

    open(path) {
      this.path = path;
      if (!path) {
        this.title.textContent = 'no file open';
        this.area.value = '';
        this.area.disabled = true;
        this.status.textContent = 'Open a file from the Files panel, or type:  nano my_file.py';
        this.setDirty(false);
        this.renderLines();
        this.repaint();
        return;
      }
      this.area.disabled = false;
      this.area.value = VFS.readFile(path) || '';
      this.title.textContent = VFS.pretty(path);
      this.setDirty(false);
      this.renderLines();
      this.repaint();
      this.status.textContent = 'Ctrl+S or the Save button writes it to disk.';
    },

    insert(text) {
      if (!this.path) return;
      this.area.value = text;
      this.setDirty(true);
      this.renderLines();
      this.repaint();
      this.area.focus();
    },

    /** Repaint the colour layer, and say what this code will do. */
    repaint() {
      const src = this.area.value;
      /* the trailing newline keeps the last line's height stable */
      this.hl.innerHTML = this.path ? global.Highlight.forPath(this.path, src) + '\n' : '';

      const isPy = this.path && /\.py$/.test(this.path);
      this.insight.classList.toggle('on', !!isPy && src.trim().length > 0);
      if (!isPy || !src.trim()) return;

      let items = [];
      try { items = global.Analyze.describe(global.Analyze.python(src)); }
      catch (e) { items = [{ icon: '⚠️', text: 'I could not read this file.', cls: 'warn' }]; }

      this.insightList.innerHTML = '';
      items.forEach((it) => {
        this.insightList.appendChild(el('li', { class: it.cls || '' }, [
          el('span', { class: 'iicon', text: it.icon }),
          el('span', { class: 'itext', html: md(it.text) })
        ]));
      });
    },

    setDirty(d) {
      this.dirty = d;
      this.saveBtn.classList.toggle('hot', d);
      this.saveBtn.textContent = d ? '● Save' : 'Saved';
      this.title.classList.toggle('dirty', d);
    },

    save() {
      if (!this.path) return;
      const r = VFS.writeFile(this.path, this.area.value);
      if (!r.ok) { this.status.textContent = 'Could not save: ' + r.error; return; }
      this.setDirty(false);
      this.status.textContent = 'Saved ' + VFS.pretty(this.path) + ' at ' + new Date().toLocaleTimeString();
      Bus.emit('editor:saved', { path: this.path });
      Bus.emit('explain', {
        kid: 'Saved **' + VFS.basename(this.path) + '**. Writing code does nothing on its own — ' +
          'you have to `colcon build` it before ROS 2 can run it.',
        pro: 'File written. Rebuild the package (colcon build) to reinstall the entry points.'
      });
    },

    renderLines() {
      const n = this.area.value.split('\n').length;
      let s = '';
      for (let i = 1; i <= n; i++) s += i + '\n';
      this.lines.textContent = s;
    }
  };

  /* =========================================================
     Inspector — live tables
     ========================================================= */
  const Inspector = {
    init() {
      this.root = U.$('#inspect-body');
      setInterval(() => { if (Panels.isVisible('inspect')) this.render(); }, 600);
      Bus.on('graph:dirty', () => { if (Panels.isVisible('inspect')) this.render(); });
      this.render();
    },

    render() {
      if (!this.root) return;
      const nodes = ROS.nodeList().filter((n) => n.indexOf('/_ros2cli') !== 0);
      const topics = Object.keys(ROS.topics).sort();
      const services = Object.keys(ROS.services).sort();
      const actions = Object.keys(ROS.actions).sort();

      const h = [];
      h.push(section('Nodes', nodes.length, nodes.length
        ? '<table><tr><th>node</th><th>package</th><th>publishes</th><th>listens to</th></tr>' +
        nodes.map((n) => {
          const nd = ROS.nodes[n];
          return '<tr><td class="k">' + esc(n) + '</td><td>' + esc(nd.pkg) + '</td><td>' +
            list(nd.pubs.filter((p) => !p.hidden).map((p) => p.topic)) + '</td><td>' +
            list(nd.subs.map((s) => s.topic)) + '</td></tr>';
        }).join('') + '</table>'
        : empty('Nothing running. Try <code>ros2 run demo_nodes_cpp talker</code>')));

      h.push(section('Topics', topics.length, topics.length
        ? '<table><tr><th>topic</th><th>type</th><th>pubs</th><th>subs</th><th>msgs</th></tr>' +
        topics.map((t) => {
          const tp = ROS.topics[t];
          const hz = ROS.hz(t);
          return '<tr' + (tp.hidden ? ' class="dimrow"' : '') + '><td class="k">' + esc(t) + '</td><td>' + esc(tp.type) +
            '</td><td class="num">' + tp.pubs.length + '</td><td class="num">' + tp.subs.length +
            '</td><td class="num">' + tp.count + (hz ? ' <span class="hz">' + U.f(hz.rate, 1) + 'Hz</span>' : '') + '</td></tr>';
        }).join('') + '</table>'
        : empty('No topics yet.')));

      if (services.length) {
        h.push(section('Services', services.length,
          '<table><tr><th>service</th><th>type</th><th>served by</th></tr>' +
          services.map((s) => '<tr><td class="k">' + esc(s) + '</td><td>' + esc(ROS.services[s].type) +
            '</td><td>' + esc(ROS.services[s].node) + '</td></tr>').join('') + '</table>'));
      }
      if (actions.length) {
        h.push(section('Actions', actions.length,
          '<table><tr><th>action</th><th>type</th></tr>' +
          actions.map((s) => '<tr><td class="k">' + esc(s) + '</td><td>' + esc(ROS.actions[s].type) + '</td></tr>').join('') + '</table>'));
      }

      const withParams = nodes.filter((n) => Object.keys(ROS.nodes[n].params).length);
      if (withParams.length) {
        h.push(section('Parameters', withParams.length,
          '<table><tr><th>node</th><th>parameter</th><th>value</th></tr>' +
          withParams.map((n) => Object.keys(ROS.nodes[n].params).sort().map((k) =>
            '<tr><td class="k">' + esc(n) + '</td><td>' + esc(k) + '</td><td class="num">' +
            esc(String(ROS.nodes[n].params[k])) + '</td></tr>').join('')).join('') + '</table>'));
      }

      this.root.innerHTML = h.join('');
    }
  };

  function section(title, count, body) {
    return '<div class="isec"><h4>' + title + ' <span class="badge">' + count + '</span></h4>' + body + '</div>';
  }
  function empty(msg) { return '<p class="iempty">' + msg + '</p>'; }
  function list(arr) { return arr.length ? arr.map((a) => '<code>' + esc(a) + '</code>').join(' ') : '<span class="dash">—</span>'; }
  function esc(s) { return U.escapeHtml(s); }

  /* =========================================================
     "What's happening" feed
     ========================================================= */
  const Explain = {
    init() {
      this.feed = U.$('#explain-feed');
      Bus.on('explain', (e) => this.add(e));
      Bus.on('vfs:reset', () => { this.feed.innerHTML = ''; });
      this.add({
        kid: "I explain **what just happened** every time you run a command. Watch this space!",
        pro: 'Every command emits a short explanation here, in both registers.'
      });
    },

    add(e) {
      const card = el('div', { class: 'ecard' }, [
        el('div', { class: 'ekid', html: md(e.kid || '') }),
        e.pro ? el('div', { class: 'epro', html: md(e.pro) }) : null
      ]);
      this.feed.insertBefore(card, this.feed.firstChild);
      while (this.feed.childNodes.length > 24) this.feed.removeChild(this.feed.lastChild);
      requestAnimationFrame(() => card.classList.add('in'));
    }
  };

  /** the world's smallest markdown: **bold** and `code` */
  function md(s) {
    return U.escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  Panels.Files = Files;
  Panels.Editor = Editor;
  Panels.Inspector = Inspector;
  Panels.Explain = Explain;
  Panels.md = md;
  global.Panels = Panels;
})(window);
