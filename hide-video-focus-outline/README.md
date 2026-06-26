# Hide Video Focus Outline

Removes the focus/hover ring around the video player on **X** and **Coursera** (only those two sites).

Each site draws the ring differently, and neither is reachable with a plain `video:focus { outline: none }` rule:

- **X / Twitter** puts the ring (an `outline`) on a focusable **overlay `<div>` that is a *sibling* of the `<video>`**, not the video or any ancestor of it. It appears after a keyboard interaction (e.g. pressing <kbd>Space</kbd>).
- **Coursera** draws a focus `outline` on the video and its wrapper, **and** a separate light‑blue ring on hover that is actually a `border` (transparent until `:hover`), not an outline.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. [Click here to install](https://github.com/cyanyux/userscripts/raw/main/hide-video-focus-outline/hide-video-focus-outline.user.js)

## How it works

It finds the **player surface by geometry** rather than by selector (both sites use randomized class names, so selectors would be brittle):

- A tiny `document-start` stylesheet (`video:focus { outline: none !important }`) handles the `<video>` element's own outline for free.
- For each `<video>`, the script then neutralizes the elements whose box **coincides** with it — the video, any wrapper it nearly fills, and any element stacked over its (visible) centre (`elementsFromPoint`, which is how X's sibling overlay is caught). On each it sets `outline: none` and (by default) recolors any `border` to transparent — color only, so the layout never shifts. These go on inline with `!important`, the only thing that reliably beats the sites' class‑based `:hover`/`:focus` rules. Two coverage thresholds keep small controls and oversized containers out.
- The fix is **reversible**: `restore()` removes just our own inline declarations when an element stops being the player surface, reverting it to its own cascade — so a transient overlay (modal, poster) or an SPA‑recycled node gets its styling back.

It stays cheap at runtime: a `ResizeObserver` re‑marks only when the player actually resizes (which also catches a `0×0` video becoming visible); a `MutationObserver` is gated on the **video count** changing, so the constant churn of the X timeline is ignored; and a `focusin` handler catches X's overlay the instant it's focused. There are no pointer/scroll handlers and no per‑frame work.

## Configuration

Flags near the top of the script:

- `NEUTRALIZE_BORDER` (default `true`) — also recolor a hover/focus border on the player surface to transparent (the Coursera case). Set to `false` to leave borders alone.
- `COVER_VIDEO` / `COVER_SELF` — overlap thresholds tuned for the X overlay and Coursera wrapper; loosen to catch a ring on a box noticeably larger than the `<video>`, tighten if it touches something it shouldn't.

To run on more sites, add `@match` lines in the metadata block.
