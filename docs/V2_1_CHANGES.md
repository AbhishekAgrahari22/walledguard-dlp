# v2.1 changes — 24 November 2026

- **Google OAuth compatibility workflow:** added user-consented, unprotected ordinary Chrome sign-in mode using WalledGuard's existing dedicated profile, followed by an explicit return to monitored Chrome. No browser extensions, account-token copying, spoofing, or weakened web-security switches.
- **Safety:** clear UI banner and status state `DLP PAUSED` during sign-in. Protected browsing commands are disabled while unprotected sign-in is active.
- **Response-color fix:** supports newer ChatGPT `section[data-turn="assistant"]` message layout, traditional `article`/`data-message-author-role` layouts, Perplexity answer containers, and dynamic SPA content. A Chrome inspector stylesheet offers a secondary styling channel even when page style injection doesn't apply.
- **Diagnostics:** `Refresh & diagnose blue AI responses` counts matched blocks without reading their text.
- **Browser smoke:** verifies ChatGPT and Perplexity mock answer coloring, leaves user prompts unchanged, and verifies Cancel/Continue interception on both mock sites. It also tests inspector styling.
- **PDF:** native canvas dependency is loaded only when a PDF page actually needs rendering/OCR rather than on all PDF parses.

## Still to verify live before final submission

The code and mock-page tests alone cannot certify real Google login success, live Perplexity functionality, every real PDF/TXT/image upload pathway, or resilience to future website changes. The final video must demonstrate acceptance criteria on the two real sites, with credentials hidden.
