# Submission checklist

The interview assignment requests **source code, README, architecture, public GitHub URL, CV and demo video link**. This ZIP provides the project source, README, architecture and demo plan. It **cannot create a GitHub repository or a CV/video link on your behalf**; those require your accounts, materials and an actual Mac screen recording.

## Steps

1. Extract the ZIP into a clean `walledguard-dlp` folder. Do **not** upload `node_modules`, session profiles, cookies or app user-data.
2. On Mac: `npm ci`, `npm run doctor`, `npm run syntax`, `npm test`, `npm start`. Test every acceptance criterion on *both* real websites.
3. Use the provided `fixtures/normal.*` and `fixtures/sensitive.*` to record the live demo. Follow `docs/DEMO_PLAN.md`.
4. Create a **public GitHub** repository and commit the source. Avoid uploading user secrets, recordings of login screens, or the managed Chrome profile.
5. Upload the demo video to a platform with public/unlisted share access and no forced login. Confirm access from an incognito browser.
6. Make your CV available at a public no-sign-in link (for example publicly shared PDF or personal website). Confirm access from an incognito browser.
7. Open the employer's submission form and supply your real CV, public repository and demo links.

Suggested Git commands (after you create the repository on GitHub):

```bash
git init
git add .
git commit -m "WalledGuard DLP standalone Chrome-managed desktop app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/walledguard-dlp.git
git push -u origin main
```

**Verification:** repository page must be public, README visible, no credentials committed; video must play without sign-in; CV must download/open without access request. Only claim acceptance criteria shown to work in the real demo. Note that some providers may prohibit browser automation, certain authentication flows or remote debugging connections.


### v2.1 final live gate

- [ ] After any unprotected sign-in handoff, verify protection status is active before opening a conversation.
- [ ] ChatGPT normal prompt, sensitive prompt Cancel + Continue, and TXT/PDF/PNG file Cancel + Continue all verified on the real site.
- [ ] Perplexity normal prompt, sensitive prompt Cancel + Continue, and supported file Cancel + Continue all verified on the real site.
- [ ] Blue model answers verified on both real sites. Use the controller's blue response diagnostics if necessary.
- [ ] Recording includes **native macOS dialogs**, not browser `alert()` dialogs; no login passwords or credentials are visible.
- [ ] A public GitHub link, a CV PDF link, and a video link are checked in an incognito browser without sign-in.
