# Hide Video Focus Outline

Removes the focus outline/ring on HTML5 `<video>` elements (and their direct wrappers) on all sites, including inside shadow DOM.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. [Click here to install](https://github.com/cyanyux/userscripts/raw/main/hide-video-focus-outline/hide-video-focus-outline.user.js)

## Configuration

Edit the flag near the top of the script:

- `HIDE_KEYBOARD_FOCUS = false` (default, accessible) — keeps the keyboard focus ring (`:focus-visible`); only hides it for pointer and programmatic focus.
- `HIDE_KEYBOARD_FOCUS = true` — also removes the ring for keyboard focus.

## How it works

- Injects an `outline: none !important` stylesheet at `document-start`
- Wraps `attachShadow` so open and closed shadow roots get the same style
- Deep-scans existing open shadow roots once on load (e.g. declarative shadow DOM)
- Splits the CSS into two blocks so the plain `<video>` rule survives engines that can't parse `:has()`
