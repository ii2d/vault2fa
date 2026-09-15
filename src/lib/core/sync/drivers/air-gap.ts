import type { EncryptedVaultPayload } from '$lib/types';

export const AIR_GAP_PROTOCOL_PREFIX = 'v2fa|v1|';
export const DEFAULT_AIR_GAP_CHUNK_SIZE = 280;

export interface AirGapProgress {
  status: 'progress' | 'complete' | 'invalid';
  received: number;
  total: number;
  percent: number;
  payload?: EncryptedVaultPayload;
}

/**
 * Splits an encrypted vault payload into ordered, framed strings for animated QR transmission.
 */
export function encodeAirGapFrames(
  payload: EncryptedVaultPayload,
  chunkSize = DEFAULT_AIR_GAP_CHUNK_SIZE,
): string[] {
  const json = JSON.stringify(payload);
  const totalChunks = Math.ceil(json.length / chunkSize);
  const frames: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunk = json.slice(i * chunkSize, (i + 1) * chunkSize);
    const seq = i + 1;
    frames.push(`${AIR_GAP_PROTOCOL_PREFIX}${seq}/${totalChunks}|${chunk}`);
  }

  return frames;
}

/**
 * Parses a single frame string. Returns sequence, total, and chunk content, or null if invalid.
 */
export function parseAirGapFrame(
  raw: string,
): { seq: number; total: number; chunk: string } | null {
  if (!raw.startsWith(AIR_GAP_PROTOCOL_PREFIX)) {
    return null;
  }

  const remainder = raw.slice(AIR_GAP_PROTOCOL_PREFIX.length);
  const pipeIndex = remainder.indexOf('|');
  if (pipeIndex === -1) {
    return null;
  }

  const header = remainder.slice(0, pipeIndex);
  const chunk = remainder.slice(pipeIndex + 1);

  const parts = header.split('/');
  if (parts.length !== 2) {
    return null;
  }

  const seq = parseInt(parts[0], 10);
  const total = parseInt(parts[1], 10);

  if (isNaN(seq) || isNaN(total) || seq < 1 || seq > total || total < 1) {
    return null;
  }

  return { seq, total, chunk };
}

/**
 * Stateful decoder that accumulates out-of-order QR frames and reassembles the full encrypted payload.
 */
export class AirGapDecoder {
  private chunks = new Map<number, string>();
  private expectedTotal: number | null = null;

  /**
   * Resets the accumulator state.
   */
  reset(): void {
    this.chunks.clear();
    this.expectedTotal = null;
  }

  /**
   * Feeds a scanned QR code text into the decoder.
   */
  feed(rawText: string): AirGapProgress {
    const parsed = parseAirGapFrame(rawText);
    if (!parsed) {
      return {
        status: 'invalid',
        received: this.chunks.size,
        total: this.expectedTotal ?? 0,
        percent: this.expectedTotal ? Math.round((this.chunks.size / this.expectedTotal) * 100) : 0,
      };
    }

    // If total changed, reset accumulator for new transfer
    if (this.expectedTotal !== null && this.expectedTotal !== parsed.total) {
      this.reset();
    }

    this.expectedTotal = parsed.total;
    this.chunks.set(parsed.seq, parsed.chunk);

    const received = this.chunks.size;
    const total = this.expectedTotal;
    const percent = Math.round((received / total) * 100);

    if (received === total) {
      // Reassemble chunks in sequential order
      const assembledJson = Array.from(
        { length: total },
        (_, i) => this.chunks.get(i + 1) ?? '',
      ).join('');

      try {
        const payload = JSON.parse(assembledJson) as EncryptedVaultPayload;
        if (payload.format !== 'vault2fa-v1' || !payload.ciphertext) {
          return { status: 'invalid', received, total, percent };
        }
        return {
          status: 'complete',
          received,
          total,
          percent: 100,
          payload,
        };
      } catch {
        return { status: 'invalid', received, total, percent };
      }
    }

    return {
      status: 'progress',
      received,
      total,
      percent,
    };
  }
}
