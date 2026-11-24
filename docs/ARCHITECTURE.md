# Architecture — WalledGuard DLP v2.1

## 1. Why the architecture changed

Original v1 embedded ChatGPT in Electron's Chromium window. In the user's macOS test it loaded the ChatGPT homepage but failed to send even ordinary messages (`Unable to connect`). The Chromium/macOS `task_policy_set` warning shown in Terminal is not itself proof of the cause. Reinstalling Node dependencies or disabling the DLP guard did not fix the observed issue. The exact failed API status was not captured, so the root cause **remains unproven**.

v2 moves the web application to a **separate, real Chrome process** and leaves Electron responsible for controller UI, local scanner and native OS confirmation. This avoids dependence on embedded Electron web content while remaining a standalone desktop application that requires no extension.

## 2. Data flow

```text
                         WalledGuard DLP (Electron main process)
                          ┌──────────────────────────────────┐
                          │ Controller window & activity log │
                          │ Native dialog: Continue / Cancel│
                          │ Marker scanner / PDF.js / OCR    │
                          │ CDP WebSocket (localhost)        │
                          └──────────────┬───────────────────┘
                                         │ Chrome DevTools Protocol
                                         │ (no browser extension)
                          ┌──────────────▼───────────────────┐
                          │ Managed Google Chrome process   │
                          │ Dedicated isolated user profile │
                          │ ChatGPT and Perplexity tabs      │
                          └──────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┼────────────────────────┐
                 │                       │                        │
       Prompt early event guard    File choose/drop/paste     Response CSS
       key / click / submit        bytes scanned locally      blue assistant text
                 │                       │
                 ▼                       ▼
           Native dialog            Native dialog if marked
                 │                       │
          Cancel or Continue        Cancel or Continue
                 │                       │
      Browser-trusted replay         Original file selection
                 │                       │
                 └───────────┬───────────┘
                             ▼
               Allowed browser network request
               Optional Fetch body backstop
```

## 3. Components and trust boundaries

- `src/main.js`: local Electron controller; owns **native** dialogs, file scanning and whitelisted IPC methods. The renderer is an app-owned local HTML page with `nodeIntegration:false`, `contextIsolation:true` and `sandbox:true`.
- `src/chrome/chrome-path.js`: locate an installed Google Chrome executable. `WALLEDGUARD_CHROME_PATH` can override it.
- `src/chrome/controller.js`: start Chrome with `--remote-debugging-port=0`, `--remote-debugging-address=127.0.0.1`, and a **non-default** `--user-data-dir`. Connect before navigating protected tabs. Use CDP `Target.setAutoAttach` and `Page.addScriptToEvaluateOnNewDocument` to install guards in new tabs. On a broken monitor connection, WalledGuard attempts to stop Chrome rather than silently letting an unprotected session continue.
- `src/chrome/injected.js`: runs in page JavaScript at document start, only on the two exact protected HTTPS origins. Capturing listeners stop sensitive prompt submission and file events before normal app handlers, then ask the desktop controller through a CDP `Runtime.addBinding` bridge. It does not have Node access. Resume uses `Input.dispatchMouseEvent` or `Input.dispatchKeyEvent` to produce browser-generated events for prompt Continue. File upload Continue preserves the selected files.
- `src/inspection/marker.js`: exact literal `WALLED_SENSITIVE`, UTF-8/UTF-16 decoding, format detection, OCR-specific whitespace tolerance.
- `src/inspection/scanner.js`: PDF.js text extraction per page; render each PDF page and run local Tesseract OCR; OCR images. Language model ships inside `assets/tessdata`. 32 MiB per-file limit.
- `src/interception/request-guard.js`: short-lived, **single-use** body approvals for the CDP Fetch backstop. This avoids showing a second dialog for the same approved request where the body is readable.
- `src/chrome/request-policy.js`: exact protected origins and request-marker helpers.

## 4. Prompt actions

1. User types and submits in a managed Chrome tab.
2. A capturing event handler reads current composer text. If no literal marker, the original event runs without extra interaction.
3. If sensitive, `preventDefault()` and `stopImmediatePropagation()` stop the initiating event. The original text stays editable.
4. Browser signals the Electron controller using a CDP binding. Electron displays an OS-native **Continue / Cancel** message box with prompt excerpt.
5. **Cancel:** do not resend input, do not mutate prompt.
6. **Continue:** the injected script validates the editor still contains the same text and grants a brief approval; Electron asks Chrome to dispatch a **trusted** click/Enter event to the original composer. The original content is unchanged.
7. For supported readable XHR/Fetch POST/PATCH/PUT request bodies, CDP Fetch interception checks the marker again before allowing the request. This is defense-in-depth for submission paths missed by the DOM handlers.

## 5. File actions

**Native file picker:** CDP's `Page.setInterceptFileChooserDialog` cancels the site file dialog. Electron opens a native system file-selection dialog instead, reads the chosen file locally, scans content, and if necessary asks a second native Continue/Cancel confirmation. **Continue** instructs Chrome `DOM.setFileInputFiles` with the **original path**, letting the browser perform the file input/change; **Cancel** never sets a file. This avoids synthetic DOM file inputs for ordinary uploads.

**Drag/drop and clipboard:** window capture-phase handlers stop an incoming file event, `FileReader` reads bytes locally in the browser, and a CDP binding transfers the data to Electron for scanning. On Continue, the original `File` objects are placed into a new DataTransfer event and dispatched to the site. Some libraries insist on browser-trusted drop events; this is a documented compatibility limitation.

Uninspected and unsupported files are denied rather than silently passed through. The application does not alter the selected file contents.

## 6. Response coloring

The page script installs a blue CSS stylesheet (`#1263d6`) with known AI-response selectors for ChatGPT's assistant turns and Perplexity's final answer content. It reattaches the stylesheet after page updates. The selectors are tied to contemporary DOM structures and require regression tests when either website changes its markup.

## 7. Security boundaries and gaps

This is **not** a transparent OS-wide DLP agent. WalledGuard cannot inspect ordinary independent Chrome, Safari or Firefox profiles. Sites can also use WebSockets, streaming body formats or redesigned event paths not exposed by the browser instrumentation; the CDP backstop cannot guarantee complete network coverage. Browser APIs can change, and remote debugging expands local attack surface. Chrome authentication may still be restricted by individual providers. The isolation and fail-stop behavior are best-effort; it is an assignment prototype, not a proof of zero data leakage.


## v2.1 response styling and authentication handling

The desktop controller injects the style guard at document start and creates a **DevTools via-inspector stylesheet** with `CSS.createStyleSheet` / `CSS.setStyleSheetText` after document load. This provides a second styling path for strict content-security-policy environments and for SPA re-renders. Both paths target assistant-specific containers and avoid user prompt blocks. A manual **Refresh & diagnose** button reports matched model-answer block counts without logging answer contents.

If an OAuth provider rejects sign-in while CDP is connected, the user can explicitly enter **unprotected sign-in mode** after an OS-native warning. This gracefully stops monitored Chrome, opens an ordinary Chrome process with the same dedicated user profile **without debugging**, then stops that process and relaunches monitored Chrome when the user clicks **Finish sign-in & resume protection**. Authentication is managed only by the official provider; the app never sees passwords and does not bypass OAuth policy. **No content is DLP-protected while sign-in mode is active**. This limitation is prominently disclosed in the desktop interface and README.
