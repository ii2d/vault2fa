import { db } from '$lib/core/storage';
import { APP_CONFIG } from '$lib/config';
import { base64ToUint8Array, generateRandomBytes, uint8ArrayToBase64 } from './utils';

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
 * Checks if the browser or authenticator supports the WebAuthn PRF extension.
 */
export async function isPrfSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    if (
      'getClientCapabilities' in PublicKeyCredential &&
      typeof (
        PublicKeyCredential as unknown as {
          getClientCapabilities?: () => Promise<Record<string, boolean>>;
        }
      ).getClientCapabilities === 'function'
    ) {
      const caps = await (
        PublicKeyCredential as unknown as {
          getClientCapabilities: () => Promise<Record<string, boolean>>;
        }
      ).getClientCapabilities();
      if (caps && typeof caps.prf === 'boolean') {
        return caps.prf;
      }
    }
  } catch {
    // getClientCapabilities not supported or threw
  }
  return true; // Default to true to allow registration attempt
}

/**
 * Checks if a valid PRF-enabled biometric credential is configured in IndexedDB.
 */
export async function hasBiometricCredential(): Promise<boolean> {
  const record = await db.biometrics.get('primary');
  return Boolean(record && record.prfSalt);
}

/**
 * Registers a platform WebAuthn credential with the PRF extension and encrypts the master key.
 * The encryption key is derived securely by the authenticator's hardware and is never stored.
 */
export async function registerBiometricUnlock(masterKey: Uint8Array): Promise<boolean> {
  if (!(await isBiometricsAvailable())) {
    throw new Error('Biometric platform authenticator is not available on this device.');
  }

  const challenge = generateRandomBytes(32);
  const userId = generateRandomBytes(16);
  const prfSalt = generateRandomBytes(32);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rp: { name: APP_CONFIG.name },
      user: {
        id: userId as unknown as BufferSource,
        name: 'vault2fa-user',
        displayName: `${APP_CONFIG.name} Master Account`,
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
      extensions: {
        prf: {
          eval: {
            first: prfSalt as unknown as BufferSource,
          },
        },
      } as unknown as AuthenticationExtensionsClientInputs,
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    return false;
  }

  const extensionResults =
    credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
      prf?: {
        enabled?: boolean;
        results?: {
          first: ArrayBuffer;
        };
      };
    };

  if (!extensionResults?.prf?.enabled) {
    throw new Error(
      'Your platform authenticator does not support WebAuthn PRF encryption. Hardware-backed biometric unlock cannot be enabled.',
    );
  }

  let prfOutputBuffer: ArrayBuffer | undefined = extensionResults.prf.results?.first;

  // Some browsers/authenticators report enabled=true during registration but only evaluate PRF on assertion.
  if (!prfOutputBuffer) {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: generateRandomBytes(32) as unknown as BufferSource,
        allowCredentials: [
          {
            id: credential.rawId,
            type: 'public-key',
          },
        ],
        userVerification: 'required',
        extensions: {
          prf: {
            eval: {
              first: prfSalt as unknown as BufferSource,
            },
          },
        } as unknown as AuthenticationExtensionsClientInputs,
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification cancelled during registration.');
    }

    const getExtensionResults =
      assertion.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
        prf?: {
          results?: {
            first: ArrayBuffer;
          };
        };
      };

    prfOutputBuffer = getExtensionResults?.prf?.results?.first;
  }

  if (!prfOutputBuffer) {
    throw new Error('Failed to evaluate biometric PRF encryption key from hardware.');
  }

  const prfOutputBytes = new Uint8Array(prfOutputBuffer);
  const deviceSalt = generateRandomBytes(16);

  // Derive wrapping key using HKDF-SHA256 from hardware PRF output
  const prfKeyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutputBytes as unknown as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: deviceSalt as unknown as BufferSource,
      info: new TextEncoder().encode('vault2fa-biometric-key'),
    },
    prfKeyMaterial,
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
    credentialId: uint8ArrayToBase64(new Uint8Array(credential.rawId)),
    wrappedKey: uint8ArrayToBase64(new Uint8Array(wrappedBuffer)),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(deviceSalt),
    prfSalt: uint8ArrayToBase64(prfSalt),
    createdAt: Date.now(),
  });

  return true;
}

/**
 * Authenticates with platform biometrics using the PRF extension and unwraps the master key.
 */
export async function authenticateWithBiometrics(): Promise<Uint8Array | null> {
  const record = await db.biometrics.get('primary');
  if (!record) return null;

  if (!record.prfSalt) {
    throw new Error(
      'Biometric unlock was upgraded for enhanced security. Please unlock with your Master Password and re-enable biometrics in Settings.',
    );
  }

  const challenge = generateRandomBytes(32);
  const rawCredentialId = base64ToUint8Array(record.credentialId);
  const prfSalt = base64ToUint8Array(record.prfSalt);

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
      extensions: {
        prf: {
          eval: {
            first: prfSalt as unknown as BufferSource,
          },
        },
      } as unknown as AuthenticationExtensionsClientInputs,
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) return null;

  const extensionResults =
    assertion.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
      prf?: {
        results?: {
          first: ArrayBuffer;
        };
      };
    };

  const prfOutputBuffer = extensionResults?.prf?.results?.first;
  if (!prfOutputBuffer) {
    throw new Error('Biometric hardware did not return PRF decryption key.');
  }

  const prfOutputBytes = new Uint8Array(prfOutputBuffer);
  const deviceSalt = base64ToUint8Array(record.salt);

  const prfKeyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutputBytes as unknown as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: deviceSalt as unknown as BufferSource,
      info: new TextEncoder().encode('vault2fa-biometric-key'),
    },
    prfKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
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
