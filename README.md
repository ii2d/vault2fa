# vault2fa

> A modern, zero-backend, local-first 2FA/TOTP authenticator PWA built with Svelte 5, hardware-backed security, WebAssembly encryption, and decentralized sync options.

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Svelte 5](https://img.shields.io/badge/Svelte-5.0-orange?logo=svelte)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20First-emerald?logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Zero Backend](https://img.shields.io/badge/Architecture-100%25%20Client--Side-purple)](<>)

🌐 **Live Application**: [https://2fa.ii2d.com](https://2fa.ii2d.com)

---

## 🌟 Overview & About

`vault2fa` is a privacy-first, zero-knowledge Two-Factor Authentication (2FA) client. Built with **Svelte 5** and compiling down to pure, highly optimized native JavaScript, `vault2fa` provides native-grade responsiveness and sub-second startup times while running entirely inside your browser sandbox as an offline-first Progressive Web App (PWA).

Your secrets **never touch any third-party servers unencrypted**. You retain complete custody of your keys with flexible backup options ranging from local directory binding to encrypted GitHub Gist synchronization.

### 📋 Technical Specifications (About)

| Attribute                | Specification                                                                    |
| :----------------------- | :------------------------------------------------------------------------------- |
| **Version**              | `0.1.0` _(defined in [`package.json`](package.json))_                            |
| **Key Derivation**       | Argon2id WebAssembly (64 MB memory, 3 iterations, cryptographically random salt) |
| **Vault Encryption**     | Authenticated AES-256-GCM via native hardware `crypto.subtle` (Web Crypto API)   |
| **Local Persistence**    | Sandboxed IndexedDB via Dexie.js (zero plaintext disk writes)                    |
| **Telemetry & Tracking** | **0%** — strictly serverless, zero analytics, zero external network requests     |
| **Biometric Auth**       | Hardware-backed WebAuthn / Passkey (Touch ID, Face ID, Windows Hello, YubiKey)   |
| **Target Platforms**     | Mobile (iOS, Android), Desktop (macOS, Windows, Linux) via standalone PWA        |

---

## ✨ Key Features

- ⚡ **Ultra-Fast & Lightweight (Svelte 5)**:
  - Zero Virtual DOM overhead. Svelte 5 Runes provide fine-grained signal reactivity for butter-smooth countdown rings and clock-drift corrections.
  - Featherweight bundle size ensures instant app launch and rapid PWA caching.
- 🔒 **Zero-Knowledge & End-to-End Encryption (E2EE)**:
  - Key derivation powered by **Argon2id (WebAssembly)** for maximum resistance against brute-force and GPU cracking attacks.
  - Vault payloads encrypted locally using **AES-256-GCM** via the browser's hardware-accelerated Web Crypto API.
- 📱 **PWA & Offline-First**:
  - Operates fully offline without network connectivity.
  - Installable as a standalone app on desktop (macOS, Windows, Linux) and mobile (iOS, Android) with dedicated installation guides.
- 📱 **Mobile Optimized UI**:
  - Compact header with quick-action top bar and full-width search.
  - Mobile dropdown category selector with hidden scrollbar utilities for seamless navigation.
- 🔑 **Hardware-Backed Unlock (WebAuthn / Passkey)**:
  - Instant vault unlock using biometric sensors (Touch ID, Face ID, Windows Hello) or FIDO2 hardware security keys (YubiKey).
- 📁 **Local File System Access API**:
  - Direct bidirectional binding to a local file (`vault.enc`).
  - Sync across devices seamlessly using your existing iCloud Drive, OneDrive, Syncthing, or Dropbox folders without third-party cloud configurations.
- 🐙 **Encrypted GitHub Gist Sync & QR Pairing**:
  - Optional automatic synchronization to a private GitHub Gist with full Git commit history for effortless version rollbacks.
  - One-click QR code device pairing to effortlessly link secondary devices.
- 🔄 **Wide Ecosystem Compatibility**:
  - One-click import from **Google Authenticator** (`otpauth-migration://` QR / Protobuf).
  - Import/Export support for **Aegis Authenticator**, **Bitwarden**, and standard `otpauth://` URIs.
- 📄 **Emergency Recovery Kit**:
  - Printable disaster recovery document with QR backup codes and passphrase area.

---

## 🗺️ Roadmap & Feature Plan

### Phase 1: Core Foundation & Security (MVP)

- [x] Svelte 5 + Vite + Tailwind CSS + shadcn-svelte architecture.
- [x] RFC 6238 TOTP / RFC 4226 HOTP core calculation engine (`otpauth`).
- [x] Argon2id WebAssembly key derivation + AES-256-GCM encryption pipeline (`hash-wasm` + Web Crypto API).
- [x] Local storage persistence with IndexedDB (`dexie.js`).
- [x] Master password creation, session timer, and vault auto-locking.
- [x] Camera scanner & manual entry for standard `otpauth://` URIs.

### Phase 2: Interoperability & Hardware Auth

- [x] Google Authenticator migration payload parser (Protobuf deserialization).
- [x] Aegis Authenticator JSON import/export (encrypted & unencrypted).
- [x] Plain text / multiline `otpauth://` URI list batch import & export (.txt).
- [x] WebAuthn / Passkey integration for biometric vault unlock (Touch ID / Face ID / Windows Hello).
- [x] PWA Service Worker caching for seamless offline usage (`vite-plugin-pwa`).

### Phase 3: Decentralized Sync & Backup

- [x] Native File System Access API integration (read/write local `.vault` file).
- [x] GitHub Gist sync driver (using scoped Personal Access Tokens).
- [x] Gist configuration QR pairing and sharing.
- [x] Entry-level tombstone & conflict-resolution logic for multi-device sync.

### Phase 4: Emergency Recovery Kit & UX Polish

- [x] Emergency Recovery Kit generation (Printable / PDF disaster recovery document with QR & handwritten passphrase area).
- [x] Encrypted multi-folder categorization, pinned tokens, and tag search filters.
- [x] Power-user keyboard shortcuts (`⌘K` / `/` search focus, `⌘N` add token, `Esc` dismiss).
- [x] Subtle mobile haptic feedback on TOTP token copy (`navigator.vibrate`).
- [x] Standalone PWA install prompts and platform guides (iOS, Android, Desktop).
- [x] Dedicated Privacy Policy & User Guide modals accessible directly from auth and settings screens.
- [x] Fully customizable branding via environment variables and GitHub Actions.

---

## 🛠️ Tech Stack

- **Framework**: [Svelte 5](https://svelte.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling & UI**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Reactivity & State**: Svelte 5 Native Runes (`$state`, `$derived`, `.svelte.ts` modules)
- **Cryptographic Primitives**: Native `crypto.subtle` (AES-256-GCM) & [`hash-wasm`](https://github.com/Daninet/hash-wasm) (Argon2id WASM)
- **TOTP Engine**: [`otpauth`](https://github.com/hectorm/otpauth)
- **Local Storage**: IndexedDB via [`dexie`](https://dexie.org/)
- **PWA Engine**: [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
- **QR & Camera**: [`@zxing/browser`](https://github.com/zxing-js/browser)

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended), npm, yarn, or bun

### Installation

```bash
# 1. Clone the repository (or your fork)
git clone https://github.com/ii2d/vault2fa.git
cd vault2fa

# 2. Copy environment template (optional)
cp .env.example .env

# 3. Install dependencies
pnpm install

# 4. Start local development server
pnpm run dev
```

### ⚙️ Custom Branding & Configuration

You can customize app branding, titles, domains, and repository links without modifying the source code. Copy `.env.example` to `.env` and set your preferred values:

```bash
# Application Branding
VITE_APP_NAME="vault2fa"
VITE_APP_TITLE="Zero-Knowledge TOTP Authenticator"
VITE_APP_SUBTITLE="Zero-Knowledge TOTP"
VITE_APP_DESCRIPTION="Privacy-first, zero-knowledge, local-first 2FA/TOTP authenticator PWA"

# URLs & Repository (defaults to dynamic browser origin if empty)
VITE_APP_URL="https://2fa.ii2d.com"
VITE_APP_REPO_URL="https://github.com/ii2d/vault2fa"

# Theme & Colors
VITE_APP_THEME_COLOR="#09090b"
```

To customize icons, simply replace `public/favicon.svg`, `public/icon.svg`, and `public/apple-touch-icon.png` with your own assets.

### Production Build

```bash
pnpm run build
```

The compiled assets will be placed in the `dist/` directory, ready to be served statically.

---

## 🚢 Deployment

Because `vault2fa` is 100% client-side with no server dependencies, you can deploy it in seconds:

### GitHub Pages (For Forks & Clones)

1. Fork or clone this repository to your GitHub account.
2. (Optional) Go to **Settings > Secrets and variables > Actions > Variables** in your GitHub repository and define custom variables like `VITE_APP_NAME`, `VITE_APP_TITLE`, `VITE_APP_URL`, etc. By default, `VITE_APP_REPO_URL` automatically points to your repository!
3. Go to **Settings > Pages**.
4. Under **Build and deployment > Source**, select **GitHub Actions**.
5. Push a commit to `main` (or run the workflow manually under the **Actions** tab).

### Cloudflare Pages / Vercel / Netlify

- **Framework Preset**: Vite
- **Build Command**: `pnpm run build`
- **Output Directory**: `dist`
- **Environment Variables**: Configure any `VITE_APP_*` variables in the platform dashboard.

---

## 🛡️ Security Architecture

1. **Zero Knowledge**: All data stored locally or synced remotely is an encrypted ciphertext blob. The master encryption key never leaves browser memory.
2. **Key Derivation**:
   $$\text{Master Key} = \text{Argon2id}(\text{Password}, \text{Salt}, \text{Memory}=64\text{MB}, \text{Iterations}=3)$$
3. **Vault Encryption**:
   $$\text{Ciphertext} = \text{AES-256-GCM}(\text{Vault JSON}, \text{Master Key}, \text{IV})$$
4. **Memory Hygiene**: Svelte's direct object lifecycle makes clearing sensitive keys straightforward. Decrypted secrets and active keys in memory are discarded immediately when the tab closes or after an idle timeout.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
