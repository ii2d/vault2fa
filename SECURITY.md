# Security Policy & Threat Model

This document outlines the security architecture, cryptographic design, threat model, and vulnerability disclosure policy for **vault2fa**.

---

## 1. Security Architecture & Cryptographic Specification

`vault2fa` is built strictly on a **zero-knowledge, local-first** architecture. All cryptographic primitives rely either on the standardized, hardware-accelerated **Web Crypto API** (`crypto.subtle`) or compiled **WebAssembly** (`hash-wasm`). Plaintext secrets never leave the client's volatile runtime memory.

```
+-------------------------------------------------------------+
|                     User Master Password                    |
+-------------------------------------------------------------+
                              |
                              v
             [ Argon2id KDF via WebAssembly ]
             - Salt: 16 bytes (crypto.getRandomValues)
             - Memory: 64 MiB (65,536 KiB)
             - Iterations (Time): 3
             - Parallelism: 1
             - Key Length: 32 bytes (256-bit)
                              |
                              v
                     [ 256-bit Master Key ]
                              |
               +--------------+---------------+
               |                              |
               v                              v
    [ AES-256-GCM Encryption ]     [ WebAuthn PRF Biometrics ]
    - 96-bit random IV per write   - Secure Enclave / TPM / FIDO2
    - 128-bit Auth Tag             - HKDF-SHA256 Key Derivation
    - Authenticated ciphertext     - Wraps Master Key at rest
               |                              |
               v                              v
    +--------------------+        +-----------------------+
    | Local Storage      |        | Encrypted Biometric   |
    | (IndexedDB via     |        | Key Envelope          |
    | Dexie)             |        +-----------------------+
    +--------------------+
```

### 1.1 Master Key Derivation (Argon2id)

- **Algorithm**: Argon2id (RFC 9106 recommended profile for password hashing and memory-hard KDF).
- **Implementation**: WebAssembly binary via [`hash-wasm`](https://github.com/Daninet/hash-wasm).
- **Parameters**:
  - Memory cost: `64 MiB` (65,536 KiB)
  - Time cost (iterations): `3`
  - Parallelism: `1` thread
  - Salt: 16 cryptographically random bytes generated via `crypto.getRandomValues()`.
  - Output Key Length: 32 bytes (256 bits).

### 1.2 Symmetric Vault Encryption (AES-256-GCM)

- **Algorithm**: AES-256-GCM (Galois/Counter Mode) via `crypto.subtle`.
- **Payload Format**: `vault2fa-v1` JSON envelope.
- **Initialization Vector (IV)**: 12 bytes (96 bits) of fresh entropy generated via `crypto.getRandomValues()` for every encryption operation. Nonces are never reused.
- **Integrity Tag**: 128-bit authentication tag appended to the ciphertext, preventing tampering, bit-flipping, or chosen-ciphertext attacks.

### 1.3 Hardware-Backed Biometric Unlock (WebAuthn PRF)

- **Extension**: WebAuthn `prf` (Pseudo-Random Function) extension.
- **Mechanism**:
  1. A platform biometric credential (Touch ID, Face ID, Windows Hello) is registered with PRF enabled and `userVerification: 'required'`.
  2. The authenticator hardware (Apple Secure Enclave, Windows Hello TPM, or Titan/YubiKey) derives an HMAC-SHA-256 output using an internal hardware secret and a per-vault 32-byte `prfSalt`.
  3. The raw PRF output is passed through **HKDF-SHA256** with a fresh 16-byte random salt and context string `'vault2fa-biometric-key'` to generate a 256-bit AES-GCM wrapping key.
  4. The master key is encrypted with this wrapping key and stored in IndexedDB.
- **Security Guarantee**: The master key can only be recovered if the user physically validates their biometric presence on that specific hardware device. The raw PRF root secret is physically locked inside the hardware authenticator and cannot be extracted by the operating system or browser.

### 1.4 Memory Hygiene & Volatile State

- Decrypted TOTP secrets exist only within the ephemeral reactive state of the running Svelte 5 application.
- When the vault is locked (manually, on tab hide, or upon auto-lock timeout):
  - The derived master key buffer is explicitly zero-overwritten using `masterKey.fill(0)` before its reference is dereferenced to `null`.
  - The in-memory decrypted store (`data`) is immediately set to `null`.
  - Plaintext TOTP timers and interval tickers are cancelled.

### 1.5 Content Security Policy (CSP) & Network Boundary

`vault2fa` operates under a strict Content Security Policy defined in `index.html`:

```http
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self' https://api.github.com ws: wss:;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
```

- **Zero Telemetry**: No third-party tracking, analytics, fonts, or external CDN scripts are loaded.
- **Strict Egress**: Outbound network requests (`connect-src`) are restricted strictly to `'self'` (local origin / dev WebSocket) and `https://api.github.com` (only invoked if GitHub Gist sync is enabled by the user).
- **Execution Sandboxing**: `object-src 'none'` prevents Flash/Java plugins; `base-uri 'self'` blocks unauthorized `<base>` injection.

---

## 2. Threat Model

We assess threats following an adversary-centric model based on realistic attack surfaces against a web application / PWA.

### 2.1 Assets Protected

1. **TOTP/HOTP Seeds**: Shared secrets used to authenticate two-factor logins.
2. **Master Password & Keys**: The master passphrase, derived Argon2id master key, and biometric wrapping keys.
3. **Third-Party Credentials**: GitHub Personal Access Tokens (PATs) used for encrypted Gist synchronization.
4. **Metadata**: Account issuers, labels, group hierarchies, and secret notes.

---

### 2.2 Threats Defended Against (In-Scope)

| Threat                                  | Adversary Profile                                                                                            | Mitigation in vault2fa                                                                                                                                                                                                                                                 |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lost or Stolen Device (At-Rest)**     | Attacker gains physical possession of a locked device and extracts the IndexedDB storage file or disk image. | **Mitigated**: All vault records in IndexedDB are stored as AES-256-GCM ciphertexts with keys derived via Argon2id (64 MiB memory-hard). Biometric credentials wrap the key via Secure Enclave / TPM WebAuthn PRF.                                                     |
| **Cloud Sync Interception / Tampering** | Attacker intercepts network traffic between device and GitHub API or reads secret Gists.                     | **Mitigated**: TLS 1.3 encryption in transit + end-to-end authenticated ciphertext (`vault2fa-v1`). GitHub only stores the ciphertext envelope; GitHub staff or unauthorized viewers cannot read secret seeds. Gist salt matching prevents replay of disparate vaults. |
| **Shoulder Surfing & Casual Viewing**   | An observer looks at the screen while the user is authenticating.                                            | **Mitigated**: OTP codes are hidden by default with clickable reveal buttons, customizable 8-second auto-mask countdowns, and an idle auto-lock timer (default: 5 minutes).                                                                                            |
| **Accidental Token Leak in Backups**    | User exports an unencrypted backup or QR kit to transfer accounts and shares it.                             | **Mitigated**: Decrypted backup exports (`exportDecryptedBackup`) automatically sanitize and scrub third-party API tokens (e.g. GitHub PAT).                                                                                                                           |
| **Data Forgery or Bit-Flipping**        | Attacker attempts to modify ciphertext stored locally or remotely.                                           | **Mitigated**: AES-256-GCM 128-bit authentication tag verifies cryptographic authenticity before parsing; any tampered byte results in a hard `DecryptionError`.                                                                                                       |

---

### 2.3 Threats Outside Scope / Inherent Limitations (Out-of-Scope)

Like any browser application or PWA, `vault2fa` relies on the host environment's baseline security. The following scenarios are explicitly out-of-scope for client-side defenses:

1. **Compromised Host / Malicious Web Server**:
   - _Threat_: If the web server or CDN hosting the application is compromised, an attacker could alter the bundled JavaScript/WASM payload delivered to the client.
   - _Recommendation_: Users requiring immunity against hosting infrastructure compromise should self-host `vault2fa` on their own trusted domain or run it locally (`git clone` + static file server / Docker).
2. **Device-Level Malware / Keyloggers / Rootkits**:
   - _Threat_: If the client operating system is infected with kernel rootkits, memory dumpers, or keyloggers, an attacker can capture keystrokes during master password entry or scrape unencrypted keys directly from browser memory while the vault is active.
   - _Recommendation_: Run on patched, secure devices with full-disk encryption and verified OS integrity.
3. **Malicious Browser Extensions**:
   - _Threat_: Extensions installed in the same browser profile with unrestricted `"tabs"` or `"all_urls"` permissions can inject scripts and read the DOM.
   - _Recommendation_: Install `vault2fa` as a standalone PWA or run in a clean browser profile free of untrusted third-party extensions.
4. **Mobile Browser Storage Eviction**:
   - _Threat_: WebKit (iOS Safari) or Chromium may evict IndexedDB storage if local disk capacity becomes critically low or if the web app is left unopened for extended periods.
   - _Mitigation & Recommendation_: `vault2fa` calls `navigator.storage.persist()`. Users should always maintain an encrypted backup (`.json`) or configure decentralized file/Gist sync.

---

### 2.4 Cryptographic Import / Export Interoperability

- **Google Authenticator**: Decodes standard `otpauth-migration://offline?data=...` Protobuf envelopes.
- **Aegis Authenticator**: Supports standard Aegis JSON import format.
- **Bitwarden**: Supports standard Bitwarden JSON export schemas.
- **Plain URI Lists**: Supports raw RFC 6238 `otpauth://totp/...` URI lists.

---

## 3. Security Audits & Status

> [!WARNING]
> `vault2fa` is free and open-source software provided under the MIT License. While its design adheres strictly to standard cryptographic best practices (RFC 9106 Argon2id, NIST SP 800-38D AES-GCM, W3C WebAuthn Level 3 PRF) and has extensive automated test coverage, **it has not yet undergone a formal, independent third-party commercial security audit**.

We welcome community peer review and responsible vulnerability disclosures from security researchers.

---

## 4. Reporting a Security Vulnerability

If you discover a security vulnerability or cryptographic weakness in `vault2fa`, **please do not open a public GitHub issue**.

Please disclose it privately using one of the following methods:

1. **GitHub Security Advisory**: Open a private draft security advisory via [GitHub Security Advisories](https://github.com/ii2d/vault2fa/security/advisories/new).
2. **Email**: Send vulnerability details directly to the project maintainers at **security@ii2d.com**.

### What to include in your report:

- A description of the vulnerability, including attack vectors and prerequisites.
- Steps to reproduce or a Proof of Concept (PoC).
- Potential impact on confidential vault data or keys.
- Browser and OS environment details.

### Maintainer Response:

- This is an independent open-source project maintained on a best-effort basis. Reports will be reviewed as soon as possible.
- Once confirmed, we will work to validate the issue, prepare a patch, and coordinate a responsible release.
