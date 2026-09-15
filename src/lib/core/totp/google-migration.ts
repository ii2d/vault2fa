/**
 * Google Authenticator QR Migration Payload Parser
 * Parses otpauth-migration://offline?data=... Protobuf payloads into OTPEntry records.
 */

import { Secret } from 'otpauth';
import type { OTPEntry, OTPAlgorithm, OTPType } from '$lib/types';

export interface MigrationAccount {
  name: string;
  issuer: string;
  secret: string;
  type: OTPType;
  algorithm: OTPAlgorithm;
  digits: number;
  period: number;
  counter?: number;
}

class ProtobufReader {
  private buffer: Uint8Array;
  private pos = 0;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  hasMore(): boolean {
    return this.pos < this.buffer.length;
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.buffer.length) {
      const b = this.buffer[this.pos++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) {
        return result;
      }
      shift += 7;
      if (shift >= 32) {
        // Varint exceeds 32 bits, consume trailing continuation bytes
        while (this.pos < this.buffer.length && (this.buffer[this.pos++] & 0x80) !== 0) {
          /* continue */
        }
        return result;
      }
    }
    return result;
  }

  readTag(): { fieldNumber: number; wireType: number } | null {
    if (!this.hasMore()) return null;
    const tag = this.readVarint();
    return {
      fieldNumber: tag >>> 3,
      wireType: tag & 0x07,
    };
  }

  readBytes(): Uint8Array {
    const length = this.readVarint();
    const bytes = this.buffer.slice(this.pos, this.pos + length);
    this.pos += length;
    return bytes;
  }

  readString(): string {
    const bytes = this.readBytes();
    return new TextDecoder().decode(bytes);
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.readVarint();
    } else if (wireType === 1) {
      this.pos += 8;
    } else if (wireType === 2) {
      const len = this.readVarint();
      this.pos += len;
    } else if (wireType === 5) {
      this.pos += 4;
    }
  }
}

/**
 * Checks if a string or URI is a Google Authenticator migration URL.
 */
export function isGoogleMigrationUri(uri: string): boolean {
  return typeof uri === 'string' && uri.trim().startsWith('otpauth-migration://offline');
}

/**
 * Parses an otpauth-migration:// URI into raw account definitions.
 */
export function parseGoogleMigrationUri(uri: string): MigrationAccount[] {
  const trimmed = uri.trim();
  if (!isGoogleMigrationUri(trimmed)) {
    throw new Error('Invalid migration URI. Expected scheme otpauth-migration://offline');
  }

  const url = new URL(trimmed);
  const dataParam = url.searchParams.get('data');
  if (!dataParam) {
    throw new Error('Migration URI is missing "data" parameter');
  }

  // Support base64 and url-safe base64
  const standardBase64 = dataParam.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(standardBase64);
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i);
  }

  const reader = new ProtobufReader(buffer);
  const accounts: MigrationAccount[] = [];

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    // Field 1: repeated OtpParameters otp_parameters = 1
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      const paramBytes = reader.readBytes();
      const paramReader = new ProtobufReader(paramBytes);

      let rawSecret: Uint8Array = new Uint8Array(0);
      let name = '';
      let issuer = '';
      let algoNum = 1; // 1 = SHA1
      let digitsNum = 1; // 1 = 6 digits
      let typeNum = 2; // 2 = TOTP
      let counter = 0;

      while (paramReader.hasMore()) {
        const pTag = paramReader.readTag();
        if (!pTag) break;

        switch (pTag.fieldNumber) {
          case 1: // secret (bytes)
            rawSecret = paramReader.readBytes();
            break;
          case 2: // name (string)
            name = paramReader.readString();
            break;
          case 3: // issuer (string)
            issuer = paramReader.readString();
            break;
          case 4: // algorithm (enum)
            algoNum = paramReader.readVarint();
            break;
          case 5: // digits (enum: 1=6, 2=8)
            digitsNum = paramReader.readVarint();
            break;
          case 6: // type (enum: 1=HOTP, 2=TOTP)
            typeNum = paramReader.readVarint();
            break;
          case 7: // counter (int64)
            counter = paramReader.readVarint();
            break;
          default:
            paramReader.skip(pTag.wireType);
            break;
        }
      }

      if (rawSecret.length === 0) {
        continue;
      }

      // Convert raw bytes to standard Base32
      const base32Secret = new Secret({ buffer: rawSecret.buffer }).base32;

      // Map Algorithm
      let algorithm: OTPAlgorithm = 'SHA1';
      if (algoNum === 2) algorithm = 'SHA256';
      else if (algoNum === 3) algorithm = 'SHA512';

      // Map Digits
      const digits = digitsNum === 2 ? 8 : 6;

      // Map OTP Type
      const type: OTPType = typeNum === 1 ? 'hotp' : 'totp';

      // Clean up issuer and account label
      let label = name;
      if (!issuer && name.includes(':')) {
        const parts = name.split(':');
        issuer = parts[0].trim();
        label = parts.slice(1).join(':').trim();
      } else if (name.startsWith(issuer + ':')) {
        label = name.substring(issuer.length + 1).trim();
      }

      accounts.push({
        name: label || issuer || 'Unnamed Account',
        issuer: issuer || 'Authenticator',
        secret: base32Secret,
        type,
        algorithm,
        digits,
        period: 30, // Google Authenticator standard interval
        ...(type === 'hotp' ? { counter } : {}),
      });
    } else {
      reader.skip(tag.wireType);
    }
  }

  return accounts;
}

/**
 * Converts MigrationAccount definitions into persisted OTPEntry records with an optional group assignment.
 */
export function convertMigrationAccountsToEntries(
  accounts: MigrationAccount[],
  groupId?: string,
): OTPEntry[] {
  const now = Date.now();
  return accounts.map((account) => ({
    id: crypto.randomUUID(),
    issuer: account.issuer,
    label: account.name,
    secret: account.secret,
    type: account.type,
    algorithm: account.algorithm,
    digits: account.digits,
    period: account.period,
    counter: account.counter,
    groupId,
    createdAt: now,
    updatedAt: now,
  }));
}
