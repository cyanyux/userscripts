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
- Runs at document start and applies High as soon as the picker is ready, without a fixed startup delay. Gemini still needs to load its model controls; the script cannot change the app's initial server-side default.
- Clips only the menus referenced by the picker's and Thinking level trigger's `aria-controls`, plus their popover and overlay surfaces, including outer shadows and closing shells whose contents have been removed. Other application menus are unaffected. During that switch only, it preserves the picker's original background and hover-layer opacity, freezes its arrow, and suppresses added click effects. High is applied immediately; cleanup waits briefly for the masked surfaces to close. These animation styles and markers are removed on completion, cancellation, error, or stop.
- Returns focus to the previously focused control; if no control was focused before automation, it clears the focus introduced by the menu. Pointer interactions suppress focus rings only on the model picker and its menus, including Material's separate focus-indicator border. Any trusted keyboard input immediately restores normal focus rings. This scoped focus styling is cleared on keyboard input, picker replacement, or script stop.
- Defers while typing, while another menu/dialog is open, and while the tab is hidden.
- Revalidates each option's connectivity, enabled state, role, label, and menu ownership immediately before clicking. If another popup appears during a switch, cancels without clicking background controls or restoring focus over that popup. Any already-open background menu remains under the app/user's control until dismissed.
- Uses the picker's accessible menu references to select High only inside its Thinking level submenu.
- Page-wide discovery runs only during startup, stopping when the picker appears or after ten seconds. After discovery, observations are restricted to the picker and, briefly, menus awaiting readiness. A lightweight one-second check catches SPA navigation and button replacement. The already-High path does not read layout, and hidden tabs stop their interval.
- Attempts are capped at three per URL and picker label. If the first click leaves the picker closed for 600 ms, or Gemini resets a confirmed High while closing the menu, the script retries promptly. Other failures use a five-second backoff. Navigation, label changes, returning to a hidden tab, and a newly enabled picker reset the attempt budget.
- Recognizes English and the listed Traditional/Simplified Chinese thinking-level labels. Gemini UI changes or other translations may require a selector/label update.
- Requires no extra Tampermonkey permissions or external dependencies.

After updating in Tampermonkey, reload existing Gemini tabs to replace their running script instance. For diagnostics, the actual running version is available as `window.__geminiAlwaysHighThinking?.version` in the page console.

## Validation

Run the dependency-free behavioral regression suite:

```sh
node --test gemini-thinking-high/test.mjs
node --check gemini-thinking-high/gemini-thinking-high.user.js
```

The 48 tests cover immediate startup, bounded discovery, mutation-driven menu readiness, temporary-style cleanup, model preservation, the idle path, same-URL resets, SPA navigation, picker replacement, transient failures, retry limits, user interaction, dialogs, visibility, cleanup exceptions, and reinjection. Startup regressions cover ignored clicks, High being reset during cleanup, and the picker becoming enabled after the attempt budget is spent. Its MutationObserver model batches notifications asynchronously and honors attribute filters and subtree registrations. It uses a simulated accessible-menu DOM and clock; it does not substitute for testing Gemini's current UI in Edge.

Open `browser-qa.html` directly in Edge for nine network-free transition scenarios. The suite covers a missed first click, nested wrappers, closing shells, detached menu content, a portaled submenu, delayed focus, outer overlay shadows, and an existing hover layer. The fixtures load the real userscript and sample animation frames during switching and cleanup. Checks include stable picker background and hover opacity, clipped menu surfaces and shadows, Material focus indicators, restored manual animations, model preservation, and marker and style cleanup. `browser-test.html` runs the standard scenario alone. Run live Edge QA separately to check Gemini's current controls and keyboard behavior.
