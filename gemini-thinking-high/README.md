# Gemini — Always High Thinking

Automatically select **Thinking level → High**, while leaving Gemini's remembered model unchanged.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Edge.
2. [Click here to install](https://github.com/cyanyux/userscripts/raw/main/gemini-thinking-high/gemini-thinking-high.user.js).
3. Reload Gemini. The script includes update/download URLs for future updates.

## Behavior

- Reapplies High after reloads, SPA navigation, model changes, and same-URL thinking-level resets.
- Never selects a model, submits a prompt, calls private APIs, or sends network requests.
- Manually selecting Low or Medium will be followed by an automatic switch back to High. Disable this script when you want a different level.
- Defers while typing, while another menu/dialog is open, and while the tab is hidden. The picker may briefly open when applying High.
- Uses the picker's accessible menu references to select High only inside its Thinking level submenu.
- Observes only the picker; a lightweight one-second check detects SPA navigation and button replacement. The already-High path does not read layout, and hidden tabs stop their interval.
- Transient failures are retried at most three times per URL/picker-label state, with five-second backoff. Navigation, a changed label, or returning to a hidden tab resets that budget. Models without thinking controls are left unchanged.
- Recognizes English and the listed Traditional/Simplified Chinese thinking-level labels. Gemini UI changes or other translations may require a selector/label update.
- Requires no extra Tampermonkey permissions or external dependencies.

## Validation

Run the dependency-free behavioral regression suite:

```sh
node --test gemini-thinking-high/test.mjs
node --check gemini-thinking-high/gemini-thinking-high.user.js
```

The suite covers model preservation, the idle path, same-URL resets, SPA navigation, picker replacement, transient failures, retry limits, user interaction, dialogs, visibility, cleanup exceptions, and reinjection. It uses a simulated accessible-menu DOM and clock; it does not substitute for testing Gemini's current UI in Edge.
