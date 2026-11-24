# WalledGuard DLP v2.2 — AI response color hotfix

## What changed

The v2.1 controller reported **1 assistant block matched** in live ChatGPT, but the answer still rendered black. A selector match is not proof that browser CSS wins.

- The response styling logic now applies **scoped inline `!important`** blue `color` and `-webkit-text-fill-color` properties to answer text elements. This handles sites whose own inline styles defeat document/inspector stylesheets.
- Styling excludes interactive controls, toolbars, editable text, user turns and icon SVGs.
- The inspector stylesheet now includes `-webkit-text-fill-color` as well as `color`.
- The WalledGuard `Refresh & diagnose blue AI responses` button now logs the **computed answer text color and text-fill color** without recording answer content.
- Offline Chrome smoke tests now explicitly cover black inline `!important` text styles in ChatGPT-like and Perplexity-like answers.

## Upgrade from v2.1 (no new dependencies)

1. Quit WalledGuard (and the Chrome window it manages).
2. Replace only these three files in your current VS Code project with the files from the hotfix ZIP:
   - `src/chrome/injected.js`
   - `src/chrome/response-style.js`
   - `src/chrome/controller.js`
3. From the existing `walledguard-dlp` project directory run:

```sh
npm run syntax
npm run smoke:chrome
npm start
```

4. In protected ChatGPT, submit a harmless prompt. Click `Refresh & diagnose blue AI responses`. Inspect Activity & Connection Diagnostics for the **computed color**; expected blue is `rgb(18, 99, 214)`.

**Warning:** These are offline test improvements; live site verification is required for ChatGPT and Perplexity. If the computed CSS colors show blue but text still looks black, include a screenshot of the Chrome answer and WalledGuard diagnostics when reporting the issue.

No login, profile, prompt interception, scanner, or file upload workflows changed in this hotfix.
