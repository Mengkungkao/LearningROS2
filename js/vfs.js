/* ===========================================================
   vfs.js — a pretend Linux filesystem that lives in memory.
   Every mkdir / touch / rm the student types changes this tree,
   and the File panel redraws itself from it.
   =========================================================== */
(function (global) {
  'use strict';
  const Bus = global.U.Bus;

  const HOME = '/home/student';

  function dir(name) { return { type: 'dir', name: name, children: Object.create(null) }; }
  function file(name, content) { return { type: 'file', name: name, content: content || '' }; }

  const VFS = {
    root: dir(''),
    cwd: HOME,
    HOME: HOME,

    /* ---- path helpers ---------------------------------- */

    /** Turn any user-typed path into a clean absolute path. */
    resolve(p) {
      if (p === undefined || p === null || p === '') p = '.';
      p = String(p).trim();
      if (p === '~') p = HOME;
      else if (p.slice(0, 2) === '~/') p = HOME + '/' + p.slice(2);
      const abs = p[0] === '/' ? p : this.cwd + '/' + p;
      const parts = abs.split('/');
      const out = [];
      for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') { out.pop(); continue; }
        out.push(part);
      }
      return '/' + out.join('/');
    },

    basename(p) {
      const r = this.resolve(p);
      return r === '/' ? '/' : r.slice(r.lastIndexOf('/') + 1);
    },

    dirname(p) {
      const r = this.resolve(p);
      const i = r.lastIndexOf('/');
      return i <= 0 ? '/' : r.slice(0, i);
    },

    /** Shorten for the prompt: /home/student/ros2_ws -> ~/ros2_ws */
    pretty(p) {
      const r = this.resolve(p === undefined ? this.cwd : p);
      if (r === HOME) return '~';
      if (r.indexOf(HOME + '/') === 0) return '~' + r.slice(HOME.length);
      return r;
    },

    /* ---- reading --------------------------------------- */

    get(p) {
      const r = this.resolve(p);
      if (r === '/') return this.root;
      let node = this.root;
      for (const part of r.split('/').slice(1)) {
        if (!node || node.type !== 'dir') return null;
        node = node.children[part];
      }
      return node || null;
    },

    exists(p) { return !!this.get(p); },
    isDir(p) { const n = this.get(p); return !!n && n.type === 'dir'; },
    isFile(p) { const n = this.get(p); return !!n && n.type === 'file'; },

    /** Sorted child names (dirs first), or null if not a directory. */
    list(p) {
      const n = this.get(p);
      if (!n || n.type !== 'dir') return null;
      return Object.keys(n.children).sort((a, b) => {
        const A = n.children[a], B = n.children[b];
        if (A.type !== B.type) return A.type === 'dir' ? -1 : 1;
        return a.localeCompare(b);
      });
    },

    readFile(p) {
      const n = this.get(p);
      return n && n.type === 'file' ? n.content : null;
    },

    /* ---- writing --------------------------------------- */

    /** mkdir. parents=true behaves like `mkdir -p`. */
    mkdir(p, parents) {
      const r = this.resolve(p);
      if (r === '/') return { ok: false, error: 'cannot create directory: /' };
      const parts = r.split('/').slice(1);
      let node = this.root, walked = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        walked += '/' + part;
        const last = i === parts.length - 1;
        let child = node.children[part];
        if (child) {
          if (child.type !== 'dir') return { ok: false, error: "cannot create directory '" + p + "': File exists" };
          if (last && !parents) return { ok: false, error: "cannot create directory '" + p + "': File exists" };
        } else {
          if (!last && !parents) return { ok: false, error: "cannot create directory '" + p + "': No such file or directory" };
          child = dir(part);
          node.children[part] = child;
          this._changed('create', walked, 'dir');
        }
        node = child;
      }
      return { ok: true, path: r };
    },

    /** Create/overwrite/append a file. Parent directory must exist. */
    writeFile(p, content, opts) {
      opts = opts || {};
      const r = this.resolve(p);
      const parent = this.get(this.dirname(r));
      if (!parent || parent.type !== 'dir') {
        return { ok: false, error: this.dirname(r) + ': No such file or directory' };
      }
      const name = this.basename(r);
      let node = parent.children[name];
      if (node && node.type === 'dir') return { ok: false, error: p + ': Is a directory' };
      const isNew = !node;
      if (!node) { node = file(name, ''); parent.children[name] = node; }
      node.content = opts.append ? node.content + content : content;
      this._changed(isNew ? 'create' : 'modify', r, 'file');
      return { ok: true, path: r, created: isNew };
    },

    /** touch: create if missing, otherwise do nothing visible. */
    touch(p) {
      const r = this.resolve(p);
      if (this.exists(r)) { this._changed('touch', r, this.isDir(r) ? 'dir' : 'file'); return { ok: true, path: r }; }
      return this.writeFile(r, '');
    },

    rm(p, opts) {
      opts = opts || {};
      const r = this.resolve(p);
      if (r === '/' || r === HOME) return { ok: false, error: 'refusing to remove ' + r };
      const node = this.get(r);
      if (!node) {
        if (opts.force) return { ok: true, path: r, missing: true };
        return { ok: false, error: "cannot remove '" + p + "': No such file or directory" };
      }
      if (node.type === 'dir' && !opts.recursive) {
        return { ok: false, error: "cannot remove '" + p + "': Is a directory" };
      }
      const parent = this.get(this.dirname(r));
      delete parent.children[this.basename(r)];
      this._changed('delete', r, node.type);
      return { ok: true, path: r, node: node };
    },

    _clone(node) {
      if (node.type === 'file') return file(node.name, node.content);
      const d = dir(node.name);
      for (const k in node.children) d.children[k] = this._clone(node.children[k]);
      return d;
    },

    /** Shared by cp and mv: work out the real destination path. */
    _destPath(src, dest) {
      const s = this.resolve(src), d = this.resolve(dest);
      return this.isDir(d) ? d + '/' + this.basename(s) : d;
    },

    cp(src, dest, opts) {
      opts = opts || {};
      const s = this.resolve(src);
      const node = this.get(s);
      if (!node) return { ok: false, error: "cannot stat '" + src + "': No such file or directory" };
      if (node.type === 'dir' && !opts.recursive) {
        return { ok: false, error: "-r not specified; omitting directory '" + src + "'" };
      }
      const d = this._destPath(s, dest);
      const parent = this.get(this.dirname(d));
      if (!parent || parent.type !== 'dir') return { ok: false, error: this.dirname(d) + ': No such file or directory' };
      const copy = this._clone(node);
      copy.name = this.basename(d);
      parent.children[copy.name] = copy;
      this._changed('create', d, copy.type);
      return { ok: true, path: d };
    },

    mv(src, dest) {
      const s = this.resolve(src);
      const node = this.get(s);
      if (!node) return { ok: false, error: "cannot stat '" + src + "': No such file or directory" };
      const d = this._destPath(s, dest);
      if (d === s) return { ok: true, path: d };
      const parent = this.get(this.dirname(d));
      if (!parent || parent.type !== 'dir') return { ok: false, error: this.dirname(d) + ': No such file or directory' };
      delete this.get(this.dirname(s)).children[this.basename(s)];
      node.name = this.basename(d);
      parent.children[node.name] = node;
      this._changed('move', d, node.type, s);
      return { ok: true, path: d, from: s };
    },

    cd(p) {
      const r = this.resolve(p === undefined || p === '' ? HOME : p);
      const node = this.get(r);
      if (!node) return { ok: false, error: p + ': No such file or directory' };
      if (node.type !== 'dir') return { ok: false, error: p + ': Not a directory' };
      const old = this.cwd;
      this.cwd = r;
      if (old !== r) Bus.emit('vfs:cwd', { cwd: r, from: old });
      return { ok: true, path: r };
    },

    /** Text drawing of the tree, like the `tree` command. */
    tree(p, opts) {
      opts = opts || {};
      const start = this.resolve(p);
      const node = this.get(start);
      if (!node) return { ok: false, error: start + ' [error opening dir]' };
      const lines = [this.pretty(start)];
      let dirs = 0, files = 0;
      const walk = (n, prefix, depth) => {
        if (n.type !== 'dir') return;
        if (opts.maxDepth && depth > opts.maxDepth) return;
        const names = this.list(this._pathOf(n) || start) || Object.keys(n.children).sort();
        const kids = Object.keys(n.children).sort((a, b) => {
          const A = n.children[a], B = n.children[b];
          if (A.type !== B.type) return A.type === 'dir' ? -1 : 1;
          return a.localeCompare(b);
        });
        kids.forEach((name, i) => {
          const child = n.children[name];
          const last = i === kids.length - 1;
          lines.push(prefix + (last ? '└── ' : '├── ') + name);
          if (child.type === 'dir') { dirs++; walk(child, prefix + (last ? '    ' : '│   '), depth + 1); }
          else files++;
        });
        void names;
      };
      walk(node, '', 1);
      lines.push('');
      lines.push(dirs + ' director' + (dirs === 1 ? 'y' : 'ies') + ', ' + files + ' file' + (files === 1 ? '' : 's'));
      return { ok: true, text: lines.join('\n') };
    },

    _pathOf() { return null; }, // (nodes don't carry their path; list() falls back)

    /** Every path in the tree — used by tab-completion and lesson checks. */
    allPaths(from) {
      const start = this.resolve(from || '/');
      const out = [];
      const walk = (node, path) => {
        out.push({ path: path || '/', type: node.type });
        if (node.type === 'dir') {
          Object.keys(node.children).sort().forEach((k) => walk(node.children[k], path + '/' + k));
        }
      };
      const n = this.get(start);
      if (n) walk(n, start === '/' ? '' : start);
      return out;
    },

    _changed(action, path, kind, from) {
      Bus.emit('vfs:change', { action: action, path: path, kind: kind, from: from });
    },

    /** Wipe everything and rebuild the starting world. */
    reset() {
      this.root = dir('');
      this.cwd = HOME;
      seed(this);
      Bus.emit('vfs:reset', {});
      Bus.emit('vfs:change', { action: 'reset', path: '/', kind: 'dir' });
    }
  };

  /* ---- the world the student starts in ------------------ */
  function seed(fs) {
    const mk = (p) => fs.mkdir(p, true);
    const wr = (p, c) => fs.writeFile(p, c);

    mk('/home/student');
    mk('/opt/ros/jazzy/share');
    mk('/opt/ros/jazzy/bin');
    mk('/home/student/Desktop');

    wr('/opt/ros/jazzy/setup.bash',
      '# ROS 2 Jazzy environment setup\n' +
      '# Running "source" on this file tells your terminal where ROS 2 lives.\n' +
      'export ROS_DISTRO=jazzy\n' +
      'export ROS_VERSION=2\n' +
      'export AMENT_PREFIX_PATH=/opt/ros/jazzy\n');

    wr('/home/student/welcome.txt',
      'Welcome to ROS 2 Academy!\n' +
      '\n' +
      'This is a pretend Linux computer that lives inside your web browser.\n' +
      'Nothing you type here can break anything. Try things! Break things!\n' +
      '\n' +
      'Type   ls      to see what is here.\n' +
      'Type   help    to see every command you can use.\n' +
      'Type   hint    if you get stuck on a lesson.\n');

    wr('/home/student/Desktop/robot_ideas.txt',
      'Robot ideas:\n' +
      '1. A robot that waters my plants\n' +
      '2. A robot that finds my socks\n' +
      '3. A turtle that draws pictures  <-- we build this one in Lesson 8!\n');

    // A few package share folders so `ros2 interface show` has something real to read.
    mk('/opt/ros/jazzy/share/std_msgs/msg');
    wr('/opt/ros/jazzy/share/std_msgs/msg/String.msg', 'string data\n');
    wr('/opt/ros/jazzy/share/std_msgs/msg/Int32.msg', 'int32 data\n');
    mk('/opt/ros/jazzy/share/geometry_msgs/msg');
    wr('/opt/ros/jazzy/share/geometry_msgs/msg/Twist.msg',
      '# This expresses velocity in free space broken into its linear and angular parts.\n' +
      'Vector3  linear\n' +
      'Vector3  angular\n');
    mk('/opt/ros/jazzy/share/turtlesim/msg');
    wr('/opt/ros/jazzy/share/turtlesim/msg/Pose.msg',
      'float32 x\nfloat32 y\nfloat32 theta\nfloat32 linear_velocity\nfloat32 angular_velocity\n');
  }

  VFS.seed = seed;
  seed(VFS);

  global.VFS = VFS;
})(window);
