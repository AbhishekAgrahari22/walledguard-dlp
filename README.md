> **v2.2 response color hotfix:** Assistant answer elements now receive scoped inline blue text overrides, including `-webkit-text-fill-color`. The styling diagnostics display computed colors. See [v2.2 changes](docs/V2_2_RESPONSE_STYLE_HOTFIX.md). Live verification is required.

# WalledGuard DLP — Standalone Desktop GenAI Data Loss Prevention

**Rebuilt v2.1** — desktop application that opens a **dedicated real Google Chrome window** and monitors ChatGPT and Perplexity with the Chrome DevTools Protocol (CDP). No browser extension, add-on, or Chrome plugin is installed or required.

This edition replaces the earlier Electron-embedded ChatGPT window, which could render the homepage but returned **"Unable to connect"** on message submission in the original user's environment. Using an actual Chrome window removes one important embedded-browser compatibility variable. It does **not** guarantee the third-party websites will accept every session, authentication method, or request. Verify live functionality on your Mac before submission.

## Quick start on macOS (VS Code terminal)

**Prerequisites:** Node.js **22+**, npm, and **Google Chrome installed** in `/Applications` (or supply its executable path with `WALLEDGUARD_CHROME_PATH`).

```bash
cd walledguard-dlp       # folder obtained by extracting the new ZIP
nvm use 22               # only if you installed Node using nvm
npm ci                   # installs dependencies from package-lock.json
npm run doctor           # checks Chrome and bundled OCR data
npm run syntax
npm test                 # unit tests + genuine TXT/PDF/PNG OCR tests
npm run smoke:chrome     # optional: offline simulated Chrome interactions
npm start
```

**What you should see:** Two windows, not one:
1. **WalledGuard DLP** — Electron desktop controller with status, buttons and safe connection diagnostics.
2. **Google Chrome** — a separate, dedicated Chrome profile that opens `https://chatgpt.com/`. ChatGPT is **not embedded in Electron**.

### Google login rejected? Use the built-in sign-in handoff

If Google displays **"Couldn't sign you in — This browser or app may not be secure"** in managed Chrome:

1. In WalledGuard, click **Google login blocked? Open ordinary Chrome for sign-in**.
2. Read and accept the native warning. The protected Chrome process closes, then **normal Chrome opens with the same dedicated profile but NO remote debugging**.
3. **DLP IS OFF IN SIGN-IN MODE.** Only visit the login pages; do not type prompts, attach files, or send private data.
4. In that normal Chrome window, log into ChatGPT (or Perplexity) using the provider's official login flow. You can navigate to `https://www.perplexity.ai/` if you need to sign in there too.
5. Click **Finish sign-in & resume protection** in WalledGuard. It closes ordinary Chrome and reopens the dedicated profile under monitoring. The controller status must no longer say **DLP PAUSED** before you resume chatting.
6. Verify that the ChatGPT/Perplexity login persisted. The login handoff is the safest available compatibility attempt for Google OAuth; **there is no guarantee Google or the website will accept the account**. Do not disable browser security or impersonate another browser.

For accounts originally registered with **Continue with Google**, an email/password login may not be available; the handoff keeps Google's normal sign-in flow rather than trying to change authentication mechanisms.

In the controller choose **Open Perplexity** to open `https://www.perplexity.ai/` in another protected Chrome tab. You can sign in within the Chrome window. Sign-in cookies are stored in WalledGuard's separate Chrome profile, not your everyday Chrome profile.

**Keep the WalledGuard controller running** while using the Chrome window it launched. Closing the controller attempts to close the managed Chrome process. Regular Chrome, Safari and Firefox windows are **not protected** by this app.

For Windows/Linux, also install Google Chrome and use the same npm commands. You may explicitly select another compatible Chromium binary:

```bash
WALLEDGUARD_CHROME_PATH="/path/to/chrome" npm start
```

On Windows PowerShell: `$env:WALLEDGUARD_CHROME_PATH = 'C:\Path\To\chrome.exe'`; then `npm start`.

## Why v2 uses managed Chrome instead of embedded Electron

The original project used Electron's Chromium window to load ChatGPT. Loading HTML and JavaScript only proves that the homepage rendered; it does not prove that login, streaming, or backend API requests succeed. Some providers may treat embedded clients differently. v2 uses a dedicated **real Chrome application process** for those websites. The Electron process provides the **native OS dialogs**, file inspection, and controls. CDP lets the desktop app inject early event guards and style assistant replies without using an extension.

Chrome 136+ requires a **non-default user data directory** when remote debugging is enabled. WalledGuard deliberately creates a dedicated profile under its application data directory. This also keeps daily Chrome credentials separate. The debugging endpoint is bound to localhost, with an OS-assigned random port. Do not use the managed profile for unrelated sensitive browsing; other local processes with access to the debugging port could potentially inspect it.

## Assignment acceptance checklist

| Requirement | Implementation |
|---|---|
| Harmless prompt | Early capturing-phase listeners leave submission unchanged |
| Sensitive prompt | Capture Enter / send-button click / form submit; native Continue/Cancel before replay |
| TXT files | UTF-8/UTF-16 decoding; exact `WALLED_SENSITIVE` search |
| PDF | PDF.js text extraction and local OCR of each rendered page |
| Images | Tesseract.js local OCR, plus literal metadata/byte scan |
| Native confirmation | Electron `dialog.showMessageBox`, buttons **Continue** and **Cancel** |
| Continue | Replays prompt using trusted Chrome input; file picker uses original file paths/bytes |
| Cancel | Does not replay prompt; does not attach/copy unapproved file to form |
| AI response color | Expanded dynamic assistant selectors PLUS a CDP via-inspector stylesheet for stronger blue styling, without recoloring user prompts |
| Defense in depth | CDP Fetch interception for readable sensitive XHR/Fetch POST/PATCH/PUT bodies |
| No browser extension | Uses one standalone Electron controller and a Chrome process launched by the app |

**Scope of testing:** Source checks and unit tests were run during the rebuild. An offline Chromium smoke test (`npm run smoke:chrome`) confirmed prompt Cancel, prompt Continue, file picker handoff and blue response text against a *mock page*. This is **not** a claim of successful live end-to-end checks on ChatGPT and Perplexity; those must be recorded on a Mac with internet and valid site sessions. See [Demo Plan](docs/DEMO_PLAN.md).

## Color styling diagnostics

The controller has a **Refresh & diagnose blue AI responses** button. Open a ChatGPT or Perplexity conversation with a visible model answer, click it, and check the activity log for the number of matched assistant response blocks. The app applies blue rules through Chrome's CSS domain (a via-inspector stylesheet) as well as through DOM-based styling. If the reply remains black or the log shows zero matches, the site likely changed its markup. Share only the count and a redacted screenshot; do not copy message contents into an issue.

## Manual walkthrough

1. Launch WalledGuard with `npm start`; in the **separate managed Chrome** window, log into ChatGPT if prompted.
2. Send `Hello, how are you?` — **no WalledGuard dialog** should appear.
3. Send `Project key: WALLED_SENSITIVE` — a **native desktop** warning should say the marker was found in a **TEXT PROMPT**.
4. Choose **Cancel**: message stays editable; it must not be sent. Repeat and choose **Continue**: original prompt should be sent.
5. Upload `fixtures/sensitive.txt`, `fixtures/sensitive.pdf`, and `fixtures/sensitive.png` one at a time. A warning should identify each **FILE**. Try both decisions.
6. Try `fixtures/normal.txt`, `fixtures/normal.pdf`, `fixtures/normal.png` — file selection should proceed without a sensitivity dialog. Scanning may take time, particularly PDF OCR.
7. Check that **AI-generated** response text is blue. Switch to **Open Perplexity** and repeat the steps.

The marker is **literal and case-sensitive** in regular prompt/digital text detection. OCR normalization is more tolerant of spaces and underscores because optical recognition can split characters.

## Project layout

```text
walledguard-dlp/
├── package.json, package-lock.json
├── src/
│   ├── main.js                        Electron controller, scanning and native dialogs
│   ├── controller/                     Local dashboard UI (HTML/JS + secure preload)
│   ├── chrome/
│   │   ├── chrome-path.js              Locate Google Chrome
│   │   ├── cdp.js                      Minimal WebSocket/CDP command client
│   │   ├── controller.js               Launch Chrome, monitor tabs, file chooser, Fetch backstop
│   │   ├── injected.js                 Early prompt/file guards + blue answer CSS
│   │   └── request-policy.js           Origin and HTTP body policy helpers
│   ├── inspection/marker.js            Marker, signatures and text decoding
│   ├── inspection/scanner.js           Real PDF extraction and local image OCR
│   └── interception/request-guard.js   Short-lived network approval state
├── assets/tessdata/eng.traineddata    Bundled offline English OCR data
├── fixtures/                          Real normal/sensitive TXT, PDF and PNG samples
├── tests/                             Unit and file-scanning integration tests
├── scripts/check-environment.js       `npm run doctor`
└── docs/
    ├── ARCHITECTURE.md
    ├── TROUBLESHOOTING.md
    ├── DEMO_PLAN.md
    ├── INTERVIEW_EXPLANATION.md
    └── SUBMISSION_CHECKLIST.md
```

## Build a desktop app

```bash
npm run build
```

Uses `electron-builder` to create a platform installer: `.dmg` on macOS, `.exe` on Windows, `.AppImage` on Linux (build on the target OS; signing/notarization can be needed). A built app includes Electron, OCR runtime, Tesseract language data, and UI, but **still requires Google Chrome installed**. `npm run dist` creates an unpacked app. Test the installed build before sharing it.

## Security and reliability limitations

- **Only tabs inside the Chrome instance launched and monitored by WalledGuard are protected.** No arbitrary external browser windows are monitored.
- The DOM submission listeners cover common ChatGPT/Perplexity web UI paths; site updates can change selectors or introduce new submission paths. Retest against current sites.
- The CDP Fetch backstop inspects readable XHR/Fetch bodies. Multipart file bodies, streams, WebSockets, service-worker paths and other browser-private transports may not expose every byte. File-picker, drag/drop, and paste interception are the primary file gate.
- Native file chooser interception is reliable for normal `<input type=file>` flows; browser APIs or redesigned sites might bypass those selectors and require new handling.
- Some apps might reject synthetic drag/drop/paste event replay or certain browser/authentication environments. Google OAuth can reject Chrome controlled via CDP; sign-in handoff temporarily suspends DLP and might not always solve this. Native file-picker Continue uses Chrome's own `DOM.setFileInputFiles` and original file paths.
- OCR can misread extremely small, handwritten, distorted or low-contrast marker text. Unsupported formats and files larger than 32 MiB are **blocked**, not assumed safe.
- A local Chrome debugging endpoint increases local-machine security exposure. Dedicated profile, random localhost port and browser shutdown on disconnection reduce but do not eliminate that risk.
- Do **not** claim 100% leak prevention or production readiness. This is a maintainable interview prototype; production DLP would need extensive regression, site-policy validation, signed builds, and broader egress enforcement.

More: [Architecture](docs/ARCHITECTURE.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Demo](docs/DEMO_PLAN.md) · [Submission](docs/SUBMISSION_CHECKLIST.md).

## License / privacy

MIT license, see `LICENSE`. All inspections and OCR occur locally in the desktop process. The app deliberately does not log prompt text, file contents, cookies, access tokens, or full request URLs. Normal operation **does send** the original data to ChatGPT/Perplexity after your Continue decision or after a normal non-sensitive action; that is the intended user action.

## v2.3 response-text visual verification

If WalledGuard reports an assistant response but you still see black text, use
**Refresh & diagnose blue AI responses**. Diagnostics now count visible text
leaves as blue or not blue; they do not log prompt/answer content. This also
styles assistant paragraphs outside `.markdown` wrappers. Do not claim the live
coloring requirement passed unless the answer actually appears blue in the
browser. The offline mock tests are not proof of live-site compatibility.
