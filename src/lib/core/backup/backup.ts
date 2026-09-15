/**
 * Native Vault Backup & Restore Utilities
 * Manages encrypted and unencrypted backups, format detection, and browser downloads.
 */

import type { EncryptedVaultPayload, OTPEntry, VaultData, VaultGroup } from '$lib/types';
import { isAegisJson, parseAegisJson } from './aegis';
import {
  isPlainTextOtpList,
  parsePlainTextOtpList,
  exportToPlainTextUris,
} from '$lib/core/totp/plain-text';

export type BackupFormat =
  'vault2fa-encrypted' | 'vault2fa-decrypted' | 'aegis' | 'plain-text-uris' | 'unknown';

/**
 * Triggers a browser file download with the specified text content.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'application/json',
): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates an encrypted backup JSON string ready for download.
 */
export function exportEncryptedBackup(payload: EncryptedVaultPayload): string {
  const backupObject = {
    exportedAt: new Date().toISOString(),
    generator: 'vault2fa',
    ...payload,
  };
  return JSON.stringify(backupObject, null, 2);
}

/**
 * Generates an unencrypted backup JSON string.
 */
export function exportDecryptedBackup(vault: VaultData): string {
  const backupObject = {
    exportedAt: new Date().toISOString(),
    generator: 'vault2fa',
    warning: 'UNENCRYPTED BACKUP - STORE SECURELY',
    vault,
  };
  return JSON.stringify(backupObject, null, 2);
}

/**
 * Generates an unencrypted plain-text URI list ready for download.
 */
export function exportPlainTextBackup(vault: VaultData): string {
  return exportToPlainTextUris(vault);
}

/**
 * Detects the format of a backup file string.
 */
export function detectBackupFormat(content: string): BackupFormat {
  if (typeof content !== 'string') return 'unknown';

  // Check JSON-based formats first
  try {
    const data = JSON.parse(content);
    if (data && typeof data === 'object') {
      if (data.format === 'vault2fa-v1' && typeof data.ciphertext === 'string') {
        return 'vault2fa-encrypted';
      }

      if (data.vault?.entries && Array.isArray(data.vault.entries)) {
        return 'vault2fa-decrypted';
      }

      if (Array.isArray(data.entries) && Array.isArray(data.groups)) {
        return 'vault2fa-decrypted';
      }

      if (isAegisJson(content)) {
        return 'aegis';
      }
    }
  } catch {
    // Not valid JSON, check plain text URI list
  }

  if (isPlainTextOtpList(content)) {
    return 'plain-text-uris';
  }

  return 'unknown';
}

/**
 * Parses unencrypted backup content (either native vault2fa, Aegis, or plain text URI list).
 */
export function parseUnencryptedBackup(content: string): {
  entries: OTPEntry[];
  groups: VaultGroup[];
} {
  const format = detectBackupFormat(content);

  if (format === 'aegis') {
    return parseAegisJson(content);
  }

  if (format === 'vault2fa-decrypted') {
    const data = JSON.parse(content);
    const vault: VaultData = data.vault || data;
    return {
      entries: vault.entries || [],
      groups: vault.groups || [],
    };
  }

  if (format === 'plain-text-uris') {
    const { entries } = parsePlainTextOtpList(content);
    const now = Date.now();
    const fullEntries: OTPEntry[] = entries.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));
    return {
      entries: fullEntries,
      groups: [],
    };
  }

  throw new Error('Unsupported unencrypted backup format.');
}

/**
 * Parses and validates an encrypted vault2fa backup payload.
 */
export function parseEncryptedBackup(content: string): EncryptedVaultPayload {
  const format = detectBackupFormat(content);
  if (format !== 'vault2fa-encrypted') {
    throw new Error('File is not a valid vault2fa encrypted backup.');
  }

  const data = JSON.parse(content);
  return {
    format: data.format,
    kdf: data.kdf,
    encryption: data.encryption,
    ciphertext: data.ciphertext,
  };
}
