# vault2fa

> A modern, zero-knowledge, local-first 2FA/TOTP authenticator PWA built with Svelte 5 and WebAssembly encryption.

[![Version](https://img.shields.io/github/package-json/v/ii2d/vault2fa?color=blue)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Svelte 5](https://img.shields.io/badge/Svelte-5.0-orange?logo=svelte)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PWA](https://img.shields.io/badge/PWA-Offline%20First-emerald?logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

🌐 **Live App**: [https://2fa.ii2d.com](https://2fa.ii2d.com)

---

## ✨ Features

- 🔒 **Zero-Knowledge Encryption**: Argon2id WASM key derivation + hardware-accelerated AES-256-GCM (`crypto.subtle`).
- ⚡ **Ultra-Fast (Svelte 5)**: Lightweight footprint with fine-grained reactivity and instant app startup.
- 📱 **Offline PWA**: Full offline functionality and installable on iOS, Android, macOS, Windows, and Linux.
- 🔑 **Hardware-Backed Biometrics**: Secure Enclave unlock via WebAuthn PRF extension (Touch ID, Face ID, Windows Hello, YubiKey).
- 🔄 **Decentralized Sync**: Local File System binding (iCloud/Dropbox/Syncthing) or encrypted GitHub Gist sync with QR pairing.
- 📦 **Broad Import & Export**: One-click import from Google Authenticator, Aegis, Bitwarden, and plain URI lists, plus printable Recovery Kits.
- 🛡️ **Zero Tracking & Egress Control**: Strict Content Security Policy (CSP), zero telemetry, sanitized backup exports, and zero server dependencies.

---

## 🛠️ Tech Stack

- **Framework**: [Svelte 5](https://svelte.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Cryptography**: Native Web Crypto API (AES-256-GCM, HKDF), WebAuthn PRF & [`hash-wasm`](https://github.com/Daninet/hash-wasm) (Argon2id)
- **TOTP Engine**: [`otpauth`](https://github.com/hectorm/otpauth)
- **Storage**: Sandboxed IndexedDB via [`dexie`](https://dexie.org/)
- **PWA**: [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ii2d/vault2fa.git
cd vault2fa

# 2. Install dependencies
pnpm install

# 3. Start dev server
pnpm run dev
```

### ⚙️ Custom Branding & Configuration

Copy `.env.example` to `.env` to customize branding and links without editing source code:

```bash
VITE_APP_NAME="Vault2FA"
VITE_APP_TITLE="Zero-Knowledge TOTP Authenticator"
VITE_APP_DESCRIPTION="Privacy-first 2FA authenticator"
VITE_APP_URL="https://2fa.ii2d.com"
VITE_APP_REPO_URL="https://github.com/ii2d/vault2fa"
```

To deploy your own copy for free on **GitHub Pages**, fork the repo and enable GitHub Actions under **Settings > Pages**.

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
