# WalledGuard DLP v2.1 — verification report

Date: 24 November 2026

## Verified in this build environment

- `npm run syntax`: PASS on all source files.
- `npm run test:unit`: 15/15 existing core tests PASS.
- `node --test tests/response-and-signin.test.js`: 3/3 new color/sign-in guards PASS.
- `npm run smoke:chrome`: PASS in real headless Chromium against LOCAL MOCK DOMs:
  - older and newer ChatGPT answer wrappers turn blue, user prompts remain unchanged;
  - DevTools via-inspector stylesheet applies answer colors;
  - sensitive prompt Cancel blocks and Continue replays original text;
  - Chrome's native file picker handoff reaches the mock page after inspection;
  - Perplexity-like answer styling turns blue without recoloring the user query;
  - Perplexity-like sensitive prompt Cancel/Continue behaves as expected.
- `node --test tests/integration.test.js`: 5/6 PASS. One `normal.pdf` OCR test cannot run with the native `@napi-rs/canvas` binary extracted from the user's macOS dependency bundle in this **Linux** test environment. It is a platform-binary mismatch, not an assertion failure indicating a leaked file. The full equivalent 21/21 v2 suite previously passed on the user's macOS environment, before these v2.1 changes.

## Not verified here

- Google OAuth success in ordinary Chrome sign-in mode, or cookie persistence after reopening monitored Chrome.
- Blue AI replies on the **live** ChatGPT and Perplexity pages.
- Live TXT/PDF/image upload pathways on both websites after login.
- A signed/notarized `.dmg` installer (build on macOS if needed).

The assignment requires a LIVE video proving the website behaviors. Do not present mock-browser tests as live provider acceptance tests.

## On the user's Mac (run fresh dependencies)

```bash
npm ci
npm run syntax
npm test
npm run smoke:chrome
npm start
```

`npm ci` on the Mac installs the correct macOS/arm64 native canvas binary. Confirm all 24 tests pass locally and the live workflows before submitting.

## v2.2 response styling regression (Nov 2026)

- `npm run syntax`: PASS on Linux test environment.
- `npm run smoke:chrome`: PASS in local Chromium. New checks verify that answer text with site-authored black **inline `!important`** styles is displayed blue, including `-webkit-text-fill-color`, while user prompts stay unaffected.
- 18 non-native tests: PASS.
- Full `npm test`: 23/24 PASS in Linux test environment. The `normal.pdf` test fails because the dependency cache supplied contains a macOS-only `@napi-rs/canvas` native binding. The previous v2.1 full test suite passed 24/24 on the user's Mac. Run `npm test` on macOS to verify v2.2's full suite.
- Live ChatGPT/Perplexity blue-text rendering: **not yet retested**, cannot be claimed complete.
