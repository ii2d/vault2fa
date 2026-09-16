/**
 * PWA Installation Store
 * Manages beforeinstallprompt events, standalone detection, and iOS install instructions.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export class PwaInstallStore {
  deferredPrompt = $state.raw<BeforeInstallPromptEvent | null>(null);
  canInstall = $state(false);
  isInstalled = $state(false);
  isIOS = $state(false);
  isInstallGuideOpen = $state(false);

  constructor() {
    this.checkEnvironment();
  }

  private checkEnvironment() {
    if (typeof window === 'undefined') return;

    // Check if running as standalone PWA
    const isStandalone =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as unknown as { standalone?: boolean })?.standalone === true;

    this.isInstalled = isStandalone;

    // Check if device is iOS (iPhone/iPad/iPod or iPadOS with desktop UA)
    const ua = window.navigator.userAgent || '';
    const isIOSDevice =
      /iphone|ipad|ipod/i.test(ua) ||
      (window.navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));

    this.isIOS = isIOSDevice;

    // If already installed, cannot install again
    if (this.isInstalled) {
      this.canInstall = false;
    }
  }

  /**
   * Initializes browser event listeners for PWA installation lifecycle.
   */
  init() {
    if (typeof window === 'undefined') return;

    this.checkEnvironment();

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall = true;
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall = false;
      this.isInstalled = true;
      this.isInstallGuideOpen = false;
    });
  }

  /**
   * Triggers the native installation prompt if available, or opens the install guide modal.
   */
  async promptInstall(): Promise<boolean> {
    if (this.deferredPrompt) {
      try {
        await this.deferredPrompt.prompt();
        const choice = await this.deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          this.isInstalled = true;
          this.canInstall = false;
          this.deferredPrompt = null;
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to trigger PWA install prompt:', err);
        this.openGuide();
        return false;
      }
    } else {
      // If no native deferred prompt is available (e.g. iOS or manual browser), open guide modal
      this.openGuide();
      return false;
    }
  }

  openGuide() {
    this.isInstallGuideOpen = true;
  }

  closeGuide() {
    this.isInstallGuideOpen = false;
  }
}

export const pwaInstall = new PwaInstallStore();
