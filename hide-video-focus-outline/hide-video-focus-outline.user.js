// ==UserScript==
// @name         Hide Video Focus Outline
// @namespace    https://github.com/cyanyux/userscripts
// @version      2.0
// @description  Removes the focus outline/ring on HTML5 <video> elements (and their direct wrappers) on all sites, including inside shadow DOM.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://github.com/cyanyux/userscripts/raw/main/hide-video-focus-outline/hide-video-focus-outline.user.js
// @updateURL    https://github.com/cyanyux/userscripts/raw/main/hide-video-focus-outline/hide-video-focus-outline.user.js
// ==/UserScript==
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
   * Config
   * -------------------------------------------------------------------- */
  // false -> keep the keyboard focus ring; only hide it for pointer /
  //          programmatic focus (accessible default).
  // true  -> also remove the ring for KEYBOARD focus (matches the original
  //          author's intent, but hides an indicator keyboard users rely on).
  const HIDE_KEYBOARD_FOCUS = false;

  /* ----------------------------------------------------------------------
   * Stylesheet
   * Two separate rule blocks on purpose: if an old engine can't parse
   * :has(), only the second block is dropped and the plain <video> rule
   * still applies.
   * -------------------------------------------------------------------- */
  const KILL = 'outline: none !important;';
  const css = HIDE_KEYBOARD_FOCUS
    ? `video:focus, video:focus-visible, video:focus-within { ${KILL} }\n` +
      `:has(> video):focus-within { ${KILL} }`
    : `video:focus:not(:focus-visible) { ${KILL} }\n` +
      `:has(> video):focus-within:not(:has(:focus-visible)) { ${KILL} }`;

  const MARK = 'data-hide-video-outline';

  /* Inject the stylesheet into a Document or ShadowRoot exactly once. */
  function inject(root) {
    if (!root || root.querySelector(`style[${MARK}]`)) return;
    const parent = root.head || root.body || root.documentElement || root;
    if (!parent || !parent.appendChild) return;
    const style = (root.ownerDocument || document).createElement('style');
    style.setAttribute(MARK, '');
    style.textContent = css;
    parent.appendChild(style);
  }

  /* 1. Main document. documentElement exists at document-start, so the style
   *    lands immediately and applies to every current/future <video> in the
   *    light DOM — no observer needed for the common case. */
  inject(document);

  /* 2. Shadow DOM: intercept attachShadow so every root the page creates —
   *    open OR closed, nested, now or later — gets the stylesheet. This needs
   *    page-world execution, which @grant none gives us. Wrapper is fully
   *    transparent (preserves this/args/return) and guards against double-wrap. */
  const native = Element.prototype.attachShadow;
  if (typeof native === 'function' && !native.__hvfo) {
    const wrapped = function (...args) {
      const sr = native.apply(this, args);
      try { inject(sr); } catch (_) { /* never break the page */ }
      return sr;
    };
    wrapped.__hvfo = true;
    try { Element.prototype.attachShadow = wrapped; } catch (_) { /* frozen proto */ }
  }

  /* 3. Catch OPEN shadow roots that exist before the hook can see them —
   *    e.g. declarative shadow DOM created by the HTML parser. One-time deep
   *    scan that recurses into nested open roots. (Closed roots are not
   *    reachable here; only the hook in step 2 can cover those.) */
  function scanOpenRoots(node) {
    const all = node.querySelectorAll && node.querySelectorAll('*');
    if (!all) return;
    for (const el of all) {
      if (el.shadowRoot) {
        inject(el.shadowRoot);
        scanOpenRoots(el.shadowRoot);
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scanOpenRoots(document), { once: true });
  } else {
    scanOpenRoots(document);
  }
})();
