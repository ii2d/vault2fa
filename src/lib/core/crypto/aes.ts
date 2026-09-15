import type { EncryptedVaultPayload, KeyDerivationParams, VaultData } from '$lib/types';
import { base64ToUint8Array, generateRandomBytes, uint8ArrayToBase64 } from './utils';

export const AES_GCM_IV_LENGTH = 12; // 96-bit IV
export const AES_GCM_TAG_LENGTH = 128; // 128-bit authentication tag

export class DecryptionError extends Error {
  constructor(message = 'Decryption failed: invalid password or corrupted vault') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Imports raw 32-byte key material into a Web Crypto CryptoKey for AES-GCM.
 */
async function importCryptoKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  if (keyBytes.length !== 32) {
    throw new Error(`AES-256 requires a 32-byte key (received ${keyBytes.length} bytes)`);
  }

  return crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts VaultData into an EncryptedVaultPayload envelope using AES-256-GCM.
 */
export async function encryptVault(
  data: VaultData,
  keyBytes: Uint8Array,
  kdfParams: KeyDerivationParams,
): Promise<EncryptedVaultPayload> {
  const cryptoKey = await importCryptoKey(keyBytes);
  const iv = generateRandomBytes(AES_GCM_IV_LENGTH);

  const serialized = JSON.stringify(data);
  const encoded = new TextEncoder().encode(serialized);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: AES_GCM_TAG_LENGTH,
    },
    cryptoKey,
    encoded,
  );

  const ciphertextBytes = new Uint8Array(encryptedBuffer);

  return {
    format: 'vault2fa-v1',
    kdf: kdfParams,
    encryption: {
      algorithm: 'AES-256-GCM',
      iv: uint8ArrayToBase64(iv),
      tagLength: AES_GCM_TAG_LENGTH,
    },
    ciphertext: uint8ArrayToBase64(ciphertextBytes),
  };
}

/**
 * Decrypts an EncryptedVaultPayload envelope back into VaultData using AES-256-GCM.
 */
export async function decryptVault(
  payload: EncryptedVaultPayload,
  keyBytes: Uint8Array,
): Promise<VaultData> {
  if (payload.format !== 'vault2fa-v1') {
    throw new Error(`Unsupported vault format version: ${payload.format}`);
  }

  const cryptoKey = await importCryptoKey(keyBytes);
  const iv = base64ToUint8Array(payload.encryption.iv);
  const ciphertext = base64ToUint8Array(payload.ciphertext);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        tagLength: payload.encryption.tagLength || AES_GCM_TAG_LENGTH,
      },
      cryptoKey,
      ciphertext as unknown as BufferSource,
    );

    const decoded = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decoded) as VaultData;
  } catch {
    throw new DecryptionError();
  }
}
