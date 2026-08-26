/* ===========================================================
   backup.js — take your work with you.

   Everything lives in this browser, which means a different
   computer, a cleared cache or a school lab machine loses it.
   Export writes one .json file; import puts it all back.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, VFS = global.VFS, ROS = global.ROS, Shell = global.Shell, Bus = U.Bus;

  const FORMAT = 1;

  const Backup = {
    /** Everything worth keeping, as a plain object. */
    collect() {
      const App = global.App || {};
      return {
        format: FORMAT,
        app: (global.APP_INFO || {}).name || 'ROS 2 Academy',
        version: (global.APP_INFO || {}).version || '0.0.0',
        savedAt: new Date().toISOString(),
        progress: {
          done: App.done || {},
          challengeDone: App.challengeDone || {},
          xp: App.xp || 0,
          badges: App.badges || {},
          mode: App.mode || 'kid',
          lastLesson: App.current || null
        },
        files: { root: VFS.root, cwd: VFS.cwd },
        history: (Shell.history || []).slice(-200)
      };
    },

    /** Hand the browser a file to save. */
    download() {
      const data = this.collect();
      const json = JSON.stringify(data, null, 2);
      const name = 'ros2-academy-' + new Date().toISOString().slice(0, 10) + '.json';
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
      return { name: name, bytes: json.length, files: countFiles(data.files.root) };
    },

    /** Put a previously exported file back. Returns {ok, error, summary}. */
    restore(text) {
      let data;
      try { data = JSON.parse(text); }
      catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
      if (!data || typeof data !== 'object' || !data.files || !data.files.root) {
        return { ok: false, error: 'That does not look like a ROS 2 Academy backup.' };
      }
      if (data.format !== FORMAT) {
        return { ok: false, error: 'That backup is format ' + data.format + '; this version reads format ' + FORMAT + '.' };
      }
      if (!validTree(data.files.root)) {
        return { ok: false, error: 'The file tree inside that backup is damaged.' };
      }

      ROS.stopAll();
      ROS.reset();
      VFS.root = data.files.root;
      VFS.cwd = VFS.isDir(data.files.cwd) ? data.files.cwd : VFS.HOME;

      const App = global.App;
      const p = data.progress || {};
      if (App) {
        App.done = p.done || {};
        App.challengeDone = p.challengeDone || {};
        App.xp = p.xp || 0;
        App.badges = p.badges || {};
        App.setMode(p.mode || 'kid');
        App.buildSidebar();
        App.buildChallenges();
        App.renderProgress();
        App.save();
        if (p.lastLesson && App.byId(p.lastLesson)) App.openLesson(p.lastLesson, true);
      }
      Shell.history = (data.history || []).slice();
      Bus.emit('vfs:change', { action: 'restore', path: '/', kind: 'dir' });
      Bus.emit('vfs:cwd', { cwd: VFS.cwd });

      return {
        ok: true,
        summary: {
          files: countFiles(data.files.root),
          xp: p.xp || 0,
          lessons: Object.keys(p.done || {}).length,
          challenges: Object.keys(p.challengeDone || {}).length,
          savedAt: data.savedAt,
          version: data.version
        }
      };
    },

    /** Open a file picker and restore whatever they choose. */
    pickAndRestore(onDone) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => onDone(this.restore(String(reader.result)));
        reader.onerror = () => onDone({ ok: false, error: 'Could not read that file.' });
        reader.readAsText(file);
      });
      input.click();
    }
  };

  /** A restored tree is untrusted input: check its shape before using it. */
  function validTree(node, depth) {
    depth = depth || 0;
    if (depth > 40) return false;
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'file') return typeof node.content === 'string';
    if (node.type !== 'dir' || !node.children || typeof node.children !== 'object') return false;
    for (const k in node.children) {
      if (!validTree(node.children[k], depth + 1)) return false;
    }
    return true;
  }

  /** Count the student's own files. The pretend /opt is not their work. */
  function countFiles(root) {
    const home = dig(root, ['home', 'student']);
    return walk(home);
    function walk(node) {
      if (!node) return 0;
      if (node.type === 'file') return 1;
      let n = 0;
      for (const k in node.children) n += walk(node.children[k]);
      return n;
    }
  }

  function dig(node, parts) {
    let o = node;
    for (const part of parts) {
      if (!o || o.type !== 'dir' || !o.children) return null;
      o = o.children[part];
    }
    return o;
  }

  /* ---- terminal commands ------------------------------- */
  /* Named `backup`, not `export` — the shell already has an
     `export NAME=value` and shadowing it would be a nasty surprise. */
  Shell.def('backup', {
    help: 'Save all your work to a file you can keep.',
    usage: 'backup',
    run(args, io) {
      const r = Backup.download();
      io.write('Saved ' + r.files + ' file(s), your progress and your badges into  ' + r.name);
      io.write('Check your Downloads folder. Bring it back later with:  restore', 'hint');
      io.explain(
        'Everything you have built lives **inside this browser**. That file is a copy you can keep, ' +
        'email to yourself, or open on a different computer.',
        'A JSON snapshot of the virtual filesystem plus lesson/challenge progress.'
      );
      return { code: 0 };
    }
  });

  Shell.def('restore', {
    help: 'Load work you saved earlier with backup.',
    usage: 'restore',
    run(args, io) {
      io.write('Choose the .json file you saved earlier...');
      Backup.pickAndRestore((r) => {
        if (!r.ok) {
          Bus.emit('term:write', { text: 'restore failed: ' + r.error, cls: 'err' });
          return;
        }
        const s = r.summary;
        Bus.emit('term:write', {
          text: 'Restored ' + s.files + ' file(s), ' + s.lessons + ' lesson(s), ' +
            s.challenges + ' challenge(s) and ' + s.xp + ' XP\n' +
            '(saved ' + String(s.savedAt).slice(0, 16).replace('T', ' ') + ' from version ' + s.version + ')'
        });
        Bus.emit('term:write', {
          text: 'Your files and progress are back. Every node was stopped and this terminal was reset, ' +
            'so switch ROS 2 on again before using it:\n  source /opt/ros/jazzy/setup.bash', cls: 'hint'
        });
      });
      return { code: 0 };
    }
  });

  global.Backup = Backup;
})(window);
