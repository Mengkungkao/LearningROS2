/* ===========================================================
   app.js — the lesson engine and everything that glues the
   academy together: progress, XP, badges, hints, saving.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, VFS = global.VFS, ROS = global.ROS, Shell = global.Shell,
    Term = global.Term, Panels = global.Panels, Bus = U.Bus;
  const el = U.el;

  const SAVE_KEY = 'ros2academy.save.v1';

  const App = {
    lessons: global.LESSONS,
    current: null,
    startIdx: 0,
    history: [],
    done: Object.create(null),
    taskDone: Object.create(null),
    xp: 0,
    mode: 'kid',
    badges: Object.create(null),

    init() {
      this.load();

      Term.init(U.$('#terminal'));
      Panels.init();

      this.buildSidebar();
      this.bindChrome();

      Bus.on('command', (c) => { this.history.push(c.line); this.check(); this.saveSoon(); });
      Bus.on('editor:saved', () => { this.check(); this.saveSoon(); });
      Bus.on('vfs:change', () => this.saveSoon());
      Bus.on('ros:sourced', () => this.check());
      setInterval(() => this.check(), 1200);          // for "is it running?" style tasks

      const last = U.Store.get('ros2academy.lastLesson', null);
      this.openLesson(last && this.byId(last) ? last : this.lessons[0].id, true);
      this.renderProgress();

      setTimeout(() => Term.focus(), 300);
    },

    byId(id) { return this.lessons.filter((l) => l.id === id)[0]; },

    /* ---- persistence ----------------------------------- */
    load() {
      const s = U.Store.get(SAVE_KEY, null);
      if (!s) return;
      this.done = s.done || Object.create(null);
      this.xp = s.xp || 0;
      this.badges = s.badges || Object.create(null);
      this.mode = s.mode || 'kid';
      if (s.fs) {
        try {
          VFS.root = s.fs;
          VFS.cwd = VFS.isDir(s.cwd) ? s.cwd : VFS.HOME;
        } catch (e) { /* corrupted save: start fresh */ }
      }
    },

    saveSoon() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => this.save(), 700);
    },

    save() {
      U.Store.set(SAVE_KEY, {
        done: this.done, xp: this.xp, badges: this.badges, mode: this.mode,
        fs: VFS.root, cwd: VFS.cwd
      });
    },

    hardReset() {
      U.Store.del(SAVE_KEY);
      U.Store.del('ros2academy.lastLesson');
      U.Store.del('ros2academy.history');
      ROS.stopAll();
      ROS.reset();
      VFS.reset();
      this.done = Object.create(null);
      this.taskDone = Object.create(null);
      this.badges = Object.create(null);
      this.xp = 0;
      this.history = [];
      Term.clear();
      Term.banner();
      this.buildSidebar();
      this.openLesson(this.lessons[0].id, true);
      this.renderProgress();
    },

    /* ---- chrome ---------------------------------------- */
    bindChrome() {
      U.$$('#mode-toggle button').forEach((b) => {
        b.addEventListener('click', () => this.setMode(b.getAttribute('data-mode')));
      });
      this.setMode(this.mode);

      U.$('#btn-reset').addEventListener('click', () => {
        if (confirm('Start the whole academy again from zero?\n\nYour files, your code and your badges will all be erased.')) {
          this.hardReset();
        }
      });
      U.$('#btn-restart-world').addEventListener('click', () => {
        ROS.stopAll();
        Term.clear();
        Term.write('[all nodes stopped — your files are untouched]', 'dim');
        Term.write('');
      });
      U.$('#btn-sidebar').addEventListener('click', () => {
        document.body.classList.toggle('nav-open');
      });
      U.$('#lesson-prev').addEventListener('click', () => this.step(-1));
      U.$('#lesson-next').addEventListener('click', () => this.step(1));

      U.$$('#quickbar button').forEach((b) => {
        b.addEventListener('click', () => {
          const cmd = b.getAttribute('data-cmd');
          if (cmd === '__ctrlc') { Term.interrupt(); return; }
          Bus.emit('term:type', { text: cmd, run: b.getAttribute('data-run') !== 'no' });
        });
      });
    },

    setMode(m) {
      this.mode = m;
      document.body.classList.toggle('pro-mode', m === 'pro');
      U.$$('#mode-toggle button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-mode') === m));
      this.save();
    },

    /* ---- sidebar --------------------------------------- */
    buildSidebar() {
      const nav = U.$('#lesson-nav');
      nav.innerHTML = '';
      const levels = {};
      this.lessons.forEach((l) => { (levels[l.level] || (levels[l.level] = [])).push(l); });
      const titles = {
        1: 'Level 1 · Talking to a computer',
        2: 'Level 2 · Meeting ROS 2',
        3: 'Level 3 · Poking the robot',
        4: 'Level 4 · Writing your own code',
        5: 'Level 5 · Pro moves'
      };
      Object.keys(levels).sort().forEach((lv) => {
        nav.appendChild(el('div', { class: 'navlevel', text: titles[lv] || 'Level ' + lv }));
        levels[lv].forEach((l) => {
          const isDone = !!this.done[l.id];
          nav.appendChild(el('button', {
            class: 'navitem' + (isDone ? ' done' : '') + (this.current === l.id ? ' on' : ''),
            'data-id': l.id,
            onClick: () => { this.openLesson(l.id); document.body.classList.remove('nav-open'); }
          }, [
            el('span', { class: 'nemoji', text: l.emoji }),
            el('span', { class: 'ntitle', text: l.title }),
            el('span', { class: 'ncheck', text: isDone ? '✓' : '' })
          ]));
        });
      });
    },

    step(dir) {
      const i = this.lessons.findIndex((l) => l.id === this.current);
      const next = this.lessons[i + dir];
      if (next) this.openLesson(next.id);
    },

    /* ---- opening a lesson ------------------------------ */
    openLesson(id, quiet) {
      const lesson = this.byId(id);
      if (!lesson) return;
      this.current = id;
      this.startIdx = this.history.length;
      this.taskDone[id] = this.taskDone[id] || {};
      U.Store.set('ros2academy.lastLesson', id);

      U.$$('#lesson-nav .navitem').forEach((b) => b.classList.toggle('on', b.getAttribute('data-id') === id));

      const body = U.$('#lesson-body');
      body.innerHTML = '';
      body.scrollTop = 0;

      body.appendChild(el('div', { class: 'lhead' }, [
        el('span', { class: 'lemoji', text: lesson.emoji }),
        el('div', {}, [
          el('h2', { text: lesson.title }),
          el('p', { class: 'lgoal', text: lesson.goal })
        ])
      ]));

      body.appendChild(el('div', { class: 'story kidonly', html: Panels.md(lesson.kid) }));
      body.appendChild(el('div', { class: 'story proonly', html: Panels.md(lesson.pro) }));

      /* tasks */
      const list = el('ol', { class: 'tasks', id: 'task-list' });
      lesson.tasks.forEach((t, i) => {
        list.appendChild(el('li', { class: 'task', 'data-i': i }, [
          el('span', { class: 'tickbox', text: '' }),
          el('div', { class: 'tbody' }, [
            el('div', { class: 'ttext', html: Panels.md(t.text) }),
            el('button', {
              class: 'thint', onClick: (e) => {
                const p = e.target.nextSibling;
                if (p) p.classList.toggle('show');
              }
            }, ['need a hint?']),
            el('div', { class: 'hinttext', html: Panels.md(t.hint || '') })
          ])
        ]));
      });
      body.appendChild(el('h3', { class: 'sect', text: 'Your turn' }));
      body.appendChild(list);

      /* code snippets */
      if (lesson.snippets && lesson.snippets.length) {
        body.appendChild(el('h3', { class: 'sect', text: 'Need the code?' }));
        const wrap = el('div', { class: 'snips' });
        lesson.snippets.forEach((s) => {
          wrap.appendChild(el('button', {
            class: 'snip',
            onClick: () => {
              const dir = VFS.dirname(s.path);
              if (!VFS.isDir(dir)) VFS.mkdir(dir, true);
              if (!VFS.exists(s.path)) VFS.writeFile(s.path, '');
              Bus.emit('editor:open', { path: s.path });
              Panels.show('editor', true);
              setTimeout(() => Bus.emit('editor:insert', { text: s.text }), 60);
              Bus.emit('explain', {
                kid: 'I put the example into the editor. **Read it, then press Save.** ' +
                  'Changing the numbers is how you learn what they do.',
                pro: 'Snippet loaded into ' + VFS.pretty(s.path) + '. Save writes it to the VFS; rebuild to apply.'
              });
            }
          }, [s.label]));
        });
        body.appendChild(wrap);
      }

      /* cheat sheet */
      if (lesson.cheats && lesson.cheats.length) {
        body.appendChild(el('h3', { class: 'sect', text: 'Commands in this lesson' }));
        const wrap = el('div', { class: 'cheats' });
        lesson.cheats.forEach((c) => {
          wrap.appendChild(el('button', {
            class: 'cheat', title: 'Click to type it into the terminal',
            onClick: () => Bus.emit('term:type', { text: c, run: false })
          }, [c]));
        });
        body.appendChild(wrap);
        body.appendChild(el('p', { class: 'tinynote', text: 'Click any command to drop it into the terminal — then press Enter yourself.' }));
      }

      if (lesson.panel) Panels.show(lesson.panel);
      this.check(true);

      if (!quiet) {
        Bus.emit('explain', {
          kid: 'New lesson: **' + lesson.title + '**. ' + lesson.goal,
          pro: 'Lesson ' + lesson.id + ' loaded.'
        });
      }
    },

    /* ---- checking your work ---------------------------- */
    check(silent) {
      const lesson = this.byId(this.current);
      if (!lesson) return;
      const ctx = {
        history: this.history.slice(this.startIdx),
        allHistory: this.history,
        vfs: VFS, ros: ROS
      };

      const state = this.taskDone[lesson.id];
      let changed = false, all = true;

      lesson.tasks.forEach((t, i) => {
        let ok = false;
        try { ok = !!t.check(ctx); } catch (e) { ok = false; }
        if (ok && !state[i]) { state[i] = true; changed = true; this.celebrate(i, silent); }
        if (!state[i]) all = false;
      });

      lesson.tasks.forEach((t, i) => {
        const li = U.$('#task-list li[data-i="' + i + '"]');
        if (li) li.classList.toggle('ok', !!state[i]);
      });

      if (all && lesson.tasks.length && !this.done[lesson.id]) {
        this.done[lesson.id] = true;
        this.xp += lesson.reward || 30;
        this.awardBadges(lesson);
        this.buildSidebar();
        this.finishBanner(lesson);
        this.save();
      }
      if (changed) { this.renderProgress(); this.save(); }
    },

    celebrate(i, silent) {
      if (silent) return;
      const li = U.$('#task-list li[data-i="' + i + '"]');
      if (li) {
        li.classList.add('pop');
        setTimeout(() => li.classList.remove('pop'), 700);
      }
      beep(880, 0.05);
    },

    finishBanner(lesson) {
      beep(660, 0.07);
      setTimeout(() => beep(880, 0.09), 90);
      setTimeout(() => beep(1180, 0.12), 190);

      const next = this.lessons[this.lessons.findIndex((l) => l.id === lesson.id) + 1];
      const card = el('div', { class: 'donecard' }, [
        el('div', { class: 'dtitle', text: '🎉 Lesson complete!' }),
        el('div', { class: 'dsub', text: lesson.title + '  ·  +' + (lesson.reward || 30) + ' XP' }),
        next ? el('button', {
          class: 'dnext', onClick: () => { this.openLesson(next.id); }
        }, ['Next: ' + next.emoji + ' ' + next.title])
          : el('div', { class: 'dsub', text: 'You finished the whole academy. Go build a real robot. 🤖' })
      ]);
      const body = U.$('#lesson-body');
      body.insertBefore(card, body.querySelector('.sect'));
      requestAnimationFrame(() => card.classList.add('in'));
      confetti();
    },

    awardBadges(lesson) {
      const give = (id, label) => {
        if (this.badges[id]) return;
        this.badges[id] = label;
        Bus.emit('explain', { kid: '🏅 New badge unlocked: **' + label + '**', pro: 'Badge: ' + label });
      };
      if (lesson.id === 'terminal-tidy') give('shell', 'Shell Explorer');
      if (lesson.id === 'ros-turtle') give('turtle', 'Turtle Wrangler');
      if (lesson.id === 'ros-remap') give('graph', 'Graph Reader');
      if (lesson.id === 'ws-publisher') give('coder', 'Node Author');
      if (lesson.id === 'ws-driver') give('driver', 'Robot Driver');
      if (lesson.id === 'ws-launch') give('launch', 'Launch Commander');
      if (lesson.id === 'pro-interfaces') give('iface', 'Message Designer');
      if (lesson.id === 'pro-graduate') give('grad', 'ROS 2 Graduate');
      const levelDone = this.lessons.filter((l) => l.level === lesson.level).every((l) => this.done[l.id]);
      if (levelDone) give('lvl' + lesson.level, 'Level ' + lesson.level + ' Champion');
    },

    renderProgress() {
      const total = this.lessons.length;
      const done = Object.keys(this.done).filter((k) => this.done[k]).length;
      U.$('#xp-count').textContent = this.xp;
      U.$('#progress-text').textContent = done + ' / ' + total + ' lessons';
      U.$('#progress-fill').style.width = (total ? (done / total) * 100 : 0) + '%';

      const bwrap = U.$('#badges');
      bwrap.innerHTML = '';
      const icons = {
        shell: '🐚', turtle: '🐢', graph: '🕸️', coder: '🐍', driver: '🎮',
        launch: '🚀', iface: '✉️', grad: '🎓', lvl1: '1️⃣', lvl2: '2️⃣', lvl3: '3️⃣', lvl4: '4️⃣', lvl5: '5️⃣'
      };
      Object.keys(this.badges).forEach((k) => {
        bwrap.appendChild(el('span', { class: 'badge2', title: this.badges[k], text: icons[k] || '🏅' }));
      });
    }
  };

  /* ---- little sounds & confetti ------------------------ */
  let audioCtx = null;
  function beep(freq, dur) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.value = 0.05;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur + 0.02);
    } catch (e) { /* no audio, no problem */ }
  }

  function confetti() {
    const host = U.$('#confetti');
    if (!host) return;
    const colors = ['#7aa2ff', '#78ffd6', '#ffd166', '#ff8fab', '#c792ea'];
    for (let i = 0; i < 60; i++) {
      const bit = el('i', {
        style: 'left:' + (Math.random() * 100) + '%;' +
          'background:' + colors[i % colors.length] + ';' +
          'animation-delay:' + (Math.random() * 0.4) + 's;' +
          'transform:rotate(' + (Math.random() * 360) + 'deg)'
      });
      host.appendChild(bit);
      setTimeout(() => bit.remove(), 2600);
    }
  }

  /* ---- academy-only terminal commands ------------------ */
  Shell.def('hint', {
    help: 'Get a hint for the lesson you are on.',
    usage: 'hint',
    run(args, io) {
      const lesson = App.byId(App.current);
      if (!lesson) { io.write('No lesson open.', 'hint'); return { code: 0 }; }
      const state = App.taskDone[lesson.id] || {};
      const next = lesson.tasks.findIndex((t, i) => !state[i]);
      if (next < 0) { io.write('You finished this lesson! Press "Next lesson" on the left. 🎉', 'hint'); return { code: 0 }; }
      io.write('Lesson: ' + lesson.title, 'hint');
      io.write('Next step: ' + stripMd(lesson.tasks[next].text), 'hint');
      if (lesson.tasks[next].hint) io.write('Hint: ' + stripMd(lesson.tasks[next].hint), 'hint');
      return { code: 0 };
    }
  });

  Shell.def('lesson', {
    help: 'Show the current lesson, or jump to another one.',
    usage: 'lesson [number]',
    run(args, io) {
      if (!args.length) {
        io.write(App.lessons.map((l, i) =>
          (App.done[l.id] ? ' ✓ ' : '   ') + U.pad(i + 1, 2) + '. ' + l.emoji + ' ' + l.title +
          (l.id === App.current ? '   <-- you are here' : '')).join('\n'));
        io.write('');
        io.write('Jump with:  lesson 7', 'hint');
        return { code: 0 };
      }
      const n = parseInt(args[0], 10);
      const l = App.lessons[n - 1];
      if (!l) { io.write('There is no lesson ' + args[0] + '. There are ' + App.lessons.length + '.', 'err'); return { code: 1 }; }
      App.openLesson(l.id);
      io.write('Opened lesson ' + n + ': ' + l.title);
      return { code: 0 };
    }
  });

  Shell.def('showme', {
    help: 'Watch the next command being typed for you.',
    usage: 'showme',
    run(args, io) {
      const lesson = App.byId(App.current);
      if (!lesson || !lesson.cheats || !lesson.cheats.length) { io.write('Nothing to show.', 'hint'); return { code: 0 }; }
      const state = App.taskDone[lesson.id] || {};
      const idx = lesson.tasks.findIndex((t, i) => !state[i]);
      const cmd = lesson.cheats[Math.max(0, Math.min(idx, lesson.cheats.length - 1))];
      io.write('Watch the prompt...', 'hint');
      setTimeout(() => Bus.emit('term:type', { text: cmd, run: false }), 400);
      return { code: 0 };
    }
  });

  Shell.def('reset', {
    help: 'Stop every node and clear the screen.',
    usage: 'reset',
    run(args, io) {
      ROS.stopAll();
      Bus.emit('term:clear', {});
      io.write('[everything stopped — your files are safe]', 'dim');
      return { code: 0 };
    }
  });

  function stripMd(s) { return String(s).replace(/[`*]/g, ''); }

  global.App = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})(window);
