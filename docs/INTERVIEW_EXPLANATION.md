# How to explain WalledGuard DLP in the interview

**30-second summary:** WalledGuard is a standalone Electron desktop controller that launches Google Chrome with an isolated profile. It uses Chrome DevTools Protocol commands, not an extension, to capture prompt submissions and file uploads before ChatGPT or Perplexity handles them. A local scanner checks the literal marker `WALLED_SENSITIVE`; native OS dialogs let a user Continue or Cancel. Normal traffic proceeds unchanged, and AI responses are colored blue.

**Why not embed ChatGPT in Electron?** The v1 project loaded the homepage in Electron but the same user's normal prompts received `Unable to connect`. The exact HTTP cause was never captured, so we cannot prove which site restriction caused it. The v2 architecture avoids the embedded-browser dependency by using a real Chrome process. Chrome login can still be restricted by providers.

**How does the app enforce decisions?** Capturing-phase listeners interrupt sensitive Enter, click and form events before site handlers run. The Electron process owns the native dialogs and scanner. Approvals resume actions via Chrome's input API, minimizing disruption from untrusted synthetic JavaScript events. File choose uses Chrome's native CDP `DOM.setFileInputFiles` with original paths after local inspection. Cancel leaves the prompt editable or the file unselected.

**How are images and PDFs inspected?** TXT supports UTF-8/UTF-16; PDF.js extracts text and renders pages; Tesseract OCR reads raster images and scanned PDF pages. OCR is offline with bundled English language data. Failures and unsupported formats fail closed.

**Does the network backstop guarantee full egress protection?** No. It intercepts readable Fetch/XHR POST/PATCH/PUT request bodies and can stop a literal marker missed by the DOM guards. Some multipart, streaming and WebSocket traffic is not available through the same CDP interception. The prototype therefore does not claim enterprise-grade network DLP coverage.

**Why is no extension required?** All monitoring is initiated by the desktop app through CDP to the dedicated Chrome instance it launches. The user's normal browser is not modified. This is not an add-on that must be installed into Chrome.

**What would you do for production?** Add a browser/site regression suite, structured policy engine, machine-wide data egress control, token-/secret-pattern detection, stronger hostile-page threat models, reliable support for all drag/drop transports, hardened local debugging access, signed installers, observability and a provider-compatibility test matrix.
