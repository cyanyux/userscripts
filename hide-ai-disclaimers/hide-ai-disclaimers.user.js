// ==UserScript==
// @name         Hide AI disclaimers
// @namespace    https://chatgpt.com/
// @version      1.5.4
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

  const cssByHost = {
    'chatgpt.com': `
      [class~="[view-transition-name:var(--vt-disclaimer)]"] {
        display: none !important;
      }
    `,
    'chat.openai.com': `
      [class~="[view-transition-name:var(--vt-disclaimer)]"] {
        display: none !important;
      }
    `,
    'gemini.google.com': `
      hallucination-disclaimer,
      hallucination-disclaimer [data-testid="disclaimer"] {
        display: none !important;
      }
    `,
    'claude.ai': `
      [role="note"][data-disclaimer="true"] {
        display: none !important;
      }
    `
  };

  const css = cssByHost[location.hostname];
  if (!css) return;

  const parent = document.head || document.documentElement;
  if (!parent) {
    console.warn('[Hide AI disclaimers] Injection failed: no head/documentElement available.');
    return;
  }

  const style = document.createElement('style');
  style.id = 'hide-ai-disclaimers-style';
  style.textContent = css;
  parent.appendChild(style);
})();
