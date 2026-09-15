import { describe, it, expect } from 'vitest';
import { encodeAirGapFrames, parseAirGapFrame, AirGapDecoder } from './air-gap';
import type { EncryptedVaultPayload } from '$lib/types';

describe('Air-Gap Animated QR Transfer Protocol', () => {
  const samplePayload: EncryptedVaultPayload = {
    format: 'vault2fa-v1',
    kdf: {
      algorithm: 'Argon2id',
      iterations: 3,
      memoryKiB: 65536,
      parallelism: 4,
      salt: 'c2FsdA==',
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      iv: 'aXZpdg==',
      tagLength: 128,
    },
    ciphertext:
      'LoremIpsumDolorSitAmetConsecteturAdipiscingElitSedDoEiusmodTemporIncididuntUtLaboreEtDoloreMagnaAliquaUtEnimAdMinimVeniamQuisNostrudExercitationUllamcoLaborisNisiUtAliquipExEaCommodoConsequatDuisAuteIrureDolorInReprehenderitInVoluptateVelitEsseCillumDoloreEuFugiatNullaPariatur',
  };

  it('encodes payload into small chunks with sequence metadata', () => {
    const frames = encodeAirGapFrames(samplePayload, 50);
    expect(frames.length).toBeGreaterThan(5);

    // Verify first and last frame headers
    expect(frames[0]).toMatch(/^v2fa\|v1\|1\/\d+\|/);
    const last = frames[frames.length - 1];
    expect(last).toMatch(new RegExp(`^v2fa\\|v1\\|${frames.length}\\/${frames.length}\\|`));
  });

  it('parses valid air gap frame headers correctly', () => {
    const parsed = parseAirGapFrame('v2fa|v1|3/10|chunkdata123');
    expect(parsed).not.toBeNull();
    expect(parsed?.seq).toBe(3);
    expect(parsed?.total).toBe(10);
    expect(parsed?.chunk).toBe('chunkdata123');
  });

  it('rejects invalid frame formats', () => {
    expect(parseAirGapFrame('otpauth://totp/test')).toBeNull();
    expect(parseAirGapFrame('v2fa|v1|invalid|chunk')).toBeNull();
    expect(parseAirGapFrame('v2fa|v1|5/3|chunk')).toBeNull(); // seq > total
    expect(parseAirGapFrame('v2fa|v1|0/5|chunk')).toBeNull(); // seq < 1
  });

  it('reassembles out-of-order and duplicated frames accurately', () => {
    const frames = encodeAirGapFrames(samplePayload, 40);
    const decoder = new AirGapDecoder();

    // Shuffle frames
    const shuffled = [...frames].sort(() => Math.random() - 0.5);

    let finalProgress;
    for (const frame of shuffled) {
      // Feed duplicate
      decoder.feed(frame);
      finalProgress = decoder.feed(frame);
    }

    expect(finalProgress?.status).toBe('complete');
    expect(finalProgress?.percent).toBe(100);
    expect(finalProgress?.payload).toEqual(samplePayload);
  });

  it('handles decoder reset when a new transmission with different total arrives', () => {
    const decoder = new AirGapDecoder();
    decoder.feed('v2fa|v1|1/10|chunk1');
    decoder.feed('v2fa|v1|2/10|chunk2');

    // New transmission with total 3 arrives
    const res = decoder.feed('v2fa|v1|1/3|newchunk');
    expect(res.received).toBe(1);
    expect(res.total).toBe(3);
  });
});
