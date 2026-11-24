# Recording a 3–6 minute demo

**Before filming:** Verify that both live websites work in the WalledGuard-launched Chrome profile. The rebuild has been smoke-tested with a local mock page, but site-level success must be demonstrated on your own Mac with a valid login. Record only synthetic marker samples. Do not expose personal login credentials, API tokens, or real private documents.

## 1. Setup (20 seconds)

Open the VS Code terminal in `walledguard-dlp` and show:

```bash
npm run syntax
npm test
npm run smoke:chrome   # offline test, optional
npm start
```

Show the two windows: the WalledGuard desktop controller and **real Google Chrome**. Say clearly that this is not a browser extension and that Chrome is a dedicated app-managed profile.

If an OAuth login is rejected, finish signing in using the WalledGuard **ordinary Chrome for sign-in** button **before you start recording**. Return to protected mode and verify the controller's status. Avoid showing passwords or the unprotected sign-in window in the final demo.

## 2. ChatGPT (90 seconds)

- Send `Hello, how are you?`. Show no warning and a successful AI response.
- Type `Demo prompt WALLED_SENSITIVE`. Choose **Cancel** and show the prompt was not submitted, still editable.
- Send again; choose **Continue** and show the exact text was sent.
- Attach `fixtures/sensitive.txt`: show the native **FILE** warning. Cancel and show it was not attached. Repeat with Continue.
- Repeat file confirmation with `fixtures/sensitive.pdf` and `fixtures/sensitive.png` (on-screen text OCR).
- Show the assistant response in **blue**. If needed, use **Refresh & diagnose blue AI responses** and show the count of styled response blocks.

## 3. Perplexity (90 seconds)

Use the controller **Open Perplexity**. Make sure the page is signed in if needed. Repeat normal prompt, sensitive prompt Cancel/Continue, TXT/PDF/PNG upload warnings and blue answer text. If the website requires sign-in or limits files, complete that setup before recording. Record only flows that actually work.

## 4. Architecture (45 seconds)

Show `src/main.js`, `src/chrome/controller.js`, `src/chrome/injected.js`, `src/inspection/scanner.js`, and `docs/ARCHITECTURE.md`. Explain local CDP monitoring, native Electron dialogs, locally bundled OCR model, request backstop, and dedicated Chrome profile. Mention the honest limitations: it doesn't protect separate Chrome windows or every possible upload transport.

## 5. Record and share

macOS: `Shift + Cmd + 5` → record window or full screen. Capture mouse clicks and the OS-native Continue/Cancel dialogs. Upload the video as **public/unlisted with access for anyone who has the link and no sign-in required**. Open the finished link in a private/incognito browser to verify access.

Do not replace an actual two-site demonstration with screenshots of a mock page or pre-recorded claims. If a live acceptance item fails, fix it or describe the limitation rather than editing the failure out.
