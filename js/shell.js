/* ===========================================================
   shell.js — the pretend bash: tokenising, redirects, and the
   handful of Linux commands every ROS 2 tutorial assumes you
   already know.
   =========================================================== */
(function (global) {
  'use strict';
  const VFS = global.VFS;
  const U = global.U;

  const Shell = {
    cmds: Object.create(null),
    env: { USER: 'student', HOME: '/home/student', SHELL: '/bin/bash', ROS_DOMAIN_ID: '0' },
    history: [],

    /** Register a command: Shell.def('ls', {help, usage, run(args, io)}) */
    def(name, def) { this.cmds[name] = def; },

    names() { return Object.keys(this.cmds).sort(); },

    /* ---- tokenising ------------------------------------ */
    tokenize(line) {
      const out = [];
      let cur = '', quote = null, had = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === quote) { quote = null; had = true; }
          else if (c === '\\' && quote === '"' && i + 1 < line.length) { cur += line[++i]; }
          else cur += c;
        } else if (c === '"' || c === "'") {
          quote = c; had = true;
        } else if (/\s/.test(c)) {
          if (cur || had) { out.push(cur); cur = ''; had = false; }
        } else cur += c;
      }
      if (cur || had) out.push(cur);
      return out;
    },

    /** Run one line (may contain && chains). io = {write, explain, stream} */
    exec(line, io) {
      const parts = splitChain(line);
      let last = { code: 0 };
      for (let i = 0; i < parts.length; i++) {
        last = this.execOne(parts[i], io);
        if (last && last.stream) return last;          // streaming stops the chain
        if (last && last.code) return last;            // && semantics: stop on failure
      }
      return last;
    },

    execOne(line, io) {
      line = line.trim();
      if (!line) return { code: 0 };

      /* redirects */
      let redirect = null;
      const rx = line.match(/\s(>>?)\s*("[^"]+"|'[^']+'|\S+)\s*$/);
      if (rx) {
        redirect = { append: rx[1] === '>>', file: rx[2].replace(/^["']|["']$/g, '') };
        line = line.slice(0, rx.index);
      }

      const argv = this.tokenize(line);
      if (!argv.length) return { code: 0 };
      const name = argv[0];
      const cmd = this.cmds[name];

      const buffer = [];
      const localIo = {
        write(text, cls) {
          if (redirect) buffer.push(text);
          else io.write(text, cls);
        },
        explain: io.explain,
        stream: io.stream,
        raw: io
      };

      if (!cmd) {
        io.write(name + ': command not found', 'err');
        const guess = suggest(name, this.names());
        if (guess) io.write('Did you mean:  ' + guess + '  ?', 'hint');
        else io.write("Type  help  to see every command this computer understands.", 'hint');
        return { code: 127 };
      }

      let res;
      try {
        res = cmd.run(argv.slice(1), localIo, argv) || {};
      } catch (e) {
        io.write(name + ': ' + (e && e.message ? e.message : String(e)), 'err');
        return { code: 1 };
      }

      if (redirect) {
        const text = buffer.join('\n');
        const w = VFS.writeFile(redirect.file, text + (text ? '\n' : ''), { append: redirect.append });
        if (!w.ok) { io.write('bash: ' + w.error, 'err'); return { code: 1 }; }
        io.explain(
          'You sent the words into the file **' + VFS.basename(redirect.file) + '** instead of onto the screen. The `>` arrow is like a hose pointing into a bucket.',
          '`>` truncates and writes stdout to the file; `>>` appends.'
        );
      }
      return res;
    }
  };

  function splitChain(line) {
    const out = [];
    let cur = '', quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { cur += c; if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '&' && line[i + 1] === '&') { out.push(cur); cur = ''; i++; continue; }
      if (c === ';') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out.filter((s) => s.trim());
  }

  /** Cheap "did you mean" using edit distance. */
  function suggest(word, list) {
    let best = null, bestD = 3;
    list.forEach((c) => {
      const d = lev(word, c);
      if (d < bestD) { bestD = d; best = c; }
    });
    return best;
  }
  function lev(a, b) {
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
    return m[b.length][a.length];
  }
  Shell.suggest = suggest;

  /* =========================================================
     The commands
     ========================================================= */
  const def = (n, d) => Shell.def(n, d);
  const flags = (args) => args.filter((a) => a[0] === '-' && a !== '-');
  const rest = (args) => args.filter((a) => a[0] !== '-' || a === '-');
  const hasFlag = (args, ch) => flags(args).some((f) => f.indexOf('-') === 0 && f.indexOf('--') !== 0 && f.indexOf(ch) > 0)
    || flags(args).indexOf('--' + ch) >= 0;

  /* ---- ls ---- */
  def('ls', {
    help: 'List what is inside a folder.',
    usage: 'ls [-l] [-a] [folder]',
    run(args, io) {
      const paths = rest(args);
      const long = hasFlag(args, 'l');
      const all = hasFlag(args, 'a');
      const target = paths[0] || '.';
      const node = VFS.get(target);
      if (!node) { io.write("ls: cannot access '" + target + "': No such file or directory", 'err'); return { code: 2 }; }

      if (node.type === 'file') { io.write(VFS.basename(target)); return { code: 0 }; }
      let names = VFS.list(target);
      if (all) names = ['.', '..'].concat(names);

      if (!names.length) {
        io.explain('That folder is **empty** — like an empty drawer.', 'Empty directory.');
        return { code: 0 };
      }
      if (long) {
        const lines = names.map((n) => {
          if (n === '.' || n === '..') return 'drwxr-xr-x  student  student   -  ' + n;
          const child = VFS.get(VFS.resolve(target) + '/' + n);
          const isDir = child.type === 'dir';
          const size = isDir ? Object.keys(child.children).length + ' items' : child.content.length + ' B';
          return (isDir ? 'drwxr-xr-x' : '-rw-r--r--') + '  student  student  ' + U.pad(size, 8) + '  ' +
            (isDir ? '<span class="d">' + U.escapeHtml(n) + '/</span>' : U.escapeHtml(n));
        });
        io.write(lines.join('\n'), 'html');
      } else {
        const shown = names.map((n) => {
          const e = U.escapeHtml(n);
          if (n === '.' || n === '..') return '<span class="d">' + e + '</span>';
          const child = VFS.get(VFS.resolve(target) + '/' + n);
          if (child && child.type === 'dir') return '<span class="d">' + e + '/</span>';
          if (/\.(py|sh|bash)$/.test(n)) return '<span class="x">' + e + '</span>';
          return e;
        });
        io.write(U.columns(shown), 'html');
      }
      io.explain(
        'You just **looked inside** ' + (target === '.' ? 'this folder' : '`' + target + '`') + '. Blue names with a `/` are folders — you can go inside those.',
        '`ls` lists directory entries. `-l` = long format, `-a` = include dotfiles.'
      );
      return { code: 0 };
    }
  });

  /* ---- pwd ---- */
  def('pwd', {
    help: 'Show which folder you are standing in.',
    usage: 'pwd',
    run(args, io) {
      io.write(VFS.cwd);
      io.explain(
        'This is your **address** right now — like saying "I am in the kitchen, in my house, on my street".',
        'pwd = print working directory.'
      );
      return { code: 0 };
    }
  });

  /* ---- cd ---- */
  def('cd', {
    help: 'Walk into a different folder.',
    usage: 'cd <folder>   (cd .. goes back up, cd ~ goes home)',
    run(args, io) {
      const target = rest(args)[0];
      const r = VFS.cd(target);
      if (!r.ok) { io.write('cd: ' + r.error, 'err'); return { code: 1 }; }
      io.explain(
        'You **walked into** `' + VFS.pretty(r.path) + '`. Look at the prompt — it changed to show where you are.',
        'Working directory is now ' + r.path + '.'
      );
      return { code: 0 };
    }
  });

  /* ---- mkdir ---- */
  def('mkdir', {
    help: 'Make a new folder.',
    usage: 'mkdir [-p] <name>',
    run(args, io) {
      const parents = hasFlag(args, 'p');
      const targets = rest(args);
      if (!targets.length) { io.write('mkdir: missing operand', 'err'); return { code: 1 }; }
      let code = 0;
      targets.forEach((t) => {
        const r = VFS.mkdir(t, parents);
        if (!r.ok) { io.write('mkdir: ' + r.error, 'err'); code = 1; }
      });
      if (!code) {
        io.explain(
          'A brand new **folder** appeared. Watch the Files panel on the right — see it pop in? ' +
          (parents ? 'The `-p` part means "make every folder in the path, even the ones in the middle".' : ''),
          'mkdir' + (parents ? ' -p creates missing parents.' : ' created the directory.')
        );
      }
      return { code: code };
    }
  });

  def('rmdir', {
    help: 'Remove an empty folder.',
    usage: 'rmdir <folder>',
    run(args, io) {
      const t = rest(args)[0];
      if (!t) { io.write('rmdir: missing operand', 'err'); return { code: 1 }; }
      const node = VFS.get(t);
      if (!node) { io.write("rmdir: failed to remove '" + t + "': No such file or directory", 'err'); return { code: 1 }; }
      if (node.type !== 'dir') { io.write("rmdir: failed to remove '" + t + "': Not a directory", 'err'); return { code: 1 }; }
      if (Object.keys(node.children).length) {
        io.write("rmdir: failed to remove '" + t + "': Directory not empty", 'err');
        io.write('Tip: use  rm -r ' + t + '  to remove a folder and everything inside it.', 'hint');
        return { code: 1 };
      }
      VFS.rm(t, { recursive: true });
      return { code: 0 };
    }
  });

  /* ---- touch ---- */
  def('touch', {
    help: 'Make a new empty file.',
    usage: 'touch <filename>',
    run(args, io) {
      const targets = rest(args);
      if (!targets.length) { io.write('touch: missing file operand', 'err'); return { code: 1 }; }
      targets.forEach((t) => {
        const r = VFS.touch(t);
        if (!r.ok) io.write('touch: ' + r.error, 'err');
      });
      io.explain(
        'You made an **empty file**. It exists, but there is nothing written in it yet — like a blank sheet of paper.',
        'touch creates the file (or updates its timestamp if it already exists).'
      );
      return { code: 0 };
    }
  });

  /* ---- cat ---- */
  def('cat', {
    help: 'Show what is written inside a file.',
    usage: 'cat <filename>',
    run(args, io) {
      const targets = rest(args);
      if (!targets.length) { io.write('cat: missing file operand', 'err'); return { code: 1 }; }
      let code = 0;
      targets.forEach((t) => {
        const node = VFS.get(t);
        if (!node) { io.write("cat: " + t + ": No such file or directory", 'err'); code = 1; return; }
        if (node.type === 'dir') { io.write('cat: ' + t + ': Is a directory', 'err'); code = 1; return; }
        io.write(node.content.replace(/\n$/, ''));
      });
      if (!code) {
        io.explain(
          'You **read a file out loud**. `cat` dumps the whole thing onto your screen.',
          'cat concatenates files to stdout.'
        );
      }
      return { code: code };
    }
  });

  def('head', {
    help: 'Show the first few lines of a file.',
    usage: 'head [-n N] <file>',
    run(args, io) {
      let n = 10;
      const i = args.indexOf('-n');
      if (i >= 0) n = parseInt(args[i + 1], 10) || 10;
      const t = rest(args).filter((x) => String(parseInt(x, 10)) !== x)[0];
      const c = VFS.readFile(t);
      if (c === null) { io.write('head: cannot open ' + t, 'err'); return { code: 1 }; }
      io.write(c.split('\n').slice(0, n).join('\n'));
      return { code: 0 };
    }
  });

  def('tail', {
    help: 'Show the last few lines of a file.',
    usage: 'tail [-n N] <file>',
    run(args, io) {
      let n = 10;
      const i = args.indexOf('-n');
      if (i >= 0) n = parseInt(args[i + 1], 10) || 10;
      const t = rest(args).filter((x) => String(parseInt(x, 10)) !== x)[0];
      const c = VFS.readFile(t);
      if (c === null) { io.write('tail: cannot open ' + t, 'err'); return { code: 1 }; }
      const lines = c.replace(/\n$/, '').split('\n');
      io.write(lines.slice(Math.max(0, lines.length - n)).join('\n'));
      return { code: 0 };
    }
  });

  def('wc', {
    help: 'Count lines, words and letters in a file.',
    usage: 'wc [-l] <file>',
    run(args, io) {
      const t = rest(args)[0];
      const c = VFS.readFile(t);
      if (c === null) { io.write('wc: ' + t + ': No such file or directory', 'err'); return { code: 1 }; }
      const lines = c ? c.replace(/\n$/, '').split('\n').length : 0;
      const words = c.split(/\s+/).filter(Boolean).length;
      io.write(hasFlag(args, 'l') ? lines + ' ' + t : lines + ' ' + words + ' ' + c.length + ' ' + t);
      return { code: 0 };
    }
  });

  def('grep', {
    help: 'Find lines that contain a word.',
    usage: 'grep <word> <file>',
    run(args, io) {
      const a = rest(args);
      if (a.length < 2) { io.write('usage: grep <word> <file>', 'err'); return { code: 1 }; }
      const needle = a[0];
      const c = VFS.readFile(a[1]);
      if (c === null) { io.write('grep: ' + a[1] + ': No such file or directory', 'err'); return { code: 1 }; }
      const hits = c.split('\n').filter((l) => l.indexOf(needle) >= 0);
      if (hits.length) io.write(hits.join('\n'));
      io.explain('You **searched inside a file** for the word "' + needle + '" and found ' + hits.length + ' line(s).',
        'grep prints matching lines.');
      return { code: hits.length ? 0 : 1 };
    }
  });

  /* ---- echo ---- */
  def('echo', {
    help: 'Print words on the screen (or into a file with >).',
    usage: 'echo "hello"   |   echo "hello" > note.txt',
    run(args, io) {
      const text = args.map((a) => (Shell.env[a.replace('$', '')] !== undefined && a[0] === '$')
        ? Shell.env[a.slice(1)] : a).join(' ');
      io.write(text);
      return { code: 0 };
    }
  });

  /* ---- rm ---- */
  def('rm', {
    help: 'Delete a file (or a folder with -r).',
    usage: 'rm <file>   |   rm -r <folder>',
    run(args, io) {
      const recursive = hasFlag(args, 'r') || hasFlag(args, 'R');
      const force = hasFlag(args, 'f');
      const targets = rest(args);
      if (!targets.length) { io.write('rm: missing operand', 'err'); return { code: 1 }; }
      let code = 0, removed = [];
      targets.forEach((t) => {
        const r = VFS.rm(t, { recursive: recursive, force: force });
        if (!r.ok) {
          io.write('rm: ' + r.error, 'err');
          if (/Is a directory/.test(r.error)) io.write('Tip: folders need  rm -r ' + t, 'hint');
          code = 1;
        } else if (!r.missing) removed.push(t);
      });
      if (removed.length) {
        io.explain(
          '**Poof!** `' + removed.join(', ') + '` is gone. Watch the Files panel — it disappeared. ' +
          'On a real computer there is no undo for this, so read twice before you press Enter.',
          'rm unlinks the path' + (recursive ? ' and its subtree (-r)' : '') + '. No trash can involved.'
        );
      }
      return { code: code };
    }
  });

  /* ---- cp / mv ---- */
  def('cp', {
    help: 'Copy a file (keeps the original).',
    usage: 'cp [-r] <from> <to>',
    run(args, io) {
      const a = rest(args);
      if (a.length < 2) { io.write('cp: missing destination file operand', 'err'); return { code: 1 }; }
      const r = VFS.cp(a[0], a[1], { recursive: hasFlag(args, 'r') });
      if (!r.ok) { io.write('cp: ' + r.error, 'err'); return { code: 1 }; }
      io.explain('You made a **copy**. Now there are two: the original and the new one.', 'cp copies the file.');
      return { code: 0 };
    }
  });

  def('mv', {
    help: 'Move a file, or rename it.',
    usage: 'mv <from> <to>',
    run(args, io) {
      const a = rest(args);
      if (a.length < 2) { io.write('mv: missing destination file operand', 'err'); return { code: 1 }; }
      const r = VFS.mv(a[0], a[1]);
      if (!r.ok) { io.write('mv: ' + r.error, 'err'); return { code: 1 }; }
      io.explain('You **moved** it (or gave it a new name). There is still only one — it just lives somewhere else now.',
        'mv renames/moves the path.');
      return { code: 0 };
    }
  });

  /* ---- tree ---- */
  def('tree', {
    help: 'Draw the whole folder shape as a picture.',
    usage: 'tree [folder]',
    run(args, io) {
      const r = VFS.tree(rest(args)[0] || '.');
      if (!r.ok) { io.write('tree: ' + r.error, 'err'); return { code: 1 }; }
      io.write(r.text);
      io.explain('This is a **map** of every folder and file inside here. The little lines show what lives inside what.',
        'tree walks the directory recursively.');
      return { code: 0 };
    }
  });

  /* ---- source / env ---- */
  def('source', {
    help: 'Load a setup file so your terminal knows about ROS 2.',
    usage: 'source /opt/ros/jazzy/setup.bash',
    run(args, io) {
      const t = rest(args)[0];
      if (!t) { io.write('source: filename argument required', 'err'); return { code: 1 }; }
      const c = VFS.readFile(t);
      if (c === null) {
        io.write('bash: ' + t + ': No such file or directory', 'err');
        return { code: 1 };
      }
      c.split('\n').forEach((line) => {
        const m = line.match(/^\s*export\s+(\w+)=(.*)$/);
        if (m) Shell.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      });
      if (/setup\.bash$/.test(t)) {
        global.ROS.sourced = true;
        if (/install\/setup\.bash$/.test(t) || /install\/local_setup\.bash$/.test(t)) {
          global.ROS.overlaySourced = VFS.resolve(t);
          io.explain(
            'Now your terminal can find the packages **you** built, not just the ones that came with ROS 2.',
            'Sourcing the workspace overlay prepends its install space to AMENT_PREFIX_PATH.'
          );
        } else {
          io.explain(
            'You just **switched ROS 2 on** for this terminal. Before this, typing `ros2` was like ' +
            'asking for a book in a library you never joined. Now you have a library card. ' +
            'You have to do this in **every new terminal**.',
            'Sourcing setup.bash exports AMENT_PREFIX_PATH, ROS_DISTRO, and the ament index paths.'
          );
        }
        global.U.Bus.emit('ros:sourced', { path: t });
      }
      return { code: 0 };
    }
  });
  Shell.def('.', Shell.cmds.source);

  def('printenv', {
    help: 'Show the settings your terminal is remembering.',
    usage: 'printenv [NAME]',
    run(args, io) {
      const key = rest(args)[0];
      if (key) {
        if (Shell.env[key] === undefined) return { code: 1 };
        io.write(Shell.env[key]);
        return { code: 0 };
      }
      io.write(Object.keys(Shell.env).sort().map((k) => k + '=' + Shell.env[k]).join('\n'));
      return { code: 0 };
    }
  });
  Shell.def('env', Shell.cmds.printenv);

  def('export', {
    help: 'Remember a setting in this terminal.',
    usage: 'export NAME=value',
    run(args, io) {
      args.forEach((a) => {
        const m = a.match(/^(\w+)=(.*)$/);
        if (m) Shell.env[m[1]] = m[2];
      });
      io.explain('You told this terminal to **remember** something. It forgets when the terminal closes.',
        'Environment variable set for this shell only.');
      return { code: 0 };
    }
  });

  /* ---- fun / meta ---- */
  def('whoami', { help: 'Who are you?', usage: 'whoami', run(a, io) { io.write(Shell.env.USER); return { code: 0 }; } });
  def('date', { help: "Today's date.", usage: 'date', run(a, io) { io.write(new Date().toString()); return { code: 0 }; } });

  def('sudo', {
    help: 'Do something as the boss of the computer.',
    usage: 'sudo <command>',
    run(args, io) {
      if (!args.length) { io.write('usage: sudo <command>', 'err'); return { code: 1 }; }
      io.write('[sudo] password for student: ');
      io.write("You are already the boss of this pretend computer — no password needed here!", 'hint');
      return Shell.exec(args.join(' '), io.raw);
    }
  });

  def('clear', {
    help: 'Wipe the screen clean.',
    usage: 'clear',
    run(args, io) { global.U.Bus.emit('term:clear', {}); return { code: 0 }; }
  });

  def('history', {
    help: 'Show the commands you have typed.',
    usage: 'history',
    run(args, io) {
      io.write(Shell.history.map((h, i) => U.pad(i + 1, 4) + '  ' + h).join('\n'));
      return { code: 0 };
    }
  });

  def('which', {
    help: 'Where does a command live?',
    usage: 'which <command>',
    run(args, io) {
      const n = rest(args)[0];
      if (Shell.cmds[n]) { io.write(n === 'ros2' ? '/opt/ros/jazzy/bin/ros2' : '/usr/bin/' + n); return { code: 0 }; }
      return { code: 1 };
    }
  });

  def('man', {
    help: 'Read the manual for a command.',
    usage: 'man <command>',
    run(args, io) {
      const n = rest(args)[0];
      const c = Shell.cmds[n];
      if (!c) { io.write('No manual entry for ' + n, 'err'); return { code: 1 }; }
      io.write('<b>' + n.toUpperCase() + '</b>\n\n  ' + c.help + '\n\n<b>USAGE</b>\n  ' + c.usage, 'html');
      return { code: 0 };
    }
  });

  def('python3', {
    help: 'Run a Python file.',
    usage: 'python3 <file.py>',
    run(args, io) {
      const f = rest(args)[0];
      if (!f) { io.write('Python 3.12.3 — but this pretend computer has no Python prompt.', 'hint'); return { code: 0 }; }
      if (!VFS.exists(f)) { io.write("python3: can't open file '" + f + "': No such file or directory", 'err'); return { code: 2 }; }
      io.write('This academy runs your ROS 2 nodes with  ros2 run  instead of  python3 .', 'hint');
      io.write('Build your package first (colcon build), then:  ros2 run <package> <node>', 'hint');
      return { code: 0 };
    }
  });

  def('help', {
    help: 'Show every command you can use.',
    usage: 'help',
    run(args, io) {
      const groups = [
        ['Looking around', ['pwd', 'ls', 'tree', 'cat', 'head', 'tail', 'wc', 'grep', 'find']],
        ['Making & breaking things', ['mkdir', 'touch', 'echo', 'cp', 'mv', 'rm', 'rmdir', 'nano']],
        ['Moving', ['cd']],
        ['ROS 2', ['source', 'ros2', 'colcon', 'rqt_graph', 'rviz2']],
        ['Terminal life', ['clear', 'history', 'help', 'man', 'which', 'printenv', 'export', 'whoami', 'date']],
        ['Academy extras', ['hint', 'lesson', 'reset', 'kill', 'jobs', 'showme', 'version']]
      ];
      const out = ['<b>Commands you can use right now</b>', ''];
      groups.forEach((g) => {
        out.push('<span class="d">' + g[0] + '</span>');
        g[1].forEach((n) => {
          const c = Shell.cmds[n];
          if (!c) return;
          out.push('  <span class="x">' + U.escapeHtml(n) + '</span>' + ' '.repeat(Math.max(1, 12 - n.length)) + U.escapeHtml(c.help));
        });
        out.push('');
      });
      out.push('Type  <span class="x">man ls</span>  (or any command) to read more about it.');
      out.push('Press <b>Tab</b> to auto-complete, <b>↑</b> for the last command, <b>Ctrl+C</b> to stop something.');
      io.write(out.join('\n'), 'html');
      return { code: 0 };
    }
  });

  def('find', {
    help: 'Search for files by name.',
    usage: 'find <folder> -name <pattern>',
    run(args, io) {
      const a = rest(args);
      const start = a[0] || '.';
      const i = args.indexOf('-name');
      const pattern = i >= 0 ? args[i + 1] : '*';
      const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const hits = VFS.allPaths(start).filter((p) => re.test(VFS.basename(p.path) || '/'));
      io.write(hits.map((h) => h.path).join('\n'));
      return { code: 0 };
    }
  });

  global.Shell = Shell;
})(window);
