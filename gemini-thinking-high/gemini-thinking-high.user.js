// ==UserScript==
// @name         Gemini — Fixed Thinking
// @namespace    local.gemini.thinking-high
// @version      1.6.0
// @description  Remember the thinking level for new chats and let Gemini restore existing conversations.
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
  const RADIO_ITEM = '[role="menuitemradio"]';
  const THINKING = /^(Thinking level|思考程度|思考層級|思考等级|思考级别)$/i;
  const LEVELS = [
    ['Low', 'Low|低等|低度|低'],
    ['Medium', 'Medium|中等|中度|中'],
    ['High', 'High|高等|高度|高'],
  ].map(([name, labels]) => ({
    name,
    option: new RegExp('^(?:' + labels + ')(?:\\s|$)', 'i'),
    suffix: new RegExp('(?:^|\\s)(?:' + labels + ')\\s*$', 'i'),
  }));
  const PREFERENCE_KEY = 'gemini-fixed-thinking:level';
  const isDraftPage = () => /^(?:\/(?:u\/\d+\/)?app\/?|\/)$/.test(location.pathname);
  const INSTANCE = '__geminiAlwaysHighThinking';
  const AUTO_SWITCH = 'data-gemini-high-auto-switch';
  const MENU_MASK = 'data-gemini-high-menu-mask';
  const MENU_WRAPPERS = '.popover-menu, .submenu-container, .cdk-overlay-pane, .cdk-overlay-popover';
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
  let draftPage = isDraftPage();
  let tabLevel = readLevel('sessionStorage');
  let desiredLevel = draftPage
    ? tabLevel || readLevel('localStorage') || LEVELS[1]
    : undefined;
  let keyboardInput = false;
  let pointerStyle;
  const focusMarkers = new Set();
  const discoveryDeadline = Date.now() + 10_000;
  const text = element => (element?.textContent || '').trim().replace(/\s+/g, ' ');
  const label = element => element?.getAttribute('aria-label') || text(element);
  // Gemini omits the level from its picker label when Low is selected.
  const pickerLevel = value => LEVELS.find(level => level.suffix.test(value)) || LEVELS[0];
  const visible = element => !!element?.isConnected && element.checkVisibility({
    checkVisibilityCSS: true, checkOpacity: true,
  });
  const enabled = element => visible(element) && !element.matches(':disabled, [aria-disabled="true"]');
  const controlledMenu = trigger => {
    const id = trigger.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };
  const menuItems = menu => [...menu.querySelectorAll('[role="menuitem"], ' + RADIO_ITEM)]
    .filter(item => item.closest('[role="menu"]') === menu && enabled(item));
  const thinkingOption = item => ['menuitem', 'menuitemradio'].includes(item.getAttribute('role'))
    && THINKING.test(text(item));
  const ownedOption = (item, trigger, menu, matches) => enabled(trigger) && enabled(item)
    && visible(menu) && controlledMenu(trigger) === menu
    && item.closest('[role="menu"]') === menu && matches(item);
  const popupOpen = () => [...document.querySelectorAll(POPUPS)]
    .some(visible);
  const observer = new MutationObserver(records => {
    if (stopped || document.hidden) return;
    // A picker that becomes enabled again may have finished loading.
    if (!run && failures && !button.matches(':disabled, [aria-disabled="true"]')
      && records.some(record => record.target === button && (
        (record.attributeName === 'disabled' && record.oldValue !== null)
        || (record.attributeName === 'aria-disabled' && record.oldValue === 'true')
      ))) {
      failures = 0;
      retryAt = 0;
    }
    if (!keyboardInput && pointerStyle) markPointerFocus();
    schedule();
  });
  // Startup only: stop observing the page as soon as the picker exists, or
  // after ten seconds on pages without one (for example the sign-in page).
  const discovery = new MutationObserver(() => schedule());

  function readLevel(storage) {
    try {
      const name = window[storage].getItem(PREFERENCE_KEY);
      return LEVELS.find(level => level.name === name);
    } catch {
      // Storage can be unavailable. The current page still handles manual choices.
      return undefined;
    }
  }

  function writeLevel(storage, level) {
    try {
      window[storage].setItem(PREFERENCE_KEY, level.name);
    } catch {
      // Keep the in-memory choice if browser storage is blocked.
    }
  }

  function rememberDraft(level) {
    if (tabLevel === level) return;
    tabLevel = level;
    writeLevel('sessionStorage', level);
  }

  function syncDraftPage() {
    const isDraft = isDraftPage();
    if (isDraft === draftPage) return;
    draftPage = isDraft;
    // In-tab New chat inherits its setting from Gemini. Take that value from
    // the picker as it settles and save it for a future reload of this tab.
    desiredLevel = undefined;
    key = '';
  }

  function schedule() {
    if (stopped || document.hidden || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      tick();
    });
  }

  function manualThinkingOption(target) {
    const option = target.closest?.(RADIO_ITEM);
    const submenu = option?.closest('[role="menu"]');
    if (!submenu) return null;
    const picker = button?.isConnected ? button : document.querySelector(PICKER);
    const menu = picker && controlledMenu(picker);
    if (!menu || menu === submenu || !enabled(option)) return null;
    return menuItems(menu).some(item => thinkingOption(item) && controlledMenu(item) === submenu) ? option : null;
  }

  function interact(event) {
    if (!event.isTrusted) return;
    let thinkingChoice;
    if (event.type === 'click') {
      // Capture the actual choice before Gemini closes the menu. Native key
      // activation also produces a trusted click; our own .click() does not.
      thinkingChoice = manualThinkingOption(event.target);
      if (!thinkingChoice) return;
      const chosen = LEVELS.find(level => level.option.test(text(thinkingChoice)));
      if (!chosen) return;
      syncDraftPage();
      writeLevel('localStorage', chosen);
      if (draftPage) {
        desiredLevel = chosen;
        rememberDraft(chosen);
      }
      key = '';
    } else {
      keyboardInput = event.type === 'keydown';
      if (keyboardInput) clearPointerFocus();
      else if (button && (button.contains(event.target)
        || [...focusMarkers].some(element => element.contains(event.target)))) markPointerFocus();
    }
    pauseUntil = Date.now() + 1500;
    if (run) {
      unmute(run);
      // Do not close a menu the user has started interacting with.
      run.userOwnsMenu = Boolean(thinkingChoice) || run.button.contains(event.target)
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
        + ' .mat-mdc-focus-indicator::before { opacity: 0 !important; }'
        // A delayed programmatic focus can apply a fill after the switch mask is gone.
        + PICKER + '[' + POINTER_FOCUS + '].cdk-program-focused:not(:hover)'
        + ' > .mdc-button__ripple::before { opacity: 0 !important; transition: none !important; }';
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

  async function setLevel(target, level) {
    const task = { button: target, url: location.href, cancelled: false, userOwnsMenu: false, surfaces: new Map() };
    run = task;
    const focus = document.activeElement;
    let retrySoon = false;
    let confirmed = false;
    const selected = () => pickerLevel(label(target)) === level;
    const matchesLevel = item => item.getAttribute('role') === 'menuitemradio' && level.option.test(text(item));
    const valid = () => !stopped && !task.cancelled && !document.hidden && isDraftPage()
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
      for (let surface = menu; surface; surface = surface.parentElement?.closest(MENU_WRAPPERS)) {
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
        const picker = '[' + AUTO_SWITCH + ']';
        const boxes = ['[' + MENU_MASK + ']', ...menus];
        // Gemini mounts the popover next to its own trigger, before its menu is ready.
        boxes.push('.pill-ui-logo-container > ' + picker + ' + .cdk-overlay-popover');
        if (menus.length) boxes.push(':is(' + MENU_WRAPPERS + '):has(' + menus.join(',') + ')');
        task.style.textContent = boxes.join(',')
          + ' { clip-path: inset(50%) !important; pointer-events: none !important; animation: none !important; transition: none !important; }'
          + [...menus, ...menus.map(menu => menu + ' *'), picker, picker + ' *',
            picker + '::before', picker + '::after', picker + ' *::before', picker + ' *::after'].join(',')
          + ' { animation: none !important; transition: none !important; }'
          + picker + ' .dropdown-icon { transform: none !important; }'
          + picker + ' { outline: none !important; box-shadow: none !important; background-color: '
          + task.background + ' !important; background-image: ' + task.backgroundImage + ' !important; }'
          + [' .mdc-button__ripple::after', ' .mat-ripple', ' .mat-mdc-button-ripple',
            ' .mat-focus-indicator::before', ' .mat-mdc-focus-indicator::before'].map(suffix => picker + suffix).join(',')
          + ' { opacity: 0 !important; }'
          + picker + ' .mdc-button__ripple::before { opacity: ' + task.rippleOpacity + ' !important; }';
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
      // All clicks are limited to the picker, its Thinking level trigger, and the desired level.
      if (!valid() || !enabled(target) || popupOpen()) return;
      markPointerFocus();
      const pickerStyle = getComputedStyle(target);
      task.background = pickerStyle.backgroundColor;
      task.backgroundImage = pickerStyle.backgroundImage;
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
      if (failures === 0 && target.getAttribute('aria-expanded') === 'false') {
        // Gemini can render the picker before its click handler is ready.
        const opened = await waitFor(() => {
          task.menu = maskMenu(target);
          return target.getAttribute('aria-expanded') !== 'false' || visible(task.menu);
        }, 600);
        if (!opened || !canContinue()) {
          retrySoon = !opened;
          return;
        }
      }
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
      const option = await waitFor(() => {
        task.submenu = maskMenu(thinking);
        return visible(task.submenu) && menuItems(task.submenu).find(matchesLevel);
      });
      if (!option || !canContinue()
        || !ownedOption(thinking, target, task.menu, thinkingOption)
        || !ownedOption(option, thinking, task.submenu, matchesLevel)) return;
      if (option.getAttribute('aria-checked') !== 'true') option.click();
      confirmed = await waitFor(selected);
      if (!canContinue()) return;
      if (!confirmed && valid()) console.warn('[Gemini Thinking] ' + level.name + ' was not confirmed.');
    } catch (error) {
      console.warn('[Gemini Thinking]', error);
    } finally {
      try {
        // A popup may also arrive after timeout/cancellation, before cleanup.
        // Leave background controls and the popup's focus under app/user control.
        deferToPopup();
        const ownsMenu = task.menu && controlledMenu(target) === task.menu;
        if (location.href === task.url && !task.userOwnsMenu && !task.blockedByPopup && enabled(target) && ownsMenu && visible(task.menu)
          && target.getAttribute('aria-expanded') === 'true') target.click();
        // Closing the menu and clearing the pressed background can happen in different frames.
        if (valid() && (ownsMenu || target.getAttribute('aria-expanded') !== 'true') && !task.userOwnsMenu) {
          await waitFor(() => !target.classList.contains('pressed')
            && [...task.surfaces.keys()].every(surface => !visible(surface)), 300);
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
        console.warn('[Gemini Thinking] Menu cleanup failed:', error);
      } finally {
        try { unmute(task); }
        finally {
          if (valid()) {
            // Check after closing: startup can overwrite the just-confirmed level.
            const applied = selected();
            const quickRetry = failures === 0 && (retrySoon || confirmed);
            failures = applied ? 0 : failures + 1;
            retryAt = applied || quickRetry ? 0 : Date.now() + 5000;
          }
          run = undefined;
          schedule();
        }
      }
    }
  }

  function tick() {
    if (stopped || document.hidden) return;
    syncDraftPage();
    const current = draftPage ? (button?.isConnected ? button : document.querySelector(PICKER)) : undefined;
    if (!draftPage || current || Date.now() >= discoveryDeadline) discovery.disconnect();
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
        attributes: true, attributeOldValue: true,
        attributeFilter: ['aria-label', 'aria-disabled', 'disabled', 'aria-controls', 'aria-expanded'],
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
    const currentLabel = label(button);
    if (!currentLabel) return;
    const currentLevel = pickerLevel(currentLabel);
    rememberDraft(desiredLevel || currentLevel);
    // No layout reads or menu scans when the picker already has its desired level.
    if (!desiredLevel || currentLevel === desiredLevel) {
      key = '';
      return;
    }
    const nextKey = location.href + '\n' + currentLabel;
    if (nextKey !== key) {
      key = nextKey;
      failures = 0;
      retryAt = 0;
    }
    if (failures >= 3 || Date.now() < pauseUntil || Date.now() < retryAt) return;
    if (enabled(button) && !popupOpen()) void setLevel(button, desiredLevel);
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
    if (isDraftPage() && !button && Date.now() < discoveryDeadline) {
      discovery.observe(document, { childList: true, subtree: true });
    }
    interval = setInterval(tick, 1000);
    schedule();
  }

  document.addEventListener('pointerdown', interact, true);
  document.addEventListener('keydown', interact, true);
  document.addEventListener('click', interact, true);
  document.addEventListener('visibilitychange', visibilityChanged);
  window.navigation?.addEventListener('currententrychange', schedule);
  window[INSTANCE] = {
    version: '1.6.0',
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
      document.removeEventListener('click', interact, true);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.navigation?.removeEventListener('currententrychange', schedule);
    },
  };
  visibilityChanged();
})();
