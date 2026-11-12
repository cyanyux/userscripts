// ==UserScript==
// @name         Gemini — Always High Thinking
// @namespace    local.gemini.thinking-high
// @version      1.1.0
// @description  Keep Gemini's remembered model; automatically set its thinking level to High.
// @match        https://gemini.google.com/*
// @run-at       document-idle
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
  if (typeof window[INSTANCE]?.stop === 'function') window[INSTANCE].stop();

  let stopped = false;
  let interval;
  let scheduled;
  let button;
  let run;
  let key = '';
  let stableAt = 0;
  let pauseUntil = 0;
  let retryAt = 0;
  let failures = 0;
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

  function schedule() {
    if (stopped || document.hidden || scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      tick();
    }, 150);
  }

  function interact(event) {
    if (!event.isTrusted) return;
    pauseUntil = Date.now() + 1500;
    if (run) {
      // Do not close a menu the user has started interacting with.
      run.userOwnsMenu = event.target === run.button || run.button.contains(event.target)
        || run.menu?.contains(event.target) || run.submenu?.contains(event.target);
      run.cancelled = true;
    }
  }

  async function setHigh(target) {
    const task = { button: target, url: location.href, cancelled: false, userOwnsMenu: false };
    run = task;
    const focus = document.activeElement;
    const valid = () => !stopped && !task.cancelled && !document.hidden
      && location.href === task.url && target.isConnected && target === button;
    async function waitFor(find) {
      const deadline = Date.now() + 3000;
      while (valid() && Date.now() < deadline) {
        const result = find();
        if (result) return result;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return null;
    }
    try {
      // All clicks are limited to the picker, its Thinking level trigger, and High.
      if (!valid() || !enabled(target) || popupOpen()) return;
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
        const active = document.activeElement;
        if (valid() && focus?.isConnected && focus !== document.body
          && (active === target || task.menu?.contains(active) || task.submenu?.contains(active))) {
          focus.focus({ preventScroll: true });
        }
      } catch (error) {
        console.warn('[Gemini Always High] Menu cleanup failed:', error);
      } finally {
        run = undefined;
        schedule();
      }
    }
  }

  function tick() {
    if (stopped || document.hidden) return;
    const current = button?.isConnected ? button : document.querySelector(PICKER);
    if (current !== button) {
      if (run) run.cancelled = true;
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
      if (location.href !== run.url) run.cancelled = true;
      return;
    }
    const nextKey = location.href + '\n' + label(button);
    if (nextKey !== key) {
      key = nextKey;
      stableAt = Date.now();
      failures = 0;
      retryAt = 0;
    }
    // No layout reads or menu scans on the common, already-High path.
    if (HIGH_LABEL.test(label(button)) || failures >= 3) return;
    if (Date.now() < pauseUntil || Date.now() < retryAt || Date.now() - stableAt < 800) return;
    if (enabled(button) && !popupOpen()) void setHigh(button);
  }

  function visibilityChanged() {
    clearInterval(interval);
    clearTimeout(scheduled);
    scheduled = undefined;
    if (document.hidden) {
      if (run) run.cancelled = true;
      return;
    }
    // A newly visible tab gets another chance after transient loading failures.
    key = '';
    interval = setInterval(tick, 1000);
    schedule();
  }

  document.addEventListener('pointerdown', interact, true);
  document.addEventListener('keydown', interact, true);
  document.addEventListener('visibilitychange', visibilityChanged);
  window[INSTANCE] = {
    stop() {
      stopped = true;
      if (run) run.cancelled = true;
      clearInterval(interval);
      clearTimeout(scheduled);
      observer.disconnect();
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
      document.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
  visibilityChanged();
})();
