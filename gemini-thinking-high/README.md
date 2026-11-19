# Gemini — Fixed Thinking

Automatically select **Thinking level → Medium** while preserving Gemini's remembered model.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Edge.
2. [Click here to install](https://github.com/cyanyux/userscripts/raw/main/gemini-thinking-high/gemini-thinking-high.user.js).
3. Reload Gemini. The script includes update/download URLs for future updates.

If you already have **Gemini — Always High Thinking**, check for updates from its Tampermonkey dashboard row to upgrade to **Gemini — Fixed Thinking**.

## Behavior

- Reapplies Medium after reloads, SPA navigation, model changes, and same-URL thinking-level resets.
- Never selects a model, submits a prompt, calls private APIs, or sends network requests.
- Manually selecting Low or High will be followed by an automatic switch back to Medium. Disable the script to use a different level.
- Runs at document start and applies Medium as soon as Gemini's picker is ready.
- Masks the picker’s own overlays from the start of the switch through closing. It preserves the picker’s background and hover layer and disables temporary ripple and arrow animations. After applying Medium, it keeps the mask in place until the overlay and pressed state clear or the cleanup timeout expires.
- Returns focus to the previously focused control or clears the focus introduced by the menu. The picker suppresses Material's ring and the separate fill from delayed programmatic focus. Hover and keyboard focus keep their normal styling. The focus override clears on keyboard input, picker replacement, or script stop.
- Defers while typing, while another menu/dialog is open, and while the tab is hidden.
- Revalidates each option's connectivity, enabled state, role, label, and menu ownership immediately before clicking. If another popup appears during a switch, cancels without clicking background controls or restoring focus over that popup. Any already-open background menu remains under the app/user's control until dismissed.
- Uses the picker's accessible menu references to find Medium inside its Thinking level submenu.
- Page-wide discovery runs until the picker appears or ten seconds elapse. Further observations stay within the picker and the menus it opens. A one-second check catches navigation and picker replacement. The script skips layout reads when Medium is already set and suspends polling in hidden tabs.
- Attempts are capped at three per URL and picker label. If the first click leaves the picker closed for 600 ms, or Gemini resets a confirmed Medium while closing the menu, the script retries promptly. Other failures use a five-second backoff. Navigation, label changes, returning to a hidden tab, and a newly enabled picker reset the attempt budget.
- Recognizes English and the listed Traditional/Simplified Chinese thinking-level labels. Gemini UI changes or other translations may require a selector/label update.
- Requires no extra Tampermonkey permissions or external dependencies.

After updating in Tampermonkey, reload existing Gemini tabs to replace their running script instance. For diagnostics, the actual running version is available as `window.__geminiAlwaysHighThinking?.version` in the page console.

## Validation

Run the dependency-free behavioral regression suite:

```sh
node --test gemini-thinking-high/test.mjs
node --check gemini-thinking-high/gemini-thinking-high.user.js
```

The 49 tests exercise startup, navigation, retry limits, user interaction, and shell cleanup with a simulated accessible menu and clock. Startup regressions cover ignored clicks, Medium being reset during cleanup, and the picker becoming enabled after the attempt budget is spent. A closure regression keeps the mask applied until the picker’s delayed pressed state clears.

Open `browser-qa.html` directly in Edge to run eleven network-free transition scenarios. They sample animation frames during switching and cleanup, including when the overlay appears before its menu content, the pressed class survives menu closure, or programmatic focus arrives after cleanup. They also verify the Medium selection, model preservation, and restoration of manual styles. `browser-test.html` runs the standard scenario.
