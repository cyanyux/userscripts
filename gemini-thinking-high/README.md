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
- Clips only the menus referenced by the picker's and Thinking level trigger's `aria-controls`, plus their popover wrappers, including closing animations. Other application menus are unaffected. During that switch only, it also freezes the picker's arrow and suppresses click ripples. These animation styles and markers are removed on completion, cancellation, error, or stop.
- Returns focus to the previously focused control; if no control was focused before automation, it clears the focus introduced by the menu. Pointer interactions suppress focus rings only on the model picker and its menus, including Material's separate focus-indicator border. Any trusted keyboard input immediately restores normal focus rings. This scoped focus styling is cleared on keyboard input, picker replacement, or script stop.
- Defers while typing, while another menu/dialog is open, and while the tab is hidden.
- Revalidates each option's connectivity, enabled state, role, label, and menu ownership immediately before clicking. If another popup appears during a switch, cancels without clicking background controls or restoring focus over that popup. Any already-open background menu remains under the app/user's control until dismissed.
- Uses the picker's accessible menu references to select High only inside its Thinking level submenu.
- Page-wide discovery runs only during startup, stopping when the picker appears or after ten seconds. After discovery, observations are restricted to the picker and, briefly, menus awaiting readiness. A lightweight one-second check catches SPA navigation and button replacement. The already-High path does not read layout, and hidden tabs stop their interval.
- Transient failures are retried at most three times per URL/picker-label state, with five-second backoff. Navigation, a changed label, or returning to a hidden tab resets that budget. Models without thinking controls are left unchanged.
- Recognizes English and the listed Traditional/Simplified Chinese thinking-level labels. Gemini UI changes or other translations may require a selector/label update.
- Requires no extra Tampermonkey permissions or external dependencies.

After updating in Tampermonkey, reload existing Gemini tabs to replace their running script instance. For diagnostics, the actual running version is available as `window.__geminiAlwaysHighThinking?.version` in the page console.

## Validation

Run the dependency-free behavioral regression suite:

```sh
node --test gemini-thinking-high/test.mjs
node --check gemini-thinking-high/gemini-thinking-high.user.js
```

The 41 tests cover immediate startup, bounded discovery, mutation-driven menu readiness, temporary-style cleanup, model preservation, the idle path, same-URL resets, SPA navigation, picker replacement, transient failures, retry limits, user interaction, dialogs, visibility, cleanup exceptions, and reinjection. Race regressions cover detached, disabled, moved, relabeled, role-changed, or retargeted options, safe retries, and intervening dialogs/menus without focus theft. Its MutationObserver model batches notifications asynchronously and honors attribute filters and subtree registrations. It uses a simulated accessible-menu DOM and clock; it does not substitute for testing Gemini's current UI in Edge.

Open `browser-test.html` directly in Edge for a separate, network-free CSS regression. It loads the real userscript and checks computed styles during a delayed switch, including that an unrelated menu sentinel receives no clipping, manual menu styles return, and stopping the script leaves no styles or markers behind. The sentinel stays hidden so it does not intentionally interrupt automation. A successful run displays `PASS`. This fixture does not test Gemini's server or native keyboard-modality heuristics.
