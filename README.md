# WalledGuard DLP — Standalone Desktop Data Loss Prevention

**Version:** 2.3  
**Technology:** Electron, Node.js, Google Chrome, Chrome DevTools Protocol (CDP), PDF.js, Tesseract.js  
**Supported Platforms:** ChatGPT Web and Perplexity Web

**GitHub Repository:**  
https://github.com/AbhishekAgrahari22/walledguard-dlp

## Demonstration Video

A screen recording of the WalledGuard DLP desktop application is available through GitHub Releases.

**[View or Download the WalledGuard DLP Demonstration](https://github.com/AbhishekAgrahari22/walledguard-dlp/releases/tag/v1.0-demo)**

**Video filename:** `WalledGuard_DLP_Demo.mov`

The demonstration covers the application's browser integration, sensitive-content detection, and native confirmation workflow. Refer to the recording for the specific ChatGPT and Perplexity scenarios demonstrated.

---

## 1. Project Overview

WalledGuard DLP is a standalone desktop Data Loss Prevention (DLP) application designed to help prevent accidental disclosure of confidential information to public Generative AI platforms.

The application monitors user interactions within dedicated Google Chrome sessions opened and controlled by WalledGuard.

It supports:

- ChatGPT Web: https://chatgpt.com
- Perplexity Web: https://www.perplexity.ai

WalledGuard examines text prompts and supported file uploads for the predefined sensitive marker:

`WALLED_SENSITIVE`

If sensitive content is detected, the application displays a native desktop confirmation dialog before allowing the corresponding action to proceed.

The solution is built using Electron and managed Google Chrome. It does not require a browser extension, add-on, or plugin.

---

## 2. Key Features

### 2.1 Text Prompt Monitoring

WalledGuard monitors outgoing text prompts in the supported AI websites.

- Prompts without `WALLED_SENSITIVE` proceed normally.
- Prompts containing `WALLED_SENSITIVE` trigger a native confirmation dialog.
- The dialog identifies the detected content as a text prompt.
- The user can choose **Continue** or **Cancel**.

### 2.2 File Upload Inspection

The application inspects supported files before allowing uploads through the monitored browser.

Supported file formats:

| File Type | Inspection Method |
|---|---|
| TXT | UTF-8 and UTF-16 text decoding |
| PDF | PDF.js text extraction and OCR |
| Images | Tesseract.js optical character recognition (OCR) |

When the marker is detected, WalledGuard displays the affected filename and asks the user to confirm the action.

### 2.3 Native Desktop Confirmation

The application uses Electron's native desktop dialog functionality.

**Continue**
- Allows the original prompt or file to proceed.
- Preserves the original content.

**Cancel**
- Blocks the current prompt submission or file upload.
- Allows the user to edit, retry, or resubmit later.

### 2.4 AI Response Text Customization

WalledGuard includes functionality for changing AI-generated response text to blue in ChatGPT and Perplexity.

The implementation uses DOM-based selectors and Chrome DevTools Protocol stylesheet injection.

The controller also provides a **Refresh & diagnose blue AI responses** action for checking detected response blocks and text styling.

**Verification note:** Offline browser tests cover response styling. Live website rendering can differ, and response coloring must be visually verified on both supported websites. This feature should not be treated as fully validated if responses still appear black.

### 2.5 Standalone Desktop Architecture

WalledGuard uses:

- Electron for the desktop controller and native dialogs.
- Google Chrome as the managed browser.
- Chrome DevTools Protocol for browser monitoring and interception.
- Node.js for application logic and local file inspection.
- PDF.js for extracting PDF content.
- Tesseract.js for OCR processing.

No browser extension is needed.

---

## 3. Installation and Setup

### Prerequisites

- macOS, Windows, or Linux
- Node.js 22 or later
- npm
- Google Chrome
- Internet connection for ChatGPT and Perplexity
- An account on the respective AI website when its features require authentication

The application has been developed and tested primarily on macOS.

### Clone the Repository

```bash
git clone https://github.com/AbhishekAgrahari22/walledguard-dlp.git
cd walledguard-dlp
```

### Install Dependencies

```bash
npm ci
```

If Node.js was installed using `nvm`, select Node 22:

```bash
nvm use 22
```

### Check the Environment

```bash
npm run doctor
```

This checks the Node.js environment, Chrome installation, Electron dependency, and file-inspection resources.

### Verify JavaScript Syntax

```bash
npm run syntax
```

### Run Automated Tests

```bash
npm test
```

### Run Offline Browser Integration Tests

```bash
npm run smoke:chrome
```

These tests use simulated web pages to validate interception and browser behavior. They do not replace live testing on ChatGPT and Perplexity.

### Start the Application

```bash
npm start
```

Two windows should appear:

1. **WalledGuard DLP Controller:** Displays protection status, browser controls, and diagnostic information.
2. **Managed Google Chrome:** Opens ChatGPT and supports navigation to Perplexity.

Keep the controller running while using the protected browser.

---

## 4. How to Use WalledGuard

### Step 1 — Launch the Application

Run:

```bash
npm start
```

Confirm that WalledGuard reports:

**Protected Chrome browser ready**

or

**Monitoring managed Chrome**

### Step 2 — Open ChatGPT

Use the **Open ChatGPT** button in the WalledGuard controller.

Enter a normal prompt:

```text
Explain data loss prevention in two sentences.
```

Expected behavior: The prompt is submitted without a sensitivity warning.

### Step 3 — Test Sensitive Prompt Detection

Enter:

```text
My confidential test code is WALLED_SENSITIVE.
```

Expected behavior: A native desktop dialog appears indicating that sensitive content was detected in a text prompt.

Choose **Cancel** to prevent submission.

Repeat the test and choose **Continue** to allow the original prompt.

### Step 4 — Test File Upload Protection

The repository contains sample files in the `fixtures/` directory.

Sensitive test files:

- `fixtures/sensitive.txt`
- `fixtures/sensitive.pdf`
- `fixtures/sensitive.png`

Normal test files:

- `fixtures/normal.txt`
- `fixtures/normal.pdf`
- `fixtures/normal.png`

For each sensitive file:

1. Select the file using the AI website's upload control.
2. Verify that a native file confirmation dialog appears.
3. Click **Cancel** and confirm that the file is not attached.
4. Select the same file again.
5. Click **Continue** and verify that the original file proceeds.

Normal files should proceed without a sensitive-content confirmation.

Some website features may require authentication or have provider-specific upload limitations.

### Step 5 — Test Perplexity

In the WalledGuard controller, select **Open Perplexity**.

Normal test prompt:

```text
What is data loss prevention?
```

Sensitive test prompt:

```text
Explain the marker WALLED_SENSITIVE.
```

Repeat the Cancel and Continue tests.

Where supported by Perplexity's interface, repeat the TXT, PDF, and image file-upload tests.

### Step 6 — Verify Response Styling

Request an AI-generated response:

```text
List three cybersecurity best practices.
```

The intended behavior is to display AI-generated text in blue without changing user prompt styling.

If the response remains black, select **Refresh & diagnose blue AI responses** in the WalledGuard controller.

Check the diagnostic output and record the actual result.

---

## 5. Architecture Overview

WalledGuard uses a desktop-controller and managed-browser architecture.

### 5.1 Electron Desktop Controller

Electron provides:

- Desktop application interface.
- Native Continue/Cancel dialogs.
- File-inspection coordination.
- Browser session management.
- Protection status and diagnostics.

### 5.2 Managed Chrome Browser

WalledGuard launches a dedicated Google Chrome instance.

The desktop application connects to that Chrome process through the Chrome DevTools Protocol.

The application monitors supported ChatGPT and Perplexity pages inside this managed browser.

Normal browser sessions that were not launched by WalledGuard are outside the monitoring scope.

### 5.3 Prompt Interception

The application installs page-level monitoring logic through CDP.

It uses capturing-phase event listeners to inspect common prompt submission actions, including:

- Enter-key submissions.
- Send-button clicks.
- Form submission events.

When the sensitive marker is present, the application requests a native confirmation decision before proceeding.

### 5.4 File Inspection

The application coordinates file selection with local inspection.

TXT files are decoded and searched for the sensitive marker.

PDF files are processed using text extraction and OCR.

Image files are processed using OCR to identify the marker in visible image content.

Unsupported formats or files exceeding configured inspection limits are blocked rather than silently assumed safe.

### 5.5 Continue and Cancel Enforcement

**Continue:** The application allows the original user action to proceed.

**Cancel:** The intercepted action is not replayed, preventing the corresponding submission or attachment through the monitored workflow.

### 5.6 Network-Level Backstop

WalledGuard also includes Chrome DevTools Protocol request interception for supported readable outgoing request bodies.

This provides an additional protection layer but does not guarantee visibility into every possible transport mechanism.

### 5.7 AI Response Styling

The response-color customization layer identifies assistant response containers and applies blue text styling through DOM manipulation and Chrome stylesheet injection.

Because ChatGPT and Perplexity interfaces change over time, live styling should be retested against their current page structures.

---

## 6. Project Structure

```text
walledguard-dlp/
├── README.md
├── LICENSE
├── NOTICE.md
├── package.json
├── package-lock.json
├── src/
│   ├── main.js
│   ├── controller/
│   ├── chrome/
│   │   ├── chrome-path.js
│   │   ├── cdp.js
│   │   ├── controller.js
│   │   ├── injected.js
│   │   ├── request-policy.js
│   │   └── response-style.js
│   ├── inspection/
│   │   ├── marker.js
│   │   └── scanner.js
│   └── interception/
│       └── request-guard.js
├── assets/
│   └── tessdata/
├── fixtures/
├── tests/
├── scripts/
└── docs/
    ├── ARCHITECTURE.md
    ├── TROUBLESHOOTING.md
    ├── DEMO_PLAN.md
    ├── INTERVIEW_EXPLANATION.md
    └── SUBMISSION_CHECKLIST.md
```

Additional technical details are available in [Architecture Documentation](docs/ARCHITECTURE.md).

---

## 7. Testing and Validation

The project includes automated tests and browser smoke tests.

### Unit and Integration Tests

Run:

```bash
npm test
```

These tests cover:

- Sensitive-marker detection.
- Text encoding support.
- PDF content extraction.
- Image OCR.
- Prompt approval behavior.
- File approval behavior.
- HTTP request policy checks.
- Selected browser and styling helpers.

### Offline Browser Tests

Run:

```bash
npm run smoke:chrome
```

The offline smoke tests verify representative browser interactions, including:

- Normal prompt handling.
- Sensitive prompt Cancel and Continue.
- File selection after inspection.
- Response styling against simulated page structures.
- Representative ChatGPT and Perplexity page behavior.

**Important:** Offline smoke tests use local mock pages. They do not establish that every feature works on the live ChatGPT and Perplexity websites.

### Live Website Testing

The application must also be tested directly on:

- https://chatgpt.com
- https://www.perplexity.ai

Live verification should include prompt handling, file uploads, both dialog actions, and response styling.

---

## 8. Google Sign-In and Session Handling

Some authentication providers may reject Chrome sessions controlled through automation or debugging interfaces.

WalledGuard provides a separate sign-in handoff workflow.

If authentication fails:

1. Click **Google login blocked? Open ordinary Chrome for sign-in**.
2. Accept the native warning.
3. Use the ordinary Chrome window to complete authentication.
4. Return to WalledGuard.
5. Click **Finish sign-in & resume protection**.
6. Verify that monitoring has resumed.

**Security warning:** DLP monitoring is paused during sign-in mode.

Do not submit AI prompts, attach files, or transmit confidential information while protection is paused.

Authentication success depends on the provider's security policies and is not guaranteed.

---

## 9. Security and Reliability Limitations

WalledGuard is an interview-assignment prototype, not a production-certified enterprise DLP product.

Important limitations include:

- Monitoring applies only to Chrome sessions launched and managed by WalledGuard.
- Website updates can change the DOM structure and break particular event selectors.
- Not every network transport exposes its request body to CDP interception.
- Certain browser APIs may require additional interception handling.
- OCR can miss small, handwritten, distorted, or low-contrast text.
- Google or other authentication services may restrict monitored browser sessions.
- Local debugging interfaces introduce additional security considerations.
- AI-response styling can require updates when ChatGPT or Perplexity changes its UI.

The application uses a dedicated browser profile and local inspection components to reduce unnecessary access to personal browser sessions.

The implementation should not be represented as providing complete prevention against every possible data-exfiltration technique.

---

## 10. Privacy and Data Handling

File inspection and OCR are performed locally by the desktop application.

The application is designed not to log confidential prompt contents, uploaded file contents, authentication cookies, or access tokens as part of its normal diagnostics.

When the user chooses Continue, the original content proceeds to the selected AI website.

When content is non-sensitive, normal user actions proceed without a sensitivity warning.

---

## 11. Build the Desktop Application

To build a platform-specific desktop application, run:

```bash
npm run build
```

The project uses Electron Builder.

Platform-specific packaging and code-signing requirements may apply.

The resulting desktop application still requires an installed compatible Google Chrome browser.

---

## 12. Additional Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- [Demonstration Plan](docs/DEMO_PLAN.md)
- [Interview Explanation](docs/INTERVIEW_EXPLANATION.md)
- [Submission Checklist](docs/SUBMISSION_CHECKLIST.md)

---

## 13. Assignment Submission

**Source Code:**  
https://github.com/AbhishekAgrahari22/walledguard-dlp

**Demonstration Video:**  
https://github.com/AbhishekAgrahari22/walledguard-dlp/releases/tag/v1.0-demo

The video is attached to the GitHub release as `WalledGuard_DLP_Demo.mov`.

The assignment submission form also requires a publicly accessible CV link.

All submission links should be tested in a private/incognito browser window to confirm they work without requiring a sign-in or access request.

---

## 14. License

This project is distributed under the MIT License.

See [LICENSE](LICENSE) for details.

---

**WalledGuard DLP v2.3 — Standalone GenAI Data Loss Prevention Desktop Application**

Built using Electron, Node.js, managed Google Chrome, Chrome DevTools Protocol, PDF.js, and Tesseract.js.
