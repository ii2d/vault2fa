declare const __APP_VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const APP_CONFIG = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0',
  buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
  name: import.meta.env.VITE_APP_NAME || 'Vault2FA',
  title: import.meta.env.VITE_APP_TITLE || 'Zero-Knowledge TOTP Authenticator',
  subtitle: import.meta.env.VITE_APP_SUBTITLE || 'Zero-Knowledge TOTP',
  description:
    import.meta.env.VITE_APP_DESCRIPTION ||
    'Privacy-first, zero-knowledge, local-first 2FA/TOTP authenticator PWA',
  repoUrl: import.meta.env.VITE_APP_REPO_URL || 'https://github.com/ii2d/vault2fa',
  themeColor: import.meta.env.VITE_APP_THEME_COLOR || '#09090b',

  /**
   * Resolves the current application URL dynamically (browser origin -> env var -> fallback).
   */
  get origin(): string {
    if (
      typeof window !== 'undefined' &&
      window.location.origin &&
      window.location.origin !== 'null'
    ) {
      return window.location.origin;
    }
    return import.meta.env.VITE_APP_URL || 'https://2fa.ii2d.com';
  },

  /**
   * Resolves the current hostname dynamically for display and QR labels.
   */
  get hostname(): string {
    if (typeof window !== 'undefined' && window.location.hostname) {
      return window.location.hostname;
    }
    const rawUrl = import.meta.env.VITE_APP_URL || 'https://2fa.ii2d.com';
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return '2fa.ii2d.com';
    }
  },
};
