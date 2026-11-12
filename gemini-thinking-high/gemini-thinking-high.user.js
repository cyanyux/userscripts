// ==UserScript==
// @name         Gemini — Always High Thinking
// @namespace    local.gemini.thinking-high
// @version      1.3.0
// @description  Keep Gemini's remembered model; automatically set its thinking level to High.
// @match        https://gemini.google.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @downloadURL  https://github.com/cyanyux/userscripts/raw/main/gemini-thinking-high/gemini-thinking-high.user.js
// @updateURL    https://github.com/cyanyux/userscripts/raw/main/gemini-thinking-high/gemini-thinking-high.user.js
// ==/UserScript==

(() => {
  'use strict';

  const PICKER = 'button[data-test-id="bard-mode-menu-button"]';
  const THINKING = /^(Thinking level|思考程度|思考層級|思考等级|思考级别)$/i;
  const HIGH = /^(High|高|高等)(?:\s|$)/i;
  const HIGH_LABEL = /(?:^|\s)(High|高|高等)\s*$/i;
  const INSTANCE = '__geminiAlwaysHighThinking';
  const AUTO_SWITCH = 'data-gemini-high-auto-switch';
  if (typeof window[INSTANCE]?.stop === 'function') window[INSTANCE].stop();

  let stopped = false;
  let interval;
  let scheduled;
  let button;
  let run;
  let key = '';
  let pauseUntil = 0;
  let retryAt = 0;
  let failures = 0;
  const discoveryDeadline = Date.now() + 10_000;
  const text = element => (element?.textContent || '').trim().replace(/\s+/g, ' ');
  const label = element => element?.getAttribute('aria-label') || text(element);
  const visible = element => !!element?.isConnected && element.checkVisibility({
    checkVisibilityCSS: true, checkOpacity: true,
  });
  const enabled = element => visible(element) && !element.matches(':disabled, [aria-disabled="true"]');
  const controlledMenu = trigger => document.getElementById(trigger.getAttribute('aria-controls'));
  const menuItems = menu => [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')]
    .filter(item => item.closest('[role="menu"]') === menu && enabled(item));
  const popupOpen = () => [...document.querySelectorAll('[role="menu"], [role="dialog"], [aria-modal="true"]')]
    .some(visible);
  const observer = new MutationObserver(() => schedule());
  // Startup only: stop observing the page as soon as the picker exists, or
  // after ten seconds on pages without one (for example the sign-in page).
  const discovery = new MutationObserver(() => schedule());
  discovery.observe(document, { childList: true, subtree: true });

  function schedule() {
    if (stopped || document.hidden || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      tick();
    });
  }

  function interact(event) {
    if (!event.isTrusted) return;
    pauseUntil = Date.now() + 1500;
    if (run) {
      unmute(run);
      // Do not close a menu the user has started interacting with.
      run.userOwnsMenu = event.target === run.button || run.button.contains(event.target)
        || run.menu?.contains(event.target) || run.submenu?.contains(event.target);
      run.cancelled = true;
      run.cancelWait?.();
    }
  }

  function unmute(task) {
    task.style?.remove();
    if (task.muted) {
      if (task.previousMarker === null) task.button.removeAttribute(AUTO_SWITCH);
      else task.button.setAttribute(AUTO_SWITCH, task.previousMarker);
      task.muted = false;
    }
  }

  async function setHigh(target) {
    const task = { button: target, url: location.href, cancelled: false, userOwnsMenu: false };
    run = task;
    const focus = document.activeElement;
    const valid = () => !stopped && !task.cancelled && !document.hidden
      && location.href === task.url && target.isConnected && target === button;
    async function waitFor(find, timeout = 3000) {
      if (!valid()) return null;
      const ready = find();
      if (ready) return ready;
      return new Promise((resolve, reject) => {
        let settled = false;
        const seen = new Set();
        const changes = new MutationObserver(check);
        const poll = setInterval(check, 100); // CSS-only visibility changes.
        const deadline = setTimeout(() => finish(null), timeout);
        function finish(value, error) {
          if (settled) return;
          settled = true;
          changes.disconnect();
          clearInterval(poll);
          clearTimeout(deadline);
          task.cancelWait = undefined;
          if (error) reject(error);
          else resolve(value);
        }
        function check() {
          if (settled) return;
          try {
            if (!valid()) return finish(null);
            const value = find();
            if (value) return finish(value);
            for (const element of [target.parentElement || target, task.menu, task.submenu]) {
              if (element && !seen.has(element)) {
                seen.add(element);
                changes.observe(element, { attributes: true, childList: true, subtree: true });
              }
            }
          } catch (error) { finish(null, error); }
        }
        task.cancelWait = () => finish(null);
        check();
      });
    }
    try {
      // All clicks are limited to the picker, its Thinking level trigger, and High.
      if (!valid() || !enabled(target) || popupOpen()) return;
      // Clip instead of hiding with display/visibility/opacity, so menu readiness
      // checks still work. This stylesheet exists only during our own switch.
      task.style = document.createElement('style');
      task.style.textContent = 'gem-menu[role="menu"], .popover-menu:has(> gem-menu[role="menu"]),'
        + '.submenu-container:has(> gem-menu[role="menu"]) { clip-path: inset(50%) !important; pointer-events: none !important; }'
        + 'gem-menu[role="menu"], gem-menu[role="menu"] *, [' + AUTO_SWITCH + '], [' + AUTO_SWITCH + '] *'
        + ' { animation: none !important; transition: none !important; }'
        + '[' + AUTO_SWITCH + '] .dropdown-icon { transform: none !important; }'
        + '[' + AUTO_SWITCH + '] { outline: none !important; box-shadow: none !important; }'
        + '[' + AUTO_SWITCH + '] .mdc-button__ripple::before, [' + AUTO_SWITCH + '] .mdc-button__ripple::after,'
        + '[' + AUTO_SWITCH + '] .mat-ripple, [' + AUTO_SWITCH + '] .mat-mdc-button-ripple,'
        + '[' + AUTO_SWITCH + '] .mat-mdc-focus-indicator::before { opacity: 0 !important; }';
      document.documentElement.append(task.style);
      task.previousMarker = target.getAttribute(AUTO_SWITCH);
      task.muted = true;
      target.setAttribute(AUTO_SWITCH, '');
      target.click();
      const thinking = await waitFor(() => {
        task.menu = controlledMenu(target);
        return visible(task.menu) && menuItems(task.menu).find(item => THINKING.test(text(item)));
      });
      if (!thinking || !valid()) return;
      thinking.click();
      const high = await waitFor(() => {
        task.submenu = controlledMenu(thinking);
        return visible(task.submenu) && menuItems(task.submenu).find(item =>
          item.getAttribute('role') === 'menuitemradio' && HIGH.test(text(item)));
      });
      if (!high || !valid()) return;
      if (high.getAttribute('aria-checked') !== 'true') high.click();
      const confirmed = await waitFor(() => HIGH_LABEL.test(label(target)));
      if (!confirmed && valid()) console.warn('[Gemini Always High] High was not confirmed.');
    } catch (error) {
      console.warn('[Gemini Always High]', error);
    } finally {
      try {
        // A timeout is retryable; it never permanently marks a model unsupported.
        if (valid()) {
          failures = HIGH_LABEL.test(label(target)) ? 0 : failures + 1;
          retryAt = Date.now() + 5000;
        }
        if (!task.userOwnsMenu && target.isConnected && task.menu
          && controlledMenu(target) === task.menu && visible(task.menu)
          && target.getAttribute('aria-expanded') === 'true') target.click();
        // Keep closing animations clipped too, without delaying the High setting.
        if (valid() && task.menu && !task.userOwnsMenu) {
          await waitFor(() => !visible(task.menu), 300);
        }
        const active = document.activeElement;
        if (valid() && focus?.isConnected && focus !== document.body
          && (active === target || task.menu?.contains(active) || task.submenu?.contains(active))) {
          focus.focus({ preventScroll: true });
        }
      } catch (error) {
        console.warn('[Gemini Always High] Menu cleanup failed:', error);
      } finally {
        try { unmute(task); }
        finally {
          run = undefined;
          schedule();
        }
      }
    }
  }

  function tick() {
    if (stopped || document.hidden) return;
    const current = button?.isConnected ? button : document.querySelector(PICKER);
    if (current || Date.now() >= discoveryDeadline) discovery.disconnect();
    if (current !== button) {
      if (run) {
        run.cancelled = true;
        run.cancelWait?.();
      }
      observer.disconnect();
      button = current;
      key = '';
      if (button) observer.observe(button, {
        attributes: true, attributeFilter: ['aria-label', 'aria-disabled', 'disabled'],
        childList: true, characterData: true, subtree: true,
      });
    }
    if (!button) return;
    if (run) {
      if (location.href !== run.url) {
        run.cancelled = true;
        run.cancelWait?.();
      }
      return;
    }
    const nextKey = location.href + '\n' + label(button);
    if (nextKey !== key) {
      key = nextKey;
      failures = 0;
      retryAt = 0;
    }
    // No layout reads or menu scans on the common, already-High path.
    if (HIGH_LABEL.test(label(button)) || failures >= 3) return;
    if (Date.now() < pauseUntil || Date.now() < retryAt) return;
    if (enabled(button) && !popupOpen()) void setHigh(button);
  }

  function visibilityChanged() {
    clearInterval(interval);
    if (document.hidden) {
      discovery.disconnect();
      if (run) {
        run.cancelled = true;
        run.cancelWait?.();
      }
      return;
    }
    // A newly visible tab gets another chance after transient loading failures.
    key = '';
    if (!button && Date.now() < discoveryDeadline) {
      discovery.observe(document, { childList: true, subtree: true });
    }
    interval = setInterval(tick, 1000);
    schedule();
  }

  document.addEventListener('pointerdown', interact, true);
  document.addEventListener('keydown', interact, true);
  document.addEventListener('visibilitychange', visibilityChanged);
  window[INSTANCE] = {
    version: '1.3.0',
    stop() {
      stopped = true;
      if (run) {
        run.cancelled = true;
        run.cancelWait?.();
        unmute(run);
      }
      clearInterval(interval);
      observer.disconnect();
      discovery.disconnect();
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
      document.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
  visibilityChanged();
})();
