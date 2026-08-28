/* ===========================================================
   mobile.js — the phone build.

   A three-column desktop layout does not survive a 390px screen,
   so below 820px the app becomes three full-height sections
   behind a bottom bar. This file owns that mode: which section
   is showing, keeping the input above the on-screen keyboard,
   and turning the current lesson's commands into buttons you can
   tap instead of typing them on glass.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, Bus = U.Bus, el = U.el;

  const SECTIONS = [
    { id: 'lessons',  icon: '📚', label: 'Lessons' },
    { id: 'terminal', icon: '⌨️', label: 'Terminal' },
    { id: 'views',    icon: '👁️', label: 'Live view' }
  ];

  const Mobile = {
    on: false,
    section: 'terminal',

    init() {
      /* narrow OR short: a phone in landscape is 844x390, wide enough to
         slip past a width-only rule and far too short for three columns */
      this.mq = window.matchMedia('(max-width: 820px), (max-height: 500px)');
      this.buildBar();
      this.buildChips();
      this.watchKeyboard();

      const apply = () => this.setMode(this.mq.matches);
      if (this.mq.addEventListener) this.mq.addEventListener('change', apply);
      else if (this.mq.addListener) this.mq.addListener(apply);
      apply();

      /* A suggestion must never yank the screen away mid-thought. It
         lights the Live view button instead, and the learner decides. */
      Bus.on('panel:suggest', (p) => this.nudge(p.panel));
      Bus.on('panel:show', (p) => this.nudge(p.panel));
      Bus.on('lesson:open', () => this.buildChips());
      Bus.on('command', () => { if (this.on) this.buildChips(); });

      const saved = U.Store.get('ros2academy.mobsection', null);
      if (saved) this.section = saved;
    },

    setMode(on) {
      this.on = on;
      document.body.classList.toggle('mobile-mode', on);
      if (on) this.go(this.section, true);
      else {
        document.body.classList.remove('mob-lessons', 'mob-terminal', 'mob-views');
        document.body.classList.remove('nav-open');
      }
      this.placeDpad();
      this.buildChips();
      this.reflow();
    },

    /**
     * On a phone the D-pad floats over the canvas like a game controller;
     * on a desktop it sits below it. Moving the element keeps the touch
     * handlers Sim already bound to those buttons.
     */
    placeDpad() {
      const dpad = U.$('#panel-robot .dpad') || U.$('.dpad');
      const wrap = U.$('#panel-robot .canvaswrap');
      const panel = U.$('#panel-robot');
      const wire = U.$('#sim-wire');
      if (!dpad || !wrap || !panel) return;
      if (this.on) {
        if (dpad.parentNode !== wrap) wrap.appendChild(dpad);
      } else if (dpad.parentNode !== panel) {
        panel.insertBefore(dpad, wire || null);
      }
    },

    buildBar() {
      const bar = el('div', { id: 'mobile-bar', role: 'tablist' });
      SECTIONS.forEach((s) => {
        bar.appendChild(el('button', {
          'data-section': s.id, role: 'tab', 'aria-label': s.label,
          onClick: () => this.go(s.id, true)
        }, [
          el('i', { text: s.icon }),
          el('span', { text: s.label }),
          el('span', { class: 'mdot' })
        ]));
      });
      document.body.appendChild(bar);
      this.bar = bar;
    },

    go(id, byUser) {
      this.section = id;
      SECTIONS.forEach((s) => {
        document.body.classList.toggle('mob-' + s.id, s.id === id);
      });
      U.$$('#mobile-bar button').forEach((b) => {
        const mine = b.getAttribute('data-section') === id;
        b.classList.toggle('on', mine);
        if (mine) b.classList.remove('nudge');
      });
      U.Store.set('ros2academy.mobsection', id);
      this.reflow();
      if (byUser && id === 'terminal') setTimeout(() => global.Term.focus(), 60);
    },

    /** Something interesting happened somewhere you are not looking. */
    nudge(panel) {
      if (!this.on || this.section === 'views') return;
      const b = U.$('#mobile-bar button[data-section="views"]');
      if (b) b.classList.add('nudge');
      void panel;
    },

    /** Canvases and tab strips need a beat after a section appears. */
    reflow() {
      requestAnimationFrame(() => {
        if (global.Sim && global.Sim.resize) { global.Sim.resize(); global.Sim.updateHint(); }
        if (global.Graph && global.Graph.resize) { global.Graph.resize(); global.Graph.dirty = true; }
        if (global.Dock && global.Dock.fitTabs) global.Dock.fitTabs();
        if (global.Term && global.Term.scroll) global.Term.scroll();
      });
    },

    /* ---- the on-screen keyboard ------------------------- */
    /**
     * A phone keyboard covers the bottom half of the screen without
     * changing window.innerHeight, so a fixed-height app ends up typing
     * into a box nobody can see. visualViewport reports what is actually
     * left, and --app-h follows it.
     */
    watchKeyboard() {
      const root = document.documentElement;
      const vv = window.visualViewport;
      const setH = (px) => root.style.setProperty('--app-h', Math.round(px) + 'px');

      if (!vv) { setH(window.innerHeight); window.addEventListener('resize', () => setH(window.innerHeight)); return; }

      const fit = () => {
        setH(vv.height);
        /* the keyboard is up if the viewport lost real height */
        const covered = window.innerHeight - vv.height;
        const open = covered > 120;
        document.body.classList.toggle('keyboard-open', open);
        if (open && this.on) {
          this.go('terminal');
          requestAnimationFrame(() => global.Term && global.Term.scroll && global.Term.scroll());
        }
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      window.addEventListener('orientationchange', () => setTimeout(fit, 250));
      fit();
    },

    /* ---- tap the command instead of typing it ----------- */
    /**
     * Typing `ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist
     * "{linear: {x: 2.0}}"` on a phone keyboard is punishing. The current
     * lesson's commands sit above the keyboard as buttons; one tap loads
     * the line, and you still press Enter yourself.
     */
    buildChips() {
      const host = U.$('#lesson-chips');
      if (!host) return;
      host.innerHTML = '';
      if (!this.on) return;

      const App = global.App;
      const lesson = App && App.byId ? App.byId(App.current) : null;
      const cmds = (lesson && lesson.cheats) ? lesson.cheats.slice(0, 10) : [];
      if (!cmds.length) return;

      host.appendChild(el('span', { class: 'chiplabel', text: 'this lesson' }));
      cmds.forEach((c) => {
        host.appendChild(el('button', {
          title: c,
          onClick: () => {
            Bus.emit('term:type', { text: c, run: false, instant: true });
            this.go('terminal');
          }
        }, [c.length > 34 ? c.slice(0, 33) + '…' : c]));
      });
    }
  };

  global.Mobile = Mobile;
})(window);
