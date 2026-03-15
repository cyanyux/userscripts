// ==UserScript==
// @name         Hide AI disclaimers
// @namespace    https://chatgpt.com/
// @version      1.5.8
// @description  Hide disclaimer containers on ChatGPT, Gemini, and Claude
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://claude.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const STYLE_ID = 'hide-ai-disclaimers-style';
  const SOFT_GAP = '8px';

  const CHATGPT_CSS = `
    [class~="[view-transition-name:var(--vt-disclaimer)]"] {
      display: none !important;
    }
  `;

  const SOFT_HIDE = `
    display: block !important;
    visibility: hidden !important;
    pointer-events: none !important;
    box-sizing: border-box !important;
    height: ${SOFT_GAP} !important;
    min-height: ${SOFT_GAP} !important;
    max-height: ${SOFT_GAP} !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
  `;

  /* Claude's disclaimer lives inside a sticky container with
     transparent background. visibility:hidden kills the bg too,
     letting scrolling content bleed through the 8px gap.
     Hide text with font-size/color instead, keeping the bg. */
  const SOFT_HIDE_OPAQUE = `
    display: block !important;
    pointer-events: none !important;
    box-sizing: border-box !important;
    height: ${SOFT_GAP} !important;
    min-height: ${SOFT_GAP} !important;
    max-height: ${SOFT_GAP} !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
  `;

  const cssByHost = {
    'chatgpt.com': CHATGPT_CSS,
    'chat.openai.com': CHATGPT_CSS,
    'gemini.google.com': `
      hallucination-disclaimer {
        ${SOFT_HIDE}
      }
    `,
    'claude.ai': `
      [role="note"][data-disclaimer="true"] {
        ${SOFT_HIDE_OPAQUE}
      }
    `
  };

  const css = cssByHost[location.hostname];
  if (!css) return;
  if (document.getElementById(STYLE_ID)) return;

  const parent = document.head || document.documentElement;
  if (!parent) {
    console.warn('[Hide AI disclaimers] Injection failed: no head/documentElement available.');
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  parent.appendChild(style);
})();
