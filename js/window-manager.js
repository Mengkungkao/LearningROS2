/* ===========================================================
   window-manager.js — movable workspace windows.
   =========================================================== */
(function (global) {
  'use strict';

  const WindowManager = {
    init() {
      this.windows = Array.from(document.querySelectorAll('.app-window'));
      this.windows.forEach((win) => this.bind(win));
    },

    bind(win) {
      win.querySelectorAll('[data-window-action="minimize"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const minimized = win.classList.toggle('is-minimized');
          button.textContent = minimized ? '+' : '—';
          button.title = (minimized ? 'Restore ' : 'Minimize ') + win.dataset.window;
        });
      });

      win.querySelectorAll('[data-window-action="hide-lessons"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          this.toggleLessons();
        });
      });

      const bar = win.querySelector('.windowbar');
      if (!bar) return;
      bar.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button')) return;
        this.floatAndDrag(win, event);
      });
    },

    toggleLessons() {
      document.body.classList.toggle('lesson-hidden');
      document.body.classList.remove('nav-open');
    },

    floatAndDrag(win, startEvent) {
      if (window.matchMedia('(max-width: 1180px)').matches) return;
      const rect = win.getBoundingClientRect();
      if (!win.classList.contains('is-floating')) {
        win.classList.add('is-floating');
        win.style.left = rect.left + 'px';
        win.style.top = rect.top + 'px';
        win.style.width = rect.width + 'px';
        win.style.height = rect.height + 'px';
      }

      const startX = startEvent.clientX;
      const startY = startEvent.clientY;
      const left = parseFloat(win.style.left) || rect.left;
      const top = parseFloat(win.style.top) || rect.top;
      const move = (event) => {
        win.style.left = Math.max(0, left + event.clientX - startX) + 'px';
        win.style.top = Math.max(52, top + event.clientY - startY) + 'px';
      };
      const stop = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop, { once: true });
      win.style.zIndex = String(50 + this.windows.indexOf(win));
      startEvent.preventDefault();
    }
  };

  global.WindowManager = WindowManager;
  window.addEventListener('DOMContentLoaded', () => WindowManager.init());
})(window);
