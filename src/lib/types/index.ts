/**
 * vault2fa - Core Type Definitions
 * Zero-backend, local-first 2FA/TOTP authenticator
 */

export type OTPType = 'totp' | 'hotp';

export type OTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/**
 * Represents an individual 2FA OTP token entry.
 */
export interface OTPEntry {
  id: string;
  issuer: string;
  label: string;
  secret: string;
  type: OTPType;
  algorithm: OTPAlgorithm;
  digits: number;
  period: number; // TOTP interval in seconds (default 30)
  counter?: number; // HOTP counter
  groupId?: string;
  pinned?: boolean;
  tags?: string[];
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Vault grouping or folder category.
 */
export interface VaultGroup {
  id: string;
  name: string;
  icon?: string;
}

export interface VaultTombstone {
  id: string;
  deletedAt: number;
}

export interface GistSyncConfig {
  token: string;
  gistId: string;
  lastSyncedAt?: number;
  autoSync: boolean;
}

export interface LocalFileSyncConfig {
  fileName: string;
  lastSyncedAt?: number;
  autoSync: boolean;
}

/**
 * General application and vault user preferences.
 */
export interface VaultSettings {
  autoLockTimeoutMinutes: number;
  biometricUnlockEnabled: boolean;
  syncProvider: SyncProviderType;
  theme: 'dark' | 'light' | 'system';
  gistSync?: GistSyncConfig;
  localFileSync?: LocalFileSyncConfig;
}

export type SyncProviderType = 'none' | 'local-file' | 'github-gist' | 'air-gap' | 'webdav';

/**
 * Decrypted in-memory representation of the user vault.
 */
export interface VaultData {
  version: number;
  updatedAt: number;
  entries: OTPEntry[];
  groups: VaultGroup[];
  settings: VaultSettings;
  tombstones?: VaultTombstone[];
}

/**
 * Key derivation parameters for Argon2id.
 */
export interface KeyDerivationParams {
  algorithm: 'Argon2id';
  iterations: number;
  memoryKiB: number;
  parallelism: number;
  salt: string; // Base64 or hex encoded
}

/**
 * Encrypted payload envelope stored locally or synced remotely.
 */
export interface EncryptedVaultPayload {
  format: 'vault2fa-v1';
  kdf: KeyDerivationParams;
  encryption: {
    algorithm: 'AES-256-GCM';
    iv: string; // Base64 encoded initialization vector
    tagLength: number;
  };
  ciphertext: string; // Base64 encoded ciphertext
}
