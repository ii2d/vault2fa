/**
 * Error thrown when a local or remote vault file has different key derivation salt / credentials
 * than the currently active vault.
 */
export class VaultSaltMismatchError extends Error {
  readonly fileName: string;
  readonly handle: FileSystemFileHandle;

  constructor(fileName: string, handle: FileSystemFileHandle, message?: string) {
    super(
      message ||
        `The file "${fileName}" was encrypted with different security credentials (salt mismatch). Password required to unlock and adopt.`,
    );
    this.name = 'VaultSaltMismatchError';
    this.fileName = fileName;
    this.handle = handle;
    Object.setPrototypeOf(this, VaultSaltMismatchError.prototype);
  }
}
