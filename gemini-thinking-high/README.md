# Gemini — Fixed Thinking

Remember the last manually selected thinking level for new chats. Gemini restores the model and thinking level for saved conversations.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Edge.
2. [Click here to install](https://github.com/cyanyux/userscripts/raw/main/gemini-thinking-high/gemini-thinking-high.user.js).
3. Reload Gemini. The script includes update/download URLs for future updates.

If you already have **Gemini — Always High Thinking**, check for updates from its Tampermonkey dashboard row to upgrade to **Gemini — Fixed Thinking**.

## Behavior

- Saved conversations use Gemini's own model and thinking level, including when reopening or restoring their tabs.
- A fresh blank tab uses the last manually selected thinking level, with Medium as the initial default. Each blank tab keeps its own level across reloads using session storage. Edge can restore that session data with the tab.
- New chat within a Gemini tab follows Gemini's native setting and records the resulting level for a reload.
- Applies the remembered level when restoring a blank tab. It reapplies that choice if Gemini resets the blank tab's picker.
- Never selects a model, submits a prompt, calls private APIs, or sends network requests.
- Only manual choices update the default for future blank tabs. Other open tabs retain their own settings.
- Masks the picker’s own overlays from the start of the switch through closing. It preserves the picker’s background and hover layer and disables temporary ripple and arrow animations. The mask stays in place until the overlay and pressed state clear or the cleanup timeout expires.
- Returns focus to the previously focused control or clears the focus introduced by the menu. The picker suppresses Material's ring and the separate fill from delayed programmatic focus. Hover and keyboard focus keep their normal styling. The focus override clears on keyboard input, picker replacement, or script stop.
- Defers while typing, while another menu/dialog is open, and while the tab is hidden.
- Revalidates each option's connectivity, enabled state, role, label, and menu ownership immediately before clicking. If another popup appears during a switch, cancels without clicking background controls or restoring focus over that popup. Any already-open background menu remains under the app/user's control until dismissed.
- Uses the picker's accessible menu references to find the chosen level inside its Thinking level submenu.
- Page-wide discovery on a blank tab runs until the picker appears or ten seconds elapse. Further observations stay within the picker and the menus it opens. A one-second check catches picker replacement and suspends in hidden tabs. In Edge, saved conversations wait for navigation events with no polling or picker discovery.
- Attempts are capped at three per URL and picker label. If a click leaves the picker closed for 600 ms, the script retries promptly. Other failures get a retry after 400 ms and, if needed, a final attempt after a five-second backoff. The script retries immediately if Gemini resets the level during the first successful switch.
- Retries and pauses use a one-shot timer to resume at the deadline. Navigation, label changes, returning to a hidden tab, and a newly enabled picker reset the attempt budget.
- Recognizes English and the listed Traditional/Simplified Chinese thinking-level labels. Gemini UI changes or other translations may require a selector/label update.
- Requires no extra Tampermonkey permissions or external dependencies.

After updating in Tampermonkey, reload existing Gemini tabs to replace their running script instance. For diagnostics, the actual running version is available as `window.__geminiAlwaysHighThinking?.version` in the page console.

## Validation

Run the dependency-free behavioral regression suite:

```sh
node --test gemini-thinking-high/test.mjs
node --check gemini-thinking-high/gemini-thinking-high.user.js
```

The tests exercise startup, navigation, retry limits, user interaction, and shell cleanup with a simulated accessible menu and clock. They also check independent tab preferences, saved conversation protection, and blocked storage.

Serve the fixture on loopback and open `http://127.0.0.1:8765/browser-qa.html` in Edge to run eleven transition scenarios.

```sh
python3 -m http.server --bind 127.0.0.1 --directory gemini-thinking-high 8765
```

The scenarios sample animation frames during switching and cleanup, including when the overlay appears before its menu content, the pressed class survives menu closure, or programmatic focus arrives after cleanup. They also verify the Medium selection, model preservation, and restoration of manual styles.
