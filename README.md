# vault2fa

> A modern, zero-backend, local-first 2FA/TOTP authenticator PWA built with Svelte 5, hardware-backed security, WebAssembly encryption, and decentralized sync options.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Svelte 5](https://img.shields.io/badge/Svelte-5.0-orange?logo=svelte)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20First-green?logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Zero Backend](https://img.shields.io/badge/Architecture-100%25%20Serverless-purple)](<>)

---

## 🌟 Overview

`vault2fa` is a privacy-first, zero-knowledge Two-Factor Authentication (2FA) client. Built with **Svelte 5** and compiling down to pure, highly optimized native JavaScript, `vault2fa` provides native-grade responsiveness and sub-second startup times while running entirely inside your browser sandbox as an offline-first Progressive Web App (PWA).

Your secrets **never touch any third-party servers unencrypted**. You retain complete custody of your keys with flexible backup options ranging from local directory binding to GitHub Gist and air-gapped animated QR transmission.

---

## ✨ Key Features

- ⚡ **Ultra-Fast & Lightweight (Svelte 5)**:
  - Zero Virtual DOM overhead. Svelte 5 Runes provide fine-grained signal reactivity for butter-smooth countdown rings and clock-drift corrections.
  - Featherweight bundle size ensures instant app launch and rapid PWA caching.
- 🔒 **Zero-Knowledge & End-to-End Encryption (E2EE)**:
  - Key derivation powered by **Argon2id (WebAssembly)** for high resistance against brute-force and GPU cracking attacks.
  - Vault payloads encrypted locally using **AES-256-GCM** via the browser's hardware-accelerated Web Crypto API.
- 🌐 **100% Client-Side & Zero-Backend**:
  - Pure static web architecture. Can be hosted for free on GitHub Pages, Cloudflare Pages, or Vercel.
  - Zero telemetry, zero analytics tracking, and zero central database dependencies.
- 📱 **PWA & Offline-First**:
  - Operates fully offline without network connectivity.
  - Installable as a standalone app on desktop (macOS, Windows, Linux) and mobile (iOS, Android).
- 🔑 **Hardware-Backed Unlock (WebAuthn / Passkey)**:
  - Instant vault unlock using biometric sensors (Touch ID, Face ID, Windows Hello) or FIDO2 hardware security keys (YubiKey).
- 📁 **Local File System Access API**:
  - Direct bidirectional binding to a local file (`vault.enc`).
  - Sync across devices seamlessly using your existing iCloud Drive, OneDrive, Syncthing, or Dropbox folders without OAuth configurations.
- 🐙 **Encrypted GitHub Gist Sync**:
  - Optional automatic synchronization to a private GitHub Gist with full Git commit history for effortless version rollbacks.
- 📷 **Air-Gapped Cross-Device Sync**:
  - Transfer entire encrypted vaults across devices completely offline using high-density **animated QR codes (UR / multi-frame)**.
- 🔄 **Wide Ecosystem Compatibility**:
  - One-click import from **Google Authenticator** (`otpauth-migration://` QR / Protobuf).
  - Import/Export support for **Aegis Authenticator**, **Bitwarden**, and standard `otpauth://` URIs.

---

## 🗺️ Roadmap & Feature Plan

### Phase 1: Core Foundation & Security (MVP)

- [ ] Initialize Svelte 5 + Vite + Tailwind CSS + `shadcn-svelte` structure.
- [ ] Implement RFC 6238 TOTP / RFC 4226 HOTP core calculation engine (`otpauth`).
- [ ] Argon2id WebAssembly key derivation + AES-256-GCM encryption pipeline (`hash-wasm` + Web Crypto API).
- [ ] Local storage persistence with IndexedDB (`dexie.js`).
- [ ] Master password creation, session timer, and vault auto-locking.
- [ ] Camera scanner & manual entry for standard `otpauth://` URIs.

### Phase 2: Interoperability & Hardware Auth

- [ ] Google Authenticator migration payload parser (Protobuf deserialization).
- [ ] Aegis Authenticator JSON import/export (encrypted & unencrypted).
- [ ] WebAuthn / Passkey integration for biometric vault unlock (Touch ID / Face ID / Windows Hello).
- [ ] PWA Service Worker caching for seamless offline usage (`@vite-pwa/svelte`).

### Phase 3: Decentralized Sync & Backup

- [ ] Native File System Access API integration (read/write local `.vault` file).
- [ ] GitHub Gist sync driver (using scoped Personal Access Tokens).
- [ ] Air-gapped vault transfer via animated frame-by-frame QR codes.
- [ ] Entry-level tombstone & conflict-resolution logic for multi-device sync.

### Phase 4: Extended Cloud & UX Polish

- [ ] WebDAV storage driver (for Nextcloud, ownCloud, and NAS users).
- [ ] Dropbox integration via PKCE OAuth flow (App Folder sandbox).
- [ ] Emergency Recovery Kit generation (downloadable/printable PDF).
- [ ] Encrypted multi-folder categorization and tags.

---

## 🛠️ Tech Stack

- **Framework**: [Svelte 5](https://svelte.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling & UI**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn-svelte](https://shadcn-svelte.com/)
- **Reactivity & State**: Svelte 5 Native Runes (`$state`, `$derived`, `.svelte.ts` modules)
- **Cryptographic Primitives**: Native `crypto.subtle` (AES-256-GCM) & [`hash-wasm`](https://github.com/Daninet/hash-wasm) (Argon2id WASM)
- **TOTP Engine**: [`otpauth`](https://github.com/hectorm/otpauth)
- **Local Storage**: IndexedDB via [`dexie`](https://dexie.org/)
- **PWA Engine**: [`@vite-pwa/svelte`](https://vite-pwa-org.netlify.app/)
- **QR & Camera**: [`@zxing/browser`](https://github.com/zxing-js/browser) + [`qrcode`](https://github.com/soldair/node-qrcode)

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm / pnpm / yarn / bun

### Installation

```bash
# Clone the repository
git clone https://github.com/ii2d/vault2fa.git
cd vault2fa

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Production Build

```bash
npm run build
```

The compiled assets will be placed in the `dist/` directory, ready to be served statically.

---

## 🚢 Deployment

Because `vault2fa` has no server dependencies, you can deploy it in seconds:

### GitHub Pages

1. Push your repository to GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment > Source**, select **GitHub Actions** (using the default Vite/Static Pages workflow).

### Cloudflare Pages / Vercel

- **Build Command**: `npm run build`
- **Output Directory**: `dist`

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

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
