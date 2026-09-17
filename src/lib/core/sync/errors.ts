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

/**
 * Error thrown when a remote GitHub Gist has different key derivation salt / credentials
 * than the currently active vault.
 */
export class GistSaltMismatchError extends Error {
  readonly gistId: string;
  readonly token: string;

  constructor(gistId: string, token: string, message?: string) {
    super(
      message ||
        `The GitHub Gist "${gistId}" was encrypted with different security credentials (salt mismatch). Password required to unlock and adopt.`,
    );
    this.name = 'GistSaltMismatchError';
    this.gistId = gistId;
    this.token = token;
    Object.setPrototypeOf(this, GistSaltMismatchError.prototype);
  }
}
