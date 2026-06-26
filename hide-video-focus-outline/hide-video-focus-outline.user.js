// ==UserScript==
// @name         Hide Video Focus Outline
// @namespace    https://github.com/cyanyux/userscripts
// @version      1.0
// @description  Removes the focus/hover ring around the video player on X and Coursera — the outline on X's focusable overlay div, and the focus outline + light-blue hover border on Coursera. Finds the player surface by geometry (the element whose box coincides with the <video>) so it survives the sites' randomized class names, and applies/clears the fix reversibly so transient overlays and recycled nodes recover.
// @match        *://x.com/*
// @match        *://*.x.com/*
// @match        *://twitter.com/*
// @match        *://*.twitter.com/*
// @match        *://coursera.org/*
// @match        *://*.coursera.org/*
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
  // Also recolor a border on the player surface to transparent. Coursera draws
  // its hover ring as a border (transparent until :hover). We only change the
  // color (never the width), so this can't shift layout. false -> leave borders.
  const NEUTRALIZE_BORDER = true;

  // An element counts as "the video surface" only when its box and the <video>
  // box coincide closely. Tuned for the X overlay and Coursera wrapper, which
  // the video nearly fills; the thresholds exclude small controls and larger
  // containers that merely wrap the video plus other content.
  const COVER_VIDEO = 0.6; // candidate must cover >= 60% of the video's box
  const COVER_SELF = 0.75; // video must cover >= 75% of the candidate's box

  const DEBOUNCE_MS = 250; // coalesce re-scans triggered by DOM changes
  const ATTR = 'data-hide-video-outline';

  /* ----------------------------------------------------------------------
   * Cheap static fast-path: the <video> element's own focus outline. A single
   * document-start stylesheet covers every present/future video for free, so
   * the JS below only has to deal with the wrapper / overlay / border cases.
   * -------------------------------------------------------------------- */
  (function injectStyle() {
    const parent = document.head || document.documentElement;
    if (!parent || document.querySelector('style[' + ATTR + ']')) return;
    const style = document.createElement('style');
    style.setAttribute(ATTR, '');
    // `video:focus` covers both pointer and keyboard focus; avoid a selector
    // list with `:focus-visible`, which would drop the whole rule on engines
    // that can't parse it.
    style.textContent = 'video:focus{outline:none!important}';
    parent.appendChild(style);
  })();

  /* ----------------------------------------------------------------------
   * Geometry
   * -------------------------------------------------------------------- */
  function area(w, h) { return Math.max(0, w) * Math.max(0, h); }

  function overlapArea(a, b) {
    const x = Math.max(a.left, b.left);
    const y = Math.max(a.top, b.top);
    const r = Math.min(a.right, b.right);
    const btm = Math.min(a.bottom, b.bottom);
    return area(r - x, btm - y);
  }

  function coincides(rect, vr, va) {
    const fa = area(rect.width, rect.height);
    if (!fa) return false;
    const o = overlapArea(rect, vr);
    return o > 0 && o / va >= COVER_VIDEO && o / fa >= COVER_SELF;
  }

  /* ----------------------------------------------------------------------
   * Apply / restore — reversible. We set the ring properties inline with
   * !important (inline important is the only thing that reliably beats a site's
   * class-based :hover/:focus rule — a stylesheet rule could lose on
   * specificity). restore() just removes OUR declarations, reverting the
   * element to its own cascade, so a transient overlay that briefly coincided
   * (modal, poster) or an SPA-recycled node gets its styling back with no
   * snapshot to go stale. We touch outline and (optionally) border-color; the
   * two target players never draw the ring with box-shadow, and blanking
   * box-shadow would risk erasing a legitimate elevation shadow.
   * -------------------------------------------------------------------- */
  const PROPS = NEUTRALIZE_BORDER ? ['outline', 'border-color'] : ['outline'];
  const VALUE = { 'outline': 'none', 'border-color': 'transparent' };

  let marked = new Set(); // elements currently neutralised (bounded to live surfaces)

  function apply(el) {
    el.setAttribute(ATTR, '');
    for (const p of PROPS) el.style.setProperty(p, VALUE[p], 'important');
  }

  function restore(el) {
    if (el.removeAttribute) el.removeAttribute(ATTR);
    for (const p of PROPS) if (el.style) el.style.removeProperty(p);
  }

  /* ----------------------------------------------------------------------
   * Collect the surfaces for one video: the video, wrappers whose box
   * coincides with it, and any element stacked over its (visible) centre that
   * coincides — that last part is how X's focusable sibling overlay is caught.
   * -------------------------------------------------------------------- */
  function collectSurfaces(video, into) {
    // Observe BEFORE the zero-area guard, so a 0x0 / not-yet-laid-out video is
    // still watched and re-marks us via ResizeObserver once it gets a size.
    observeSize(video);
    const vr = video.getBoundingClientRect();
    const va = area(vr.width, vr.height);
    if (!va) return; // not laid out / hidden yet — ResizeObserver re-runs us when it appears
    into.add(video);

    let el = video.parentElement, depth = 0;
    while (el && el !== document.documentElement && depth < 12) {
      if (coincides(el.getBoundingClientRect(), vr, va)) into.add(el);
      el = el.parentElement; depth++;
    }

    // Sample the centre of the video's VISIBLE area, so an overlay is still
    // found when the player is partly scrolled out of the viewport.
    const L = Math.max(vr.left, 0), T = Math.max(vr.top, 0);
    const R = Math.min(vr.right, window.innerWidth), B = Math.min(vr.bottom, window.innerHeight);
    if (R > L && B > T) {
      let stack = [];
      try { stack = document.elementsFromPoint((L + R) / 2, (T + B) / 2) || []; } catch (_) { /* ignore */ }
      for (let i = 0; i < stack.length; i++) {
        const e = stack[i];
        // skip the video and coinciding ancestors already added by the walk above
        if (into.has(e) || e === document.documentElement || e === document.body) continue;
        if (coincides(e.getBoundingClientRect(), vr, va)) into.add(e);
      }
    }
  }

  /* Rebuild the desired set and diff it against what's currently marked. */
  function markAll() {
    const desired = new Set();
    const vids = document.getElementsByTagName('video');
    for (let i = 0; i < vids.length; i++) {
      try { collectSurfaces(vids[i], desired); } catch (_) { /* never break the page */ }
    }
    for (const el of marked) if (!desired.has(el)) restore(el);
    for (const el of desired) apply(el); // re-assert each pass in case the site overwrote it
    marked = desired;
  }

  /* ----------------------------------------------------------------------
   * Triggers — kept minimal so steady state costs nothing:
   *   - ResizeObserver on each video: fires only on a real size change (also
   *     catches a 0x0 video becoming visible). Drives most re-marks.
   *   - MutationObserver gated on the video COUNT changing: ignores the
   *     constant churn of e.g. the X timeline; only reacts when a player is
   *     added/removed. Coalesced through a debounce.
   *   - focusin: catches X's overlay the instant it's focused, before paint.
   * No pointer/scroll handlers and no per-frame work.
   * -------------------------------------------------------------------- */
  let timer = null;
  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; markAll(); }, DEBOUNCE_MS);
  }

  const observedSizes = typeof ResizeObserver === 'function' ? new WeakSet() : null;
  const ro = observedSizes ? new ResizeObserver(schedule) : null;
  function observeSize(video) {
    if (ro && !observedSizes.has(video)) {
      observedSizes.add(video);
      try { ro.observe(video); } catch (_) { /* ignore */ }
    }
  }

  if (typeof MutationObserver === 'function') {
    let count = -1;
    const check = () => {
      const n = document.getElementsByTagName('video').length;
      if (n !== count) { count = n; schedule(); }
    };
    new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
  }

  // focusin: catch X's overlay the instant it's focused, before its ring can
  // paint. Cheap-gated so it isn't a hot path: skip if the focused element is
  // already neutralised, and only do the full re-scan when it actually overlaps
  // a video (a reply box, menu item, etc. cost just one getBoundingClientRect).
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1 || (t.hasAttribute && t.hasAttribute(ATTR))) return;
    const tr = t.getBoundingClientRect();
    if (!area(tr.width, tr.height)) return;
    const vids = document.getElementsByTagName('video');
    for (let i = 0; i < vids.length; i++) {
      if (overlapArea(tr, vids[i].getBoundingClientRect()) > 0) { markAll(); return; }
    }
  }, true);

  // Initial passes (the player loads asynchronously on both sites).
  markAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markAll, { once: true });
  }
  [1000, 2500].forEach((t) => setTimeout(markAll, t));
})();
