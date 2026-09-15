import { db } from '$lib/core/storage';
import { base64ToUint8Array, generateRandomBytes, uint8ArrayToBase64 } from './utils';

const BIOMETRIC_KEY_LENGTH = 32;

/**
 * Checks if platform biometric authentication (Touch ID, Face ID, Windows Hello) is available.
 */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Checks if a biometric credential is already configured in IndexedDB.
 */
export async function hasBiometricCredential(): Promise<boolean> {
  const count = await db.biometrics.count();
  return count > 0;
}

/**
 * Registers a platform WebAuthn credential and stores the encrypted master key in IndexedDB.
 */
export async function registerBiometricUnlock(masterKey: Uint8Array): Promise<boolean> {
  if (!(await isBiometricsAvailable())) {
    throw new Error('Biometric platform authenticator is not available on this device');
  }

  const challenge = generateRandomBytes(32);
  const userId = generateRandomBytes(16);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rp: { name: 'vault2fa' },
      user: {
        id: userId as unknown as BufferSource,
        name: 'vault2fa-user',
        displayName: 'vault2fa Master Account',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    return false;
  }

  // Derive a device wrapping key using Web Crypto
  const deviceSalt = generateRandomBytes(16);
  const rawIdBytes = new Uint8Array(credential.rawId);
  const wrappingKeyMaterial = await crypto.subtle.importKey(
    'raw',
    rawIdBytes.slice(0, 32) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: deviceSalt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    wrappingKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const iv = generateRandomBytes(12);
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    wrappingKey,
    masterKey as unknown as BufferSource,
  );

  await db.biometrics.put({
    id: 'primary',
    credentialId: credential.id,
    wrappedKey: uint8ArrayToBase64(new Uint8Array(wrappedBuffer)),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(deviceSalt),
    createdAt: Date.now(),
  });

  return true;
}

/**
 * Authenticates with platform biometrics and unwraps the master key.
 */
export async function authenticateWithBiometrics(): Promise<Uint8Array | null> {
  const record = await db.biometrics.get('primary');
  if (!record) return null;

  const challenge = generateRandomBytes(32);
  const rawCredentialId = base64ToUint8Array(record.credentialId);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      allowCredentials: [
        {
          id: rawCredentialId as unknown as BufferSource,
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) return null;

  const rawIdBytes = new Uint8Array(assertion.rawId);
  const deviceSalt = base64ToUint8Array(record.salt);

  const wrappingKeyMaterial = await crypto.subtle.importKey(
    'raw',
    rawIdBytes.slice(0, BIOMETRIC_KEY_LENGTH) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: deviceSalt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    wrappingKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const iv = base64ToUint8Array(record.iv);
  const wrappedKeyBytes = base64ToUint8Array(record.wrappedKey);

  const masterKeyBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    wrappingKey,
    wrappedKeyBytes as unknown as BufferSource,
  );

  return new Uint8Array(masterKeyBuffer);
}

/**
 * Removes the biometric credential from IndexedDB.
 */
export async function removeBiometricUnlock(): Promise<void> {
  await db.biometrics.clear();
}
