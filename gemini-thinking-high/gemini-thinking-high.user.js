// ==UserScript==
// @name         Gemini — Always High Thinking
// @namespace    local.gemini.thinking-high
// @version      1.4.4
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
  const POPUPS = '[role="menu"], [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';
  const THINKING = /^(Thinking level|思考程度|思考層級|思考等级|思考级别)$/i;
  const HIGH = /^(High|高|高等)(?:\s|$)/i;
  const HIGH_LABEL = /(?:^|\s)(High|高|高等)\s*$/i;
  const INSTANCE = '__geminiAlwaysHighThinking';
  const AUTO_SWITCH = 'data-gemini-high-auto-switch';
  const MENU_MASK = 'data-gemini-high-menu-mask';
  const POINTER_FOCUS = 'data-gemini-high-pointer-focus';
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
  let keyboardInput = false;
  let pointerStyle;
  const focusMarkers = new Set();
  const discoveryDeadline = Date.now() + 10_000;
  const text = element => (element?.textContent || '').trim().replace(/\s+/g, ' ');
  const label = element => element?.getAttribute('aria-label') || text(element);
  const visible = element => !!element?.isConnected && element.checkVisibility({
    checkVisibilityCSS: true, checkOpacity: true,
  });
  const enabled = element => visible(element) && !element.matches(':disabled, [aria-disabled="true"]');
  const controlledMenu = trigger => {
    const id = trigger.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };
  const menuItems = menu => [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')]
    .filter(item => item.closest('[role="menu"]') === menu && enabled(item));
  const thinkingOption = item => ['menuitem', 'menuitemradio'].includes(item.getAttribute('role'))
    && THINKING.test(text(item));
  const highOption = item => item.getAttribute('role') === 'menuitemradio' && HIGH.test(text(item));
  const ownedOption = (item, trigger, menu, matches) => enabled(trigger) && enabled(item)
    && visible(menu) && controlledMenu(trigger) === menu
    && item.closest('[role="menu"]') === menu && matches(item);
  const popupOpen = () => [...document.querySelectorAll(POPUPS)]
    .some(visible);
  const observer = new MutationObserver(() => {
    if (stopped || document.hidden) return;
    if (!keyboardInput && pointerStyle) markPointerFocus();
    schedule();
  });
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
    keyboardInput = event.type === 'keydown';
    if (keyboardInput) clearPointerFocus();
    else if (button && (button.contains(event.target)
      || [...focusMarkers].some(element => element.contains(event.target)))) markPointerFocus();
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

  function clearPointerFocus() {
    pointerStyle?.remove();
    pointerStyle = undefined;
    for (const element of focusMarkers) element.removeAttribute(POINTER_FOCUS);
    focusMarkers.clear();
  }

  function markPointerFocus() {
    if (stopped || document.hidden || !button?.isConnected || keyboardInput) return;
    for (const element of focusMarkers) {
      if (!element.isConnected) {
        element.removeAttribute(POINTER_FOCUS);
        focusMarkers.delete(element);
      }
    }
    if (!pointerStyle) {
      pointerStyle = document.createElement('style');
      pointerStyle.textContent = '[' + POINTER_FOCUS + ']:focus-visible, [' + POINTER_FOCUS + ']'
        + ' [role^="menuitem"]:focus-visible { outline: none !important; box-shadow: none !important; }'
        // Material draws a separate border even when the button has no outline.
        + '[' + POINTER_FOCUS + '] .mat-focus-indicator::before, [' + POINTER_FOCUS + ']'
        + ' .mat-mdc-focus-indicator::before { opacity: 0 !important; }';
      document.documentElement.append(pointerStyle);
    }
    const menu = controlledMenu(button);
    for (const element of [button, menu, ...(menu?.querySelectorAll('[role="menu"]') || [])]) {
      if (element && !focusMarkers.has(element)) {
        focusMarkers.add(element);
        element.setAttribute(POINTER_FOCUS, '');
      }
    }
  }

  function unmute(task) {
    task.style?.remove();
    for (const [surface, previous] of task.surfaces) {
      if (previous === null) surface.removeAttribute(MENU_MASK);
      else surface.setAttribute(MENU_MASK, previous);
    }
    task.surfaces.clear();
    if (task.muted) {
      if (task.previousMarker === null) task.button.removeAttribute(AUTO_SWITCH);
      else task.button.setAttribute(AUTO_SWITCH, task.previousMarker);
      task.muted = false;
    }
  }

  async function setHigh(target) {
    const task = { button: target, url: location.href, cancelled: false, userOwnsMenu: false, surfaces: new Map() };
    run = task;
    const focus = document.activeElement;
    const valid = () => !stopped && !task.cancelled && !document.hidden
      && location.href === task.url && target.isConnected && target === button;
    function deferToPopup() {
      const blocked = [...document.querySelectorAll(POPUPS)].some(popup =>
        popup !== task.menu && popup !== task.submenu && visible(popup));
      if (blocked) {
        task.blockedByPopup = true;
        task.cancelled = true;
        clearPointerFocus();
      }
      return blocked;
    }
    const canContinue = () => valid() && !deferToPopup();
    const maskedMenus = new Set();
    function maskMenu(trigger) {
      const menu = controlledMenu(trigger);
      // Mark actual surfaces, not only :has(menu): an empty closing shell can
      // keep painting after its content has been hidden, moved, or detached.
      for (let surface = menu; surface; surface = surface.parentElement?.closest('.popover-menu, .submenu-container, .cdk-overlay-pane')) {
        if (!task.surfaces.has(surface)) {
          task.surfaces.set(surface, surface.getAttribute(MENU_MASK));
          surface.setAttribute(MENU_MASK, '');
        }
      }
      const id = trigger.getAttribute('aria-controls');
      if (!task.maskInitialized || (id && !maskedMenus.has(id))) {
        task.maskInitialized = true;
        if (id) maskedMenus.add(id);
        const menus = [...maskedMenus].map(value => '#' + CSS.escape(value) + '[role="menu"]');
        const boxes = ['[' + MENU_MASK + ']', ...menus.flatMap(menu => [menu, '.popover-menu:has(' + menu + ')',
          '.submenu-container:has(' + menu + ')', '.cdk-overlay-pane:has(' + menu + ')'])];
        task.style.textContent = boxes.join(',')
          + ' { clip-path: inset(50%) !important; pointer-events: none !important; animation: none !important; transition: none !important; }'
          + [...menus, ...menus.map(menu => menu + ' *'), '[' + AUTO_SWITCH + ']', '[' + AUTO_SWITCH + '] *'].join(',')
          + ' { animation: none !important; transition: none !important; }'
          + '[' + AUTO_SWITCH + '] .dropdown-icon { transform: none !important; }'
          + '[' + AUTO_SWITCH + '] { outline: none !important; box-shadow: none !important; background-color: '
          + task.background + ' !important; }'
          + '[' + AUTO_SWITCH + '] .mdc-button__ripple::before, [' + AUTO_SWITCH + '] .mdc-button__ripple::after,'
          + '[' + AUTO_SWITCH + '] .mat-ripple, [' + AUTO_SWITCH + '] .mat-mdc-button-ripple,'
          + '[' + AUTO_SWITCH + '] .mat-focus-indicator::before,'
          + '[' + AUTO_SWITCH + '] .mat-mdc-focus-indicator::before { opacity: 0 !important; }'
          + '[' + AUTO_SWITCH + '] .mdc-button__ripple::before { opacity: ' + task.rippleOpacity + ' !important; }';
      }
      return menu;
    }
    async function waitFor(find, timeout = 3000) {
      if (!valid()) return null;
      const ready = find();
      if (!canContinue()) return null;
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
            if (!canContinue()) return finish(null);
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
      markPointerFocus();
      task.background = getComputedStyle(target).backgroundColor;
      const ripple = target.querySelector('.mdc-button__ripple');
      task.rippleOpacity = ripple ? getComputedStyle(ripple, '::before').opacity : '0';
      // Clip instead of hiding with display/visibility/opacity, so menu readiness
      // checks still work. Only menus referenced by our triggers are affected.
      task.style = document.createElement('style');
      document.documentElement.append(task.style);
      task.previousMarker = target.getAttribute(AUTO_SWITCH);
      task.muted = true;
      target.setAttribute(AUTO_SWITCH, '');
      maskMenu(target);
      target.click();
      const thinking = await waitFor(() => {
        task.menu = maskMenu(target);
        if (task.menu) markPointerFocus();
        const option = visible(task.menu) && menuItems(task.menu).find(thinkingOption);
        if (option) task.submenu = controlledMenu(option);
        return option;
      });
      if (!thinking) return;
      maskMenu(thinking);
      // A successful probe can become stale before the awaited continuation.
      if (!canContinue() || !ownedOption(thinking, target, task.menu, thinkingOption)) return;
      thinking.click();
      const high = await waitFor(() => {
        task.submenu = maskMenu(thinking);
        return visible(task.submenu) && menuItems(task.submenu).find(highOption);
      });
      if (!high || !canContinue()
        || !ownedOption(thinking, target, task.menu, thinkingOption)
        || !ownedOption(high, thinking, task.submenu, highOption)) return;
      if (high.getAttribute('aria-checked') !== 'true') high.click();
      const confirmed = await waitFor(() => HIGH_LABEL.test(label(target)));
      if (!canContinue()) return;
      if (!confirmed && valid()) console.warn('[Gemini Always High] High was not confirmed.');
    } catch (error) {
      console.warn('[Gemini Always High]', error);
    } finally {
      try {
        // A popup may also arrive after timeout/cancellation, before cleanup.
        // Leave background controls and the popup's focus under app/user control.
        deferToPopup();
        // A timeout is retryable; it never permanently marks a model unsupported.
        if (valid()) {
          failures = HIGH_LABEL.test(label(target)) ? 0 : failures + 1;
          retryAt = Date.now() + 5000;
        }
        const ownsMenu = task.menu && controlledMenu(target) === task.menu;
        if (!task.userOwnsMenu && !task.blockedByPopup && enabled(target) && ownsMenu && visible(task.menu)
          && target.getAttribute('aria-expanded') === 'true') target.click();
        // Keep closing animations clipped too, without delaying the High setting.
        if (valid() && (ownsMenu || target.getAttribute('aria-expanded') === 'false') && !task.userOwnsMenu) {
          await waitFor(() => [...task.surfaces.keys()].every(surface => !visible(surface)), 300);
        }
        const active = document.activeElement;
        if (valid() && ownsMenu && (active === target || task.menu?.contains(active) || task.submenu?.contains(active))) {
          if (focus?.isConnected && focus !== document.body && focus !== document.documentElement) {
            focus.focus({ preventScroll: true });
          } else {
            // Startup had no focused control: do not leave focus on our picker.
            active?.blur();
          }
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
      clearPointerFocus();
      button = current;
      key = '';
      if (button) observer.observe(button, {
        attributes: true, attributeFilter: ['aria-label', 'aria-disabled', 'disabled', 'aria-controls', 'aria-expanded'],
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
    version: '1.4.4',
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
      clearPointerFocus();
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
      document.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
  visibilityChanged();
})();
