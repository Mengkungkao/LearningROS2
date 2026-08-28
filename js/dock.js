/* ===========================================================
   dock.js — two panes, five panels, one rule:
   a panel can only be in one place at a time.

   The point of the split is teaching. Put the Robot in one pane
   and the Graph in the other, press an arrow key, and you can
   watch the cause and the effect at the same moment: the message
   leaves teleop, crosses /turtle1/cmd_vel, reaches turtlesim, and
   the turtle moves.
   =========================================================== */
(function (global) {
  'use strict';
  const U = global.U, Bus = U.Bus, el = U.el;

  const META = {
    files:   { icon: '📁', label: 'Files' },
    editor:  { icon: '📝', label: 'Editor' },
    graph:   { icon: '🕸️', label: 'Graph' },
    robot:   { icon: '🐢', label: 'Robot' },
    inspect: { icon: '📊', label: 'Inspect' }
  };
  const ORDER = ['files', 'editor', 'graph', 'robot', 'inspect'];

  const Dock = {
    order: ORDER,
    meta: META,
    split: false,
    pinned: false,          // once you choose pane B, suggestions stop stealing it
    at: { a: 'files', b: 'graph' },

    init() {
      this.bodies = { a: U.$('#body-a'), b: U.$('#body-b') };
      this.tabs = { a: U.$('#tabs-a'), b: U.$('#tabs-b') };

      const saved = U.Store.get('ros2academy.dock', null);
      if (saved && saved.at && META[saved.at.a] && META[saved.at.b]) {
        this.at = saved.at;
        this.split = !!saved.split;
        this.pinned = !!saved.pinned;
      }

      this.buildTabs('a');
      this.buildTabs('b');
      this.apply();

      /* Labels are nice until they do not fit. Then the icons carry it. */
      if (global.ResizeObserver) {
        const ro = new ResizeObserver(() => this.fitTabs());
        ro.observe(U.$('#views'));
      }
      window.addEventListener('resize', () => this.fitTabs());
      Bus.on('layout:change', (e) => { if (e.key === 'views' || e.key === 'split') this.fitTabs(); });
    },

    /** Drop the tab labels whenever the strip would otherwise scroll. */
    fitTabs() {
      ['a', 'b'].forEach((pane) => {
        const host = this.tabs[pane];
        if (!host || !host.offsetParent) return;
        host.classList.remove('compact');
        if (host.scrollWidth > host.clientWidth + 1) host.classList.add('compact');
      });
    },

    save() {
      U.Store.set('ros2academy.dock', { at: this.at, split: this.split, pinned: this.pinned });
    },

    buildTabs(pane) {
      const host = this.tabs[pane];
      host.innerHTML = '';
      ORDER.forEach((name) => {
        host.appendChild(el('button', {
          'data-panel': name, 'data-pane': pane,
          title: META[name].label,
          onClick: () => this.show(pane, name, true)
        }, [
          el('span', { class: 'ti', text: META[name].icon }),
          el('span', { class: 'tl', text: META[name].label })
        ]));
      });

      if (pane === 'a') {
        host.appendChild(el('span', { class: 'tabspacer' }));
        host.appendChild(el('button', {
          class: 'splitbtn', id: 'btn-split',
          title: 'Show two panels at once',
          onClick: () => this.setSplit(!this.split, true)
        }, [el('span', { text: '⫽' }), el('span', { class: 'tl', text: 'Split' })]));
      } else {
        host.appendChild(el('span', { class: 'tabspacer' }));
        host.appendChild(el('button', {
          class: 'splitbtn close', title: 'Close this pane',
          onClick: () => this.setSplit(false, true)
        }, [el('span', { text: '✕' })]));
      }
    },

    /** Where is this panel right now? 'a', 'b', or null. */
    paneOf(name) {
      if (this.at.a === name) return 'a';
      if (this.split && this.at.b === name) return 'b';
      return null;
    },

    isVisible(name) { return !!this.paneOf(name); },

    /**
     * Put a panel in a pane. If it is already in the *other* pane,
     * the two swap rather than one vanishing — much less surprising.
     */
    show(pane, name, byUser) {
      if (!META[name]) return;
      if (pane === 'b' && !this.split) this.setSplit(true);

      const other = pane === 'a' ? 'b' : 'a';
      if (this.split && this.at[other] === name) {
        this.at[other] = this.at[pane];
      }
      this.at[pane] = name;
      if (byUser && pane === 'b') this.pinned = true;
      this.apply();
      this.save();
    },

    setSplit(on, byUser) {
      if (on === this.split) return;
      this.split = on;
      if (on) {
        /* open the pairing that teaches the most: whatever you are
           looking at, plus the graph beside it (or the robot, if the
           graph is what you already had). */
        if (this.at.b === this.at.a) this.at.b = this.at.a === 'graph' ? 'robot' : 'graph';
        if (byUser) {
          Bus.emit('explain', {
            kid: 'Two panels at once. Put the **Robot** in one and the **Graph** in the other, then press an ' +
              'arrow key: you can watch the message leave, cross the wire, and move the turtle — all in one go.',
            pro: 'Split view. Drag the divider to resize; it snaps to the common fractions.'
          });
        }
      } else {
        this.pinned = false;
      }
      this.apply();
      this.save();
      Bus.emit('dock:change', { split: this.split, at: this.at });
    },

    /** One-click "show me the cause and the effect together". */
    watchItHappen() {
      this.at.a = 'robot';
      this.at.b = 'graph';
      this.pinned = true;
      this.setSplit(true);
      if (!this.split) { this.split = true; this.apply(); this.save(); }
      Bus.emit('explain', {
        kid: 'Robot on top, Graph underneath. Now press an arrow key (click the blue square first) and ' +
          'watch **both at once**: a green dot flies along the wire, and the turtle moves when it arrives.',
        pro: 'Robot + Graph split, so cmd_vel traffic and its effect are visible in the same frame.'
      });
    },

    /** Move the panel elements into the right pane and light the right tabs. */
    apply() {
      document.body.classList.toggle('split-on', this.split);

      ORDER.forEach((name) => {
        const panel = U.$('#panel-' + name);
        if (!panel) return;
        const pane = this.paneOf(name);
        panel.classList.toggle('on', !!pane);
        if (pane && panel.parentNode !== this.bodies[pane]) {
          this.bodies[pane].appendChild(panel);
        } else if (!pane && panel.parentNode !== this.bodies.a) {
          this.bodies.a.appendChild(panel);      // park it out of sight in pane A
        }
      });

      ['a', 'b'].forEach((pane) => {
        U.$$('#tabs-' + pane + ' button[data-panel]').forEach((b) => {
          const name = b.getAttribute('data-panel');
          b.classList.toggle('on', this.at[pane] === name);
          b.classList.toggle('elsewhere', this.split && this.at[pane] !== name && this.paneOf(name) !== null);
        });
      });

      const sb = U.$('#btn-split');
      if (sb) sb.classList.toggle('on', this.split);

      /* canvases need a nudge after being re-parented or resized */
      requestAnimationFrame(() => {
        this.fitTabs();
        if (global.Sim && global.Sim.resize) { global.Sim.resize(); global.Sim.updateHint(); }
        if (global.Graph && global.Graph.resize) { global.Graph.resize(); global.Graph.dirty = true; }
        Bus.emit('dock:applied', { split: this.split, at: this.at });
      });
    }
  };

  global.Dock = Dock;
})(window);
