import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PwaInstallStore } from './pwa-install.svelte';

describe('PwaInstallStore', () => {
  let store: PwaInstallStore;

  beforeEach(() => {
    vi.restoreAllMocks();
    store = new PwaInstallStore();
  });

  it('initializes with default states', () => {
    expect(store.canInstall).toBe(false);
    expect(store.isInstallGuideOpen).toBe(false);
  });

  it('opens and closes install guide modal', () => {
    store.openGuide();
    expect(store.isInstallGuideOpen).toBe(true);

    store.closeGuide();
    expect(store.isInstallGuideOpen).toBe(false);
  });

  it('falls back to opening guide if no native prompt is available', async () => {
    const installed = await store.promptInstall();
    expect(installed).toBe(false);
    expect(store.isInstallGuideOpen).toBe(true);
  });

  it('prompts user and updates state when native prompt is accepted', async () => {
    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const mockUserChoice = Promise.resolve({ outcome: 'accepted' as const, platform: 'web' });

    store.deferredPrompt = {
      platforms: ['web'],
      userChoice: mockUserChoice,
      prompt: mockPrompt,
    } as unknown as NonNullable<PwaInstallStore['deferredPrompt']>;
    store.canInstall = true;

    const result = await store.promptInstall();
    expect(mockPrompt).toHaveBeenCalled();
    expect(result).toBe(true);
    expect(store.isInstalled).toBe(true);
    expect(store.canInstall).toBe(false);
    expect(store.deferredPrompt).toBeNull();
  });

  it('handles beforeinstallprompt and appinstalled window events', () => {
    store.init();

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      platforms: ['web'],
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    window.dispatchEvent(mockEvent);
    expect(store.canInstall).toBe(true);
    expect(store.deferredPrompt).toBe(
      mockEvent as unknown as NonNullable<PwaInstallStore['deferredPrompt']>,
    );

    window.dispatchEvent(new Event('appinstalled'));
    expect(store.canInstall).toBe(false);
    expect(store.isInstalled).toBe(true);
    expect(store.deferredPrompt).toBeNull();
  });
});
