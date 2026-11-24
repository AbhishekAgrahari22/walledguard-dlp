# Troubleshooting — WalledGuard v2.1

## `npm start` opens two windows

**Expected.** WalledGuard is the Electron **controller**; the web apps run in a separate **Google Chrome** window launched and monitored by it. The old embedded ChatGPT window is gone.

## The managed Chrome window shows `Unable to connect`

1. Sign into ChatGPT **inside managed Chrome**. Its cookies are separate from Safari and your ordinary Chrome profile.
2. Try `Hello` in the same managed Chrome tab. Compare with the same account and network in regular Chrome.
3. In the WalledGuard controller, read **Activity & connection diagnostics** for `HTTP 401`, `HTTP 403`, `HTTP 429`, or `net::ERR_...`. These messages omit request bodies and tokens.
4. `401`: verify session/authentication. `403`: likely provider/server rejection or security policy; it is **not** fixed by changing npm. `429`: rate limits. `net::ERR_...`: inspect proxy, VPN, firewall and browser connectivity.
5. If the site works in regular Chrome but not WalledGuard's managed Chrome, collect the managed Chrome **DevTools → Network → Fetch/XHR** status for a harmless prompt and investigate session/browser policy before continuing.

**Do not disable Chrome web security, CORS, certificate validation or browser DLP guards to work around authorization failures.** Embedded-client compatibility and third-party provider access cannot be guaranteed.

## Google says "Couldn't sign you in — browser or app may not be secure"

This is a Google security policy rejection, not a Node.js installation error. Google's OAuth may reject Chrome when started with a remote debugging connection.

- In WalledGuard, click **Google login blocked? Open ordinary Chrome for sign-in**. A native warning explains that protection will be **PAUSED**. Proceed only if you can avoid using the AI sites for anything except authentication during the pause.
- Log in using ordinary Chrome, which WalledGuard launches with **no remote debugging flags** and the same dedicated profile.
- After authentication, click **Finish sign-in & resume protection**. Confirm the WalledGuard status is **Protected Chrome browser ready / Monitoring managed Chrome**, not **DLP PAUSED**.
- If Google still refuses to sign you in, the website's external authentication restrictions cannot reliably be resolved from the application. Use the test flows that don't require login; do **not** claim TXT/PDF acceptance if you cannot verify it live.

The sign-in-only window is deliberately not protected. **Never submit sensitive prompts or files while DLP is paused.** The application never asks for or reads your password or authentication tokens.

## AI-generated responses are still black

- Click **Refresh & diagnose blue AI responses** in the controller with an assistant answer visible. The activity log reports matched response block counts, not message text.
- v2.1 now uses updated assistant selectors and CDP's **CSS.createStyleSheet / CSS.setStyleSheetText** in addition to DOM-inserted CSS. This is more resilient to SPA markup and CSP behavior.
- If zero blocks match, collect a redacted screenshot or *sanitized selectors only* from Chrome Developer Tools. The site may have shipped another DOM revision. Do not copy private messages or cookies.
- Verify **both ChatGPT and Perplexity** in the real controlled browser; the offline smoke test isn't a replacement.

## `npm start` says Google Chrome is missing

Install Google Chrome. WalledGuard uses the real browser executable, not an Electron webview.

On macOS the default path is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

```bash
WALLEDGUARD_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm start
```

Use `npm run doctor` to verify paths. On Linux, Chrome/Chromium can be on `PATH`.

## Chrome debugging connection failed / profile already in use

Close the Chrome window previously opened by WalledGuard, fully quit WalledGuard, then run `npm start` again. A dedicated profile is stored under the Electron app's user data. It must not be concurrently opened by an independent Chrome process. The app uses a randomly assigned local CDP port and a fresh `DevToolsActivePort` file each launch.

Chrome 136+ requires a separate non-default profile for remote debugging. This is deliberate and should not be removed.

## macOS terminal shows `task_policy_set TASK_SUPPRESSION_POLICY ... invalid argument (4)`

This is a Chromium/macOS process-policy warning that can appear during Electron startup. It is **not by itself** proof that ChatGPT networking failed. Diagnose actual network status separately.

## A native Continue/Cancel dialog did not appear

Ensure you are using the **Chrome window WalledGuard launched**, not regular Chrome. Use the exact uppercase marker `WALLED_SENSITIVE`. Keyboard Enter, send-button click and form submit are monitored, but website DOM changes can require updated selectors. See `src/chrome/injected.js`.

## A scanned PDF takes time, or upload is blocked

PDFs are parsed and also OCR-scanned page by page, locally. OCR image processing can be slower than reading a text file. Files above 32 MiB or unsupported extensions are blocked. Review `npm test` output and test with supplied fixtures before trying real documents.

## Reinstall cleanly

Stop the application and close managed Chrome, then:

```bash
rm -rf node_modules
npm ci
npm run syntax
npm test
npm start
```

Reinstalling dependencies may help a broken local install, **but does not fix a website authentication or network rejection**.

## External browser isn't protected

Correct: no extension is installed. WalledGuard protects only its own launched Chrome process/profile. Do not claim OS-wide monitoring in the interview.
