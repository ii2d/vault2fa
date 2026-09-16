<script lang="ts">
  import {
    X,
    Smartphone,
    Monitor,
    Share,
    PlusSquare,
    Download,
    CheckCircle2,
    Sparkles,
    Shield,
    WifiOff,
    Fingerprint,
  } from '@lucide/svelte';
  import { pwaInstall } from '$lib/stores';
  import { APP_CONFIG } from '$lib/config';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let activePlatform = $state<'ios' | 'android' | 'desktop'>('ios');

  $effect(() => {
    if (isOpen) {
      if (pwaInstall.isIOS) {
        activePlatform = 'ios';
      } else if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
        activePlatform = 'android';
      } else {
        activePlatform = 'desktop';
      }
    }
  });

  async function handleDirectInstall() {
    await pwaInstall.promptInstall();
  }
</script>

{#if isOpen}
  <div
    class="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
  >
    <div
      class="animate-in zoom-in-95 relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 text-zinc-100 shadow-2xl duration-200"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-white/10 bg-zinc-950/80 px-6 py-4 backdrop-blur-md"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-indigo-400"
          >
            <Download class="h-5 w-5" />
          </div>
          <div>
            <h2 class="text-base font-bold text-white">Install {APP_CONFIG.name}</h2>
            <p class="text-xs text-zinc-400">Run as a standalone native app</p>
          </div>
        </div>

        <button
          type="button"
          onclick={onClose}
          aria-label="Close"
          class="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="space-y-5 overflow-y-auto p-6 text-sm">
        <!-- Direct Install Banner (if supported by browser) -->
        {#if pwaInstall.canInstall}
          <div
            class="flex flex-col items-center justify-between gap-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 to-purple-950/40 p-4 sm:flex-row"
          >
            <div class="space-y-0.5 text-center sm:text-left">
              <div
                class="flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-300 sm:justify-start"
              >
                <Sparkles class="h-3.5 w-3.5" />
                <span>One-Click Installation Ready</span>
              </div>
              <p class="text-xs text-zinc-400">Install directly into your operating system.</p>
            </div>
            <button
              type="button"
              onclick={handleDirectInstall}
              class="flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500"
            >
              <Download class="h-4 w-4" />
              <span>Install Now</span>
            </button>
          </div>
        {:else if pwaInstall.isInstalled}
          <div
            class="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-xs text-emerald-300"
          >
            <CheckCircle2 class="h-5 w-5 shrink-0 text-emerald-400" />
            <span
              >{APP_CONFIG.name} is already installed and running in standalone mode on this device.</span
            >
          </div>
        {/if}

        <!-- Platform Tabs -->
        <div class="flex rounded-xl border border-white/10 bg-zinc-950/60 p-1">
          <button
            type="button"
            onclick={() => (activePlatform = 'ios')}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition {activePlatform ===
            'ios'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'}"
          >
            <Smartphone class="h-3.5 w-3.5" />
            <span>iOS / Safari</span>
          </button>

          <button
            type="button"
            onclick={() => (activePlatform = 'android')}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition {activePlatform ===
            'android'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'}"
          >
            <Smartphone class="h-3.5 w-3.5" />
            <span>Android</span>
          </button>

          <button
            type="button"
            onclick={() => (activePlatform = 'desktop')}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition {activePlatform ===
            'desktop'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'}"
          >
            <Monitor class="h-3.5 w-3.5" />
            <span>Desktop</span>
          </button>
        </div>

        <!-- Instructions by platform -->
        {#if activePlatform === 'ios'}
          <div class="space-y-3">
            <h3 class="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              iPhone & iPad (Safari)
            </h3>
            <ol class="space-y-3 text-xs">
              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  1
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Open in Safari and tap Share</p>
                  <p class="leading-relaxed text-zinc-400">
                    Make sure you are browsing in Safari. Tap the
                    <span
                      class="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200"
                    >
                      <Share class="h-3 w-3" /> Share
                    </span>
                    button at the bottom of the screen.
                  </p>
                </div>
              </li>

              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  2
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Add to Home Screen</p>
                  <p class="leading-relaxed text-zinc-400">
                    Scroll down through the share sheet options and select
                    <span
                      class="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200"
                    >
                      <PlusSquare class="h-3 w-3" /> Add to Home Screen
                    </span>.
                  </p>
                </div>
              </li>

              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  3
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Confirm & Launch</p>
                  <p class="leading-relaxed text-zinc-400">
                    Tap <strong class="text-white">Add</strong> in the top right. Launch {APP_CONFIG.name}
                    from your home screen for full standalone mode without browser toolbars.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        {:else if activePlatform === 'android'}
          <div class="space-y-3">
            <h3 class="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              Android (Chrome / Edge / Samsung Internet)
            </h3>
            <ol class="space-y-3 text-xs">
              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  1
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Open Browser Menu</p>
                  <p class="leading-relaxed text-zinc-400">
                    Tap the <strong class="text-white">three dots menu (⋮)</strong> in Chrome or your
                    preferred browser toolbar.
                  </p>
                </div>
              </li>

              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  2
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Select Install</p>
                  <p class="leading-relaxed text-zinc-400">
                    Tap <span
                      class="rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200"
                      >Install app</span
                    >
                    or
                    <span
                      class="rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200"
                      >Add to Home screen</span
                    >.
                  </p>
                </div>
              </li>

              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  3
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Enjoy Instant Offline Access</p>
                  <p class="leading-relaxed text-zinc-400">
                    {APP_CONFIG.name} will be added to your app drawer and home screen.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        {:else}
          <div class="space-y-3">
            <h3 class="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              macOS, Windows & Linux Desktop
            </h3>
            <ol class="space-y-3 text-xs">
              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  1
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">Chrome / Edge / Brave</p>
                  <p class="leading-relaxed text-zinc-400">
                    Look for the <span
                      class="rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200"
                      >Install</span
                    >
                    icon in the right side of the address bar, or click Menu &rarr;
                    <strong class="text-white"
                      >Save and Share &rarr; Install {APP_CONFIG.name}</strong
                    >.
                  </p>
                </div>
              </li>

              <li
                class="flex items-start gap-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-3.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 font-mono text-[11px] font-bold text-indigo-400"
                >
                  2
                </span>
                <div class="space-y-1">
                  <p class="font-medium text-zinc-200">macOS Safari (macOS Sonoma+)</p>
                  <p class="leading-relaxed text-zinc-400">
                    Click <strong class="text-white">File</strong> in the macOS menu bar and select
                    <span
                      class="rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-200"
                      >Add to Dock...</span
                    >.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        {/if}

        <!-- Benefits Card -->
        <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/40 p-4 text-xs">
          <p class="font-semibold text-zinc-300">Why install as an App?</p>
          <div class="grid grid-cols-1 gap-2 pt-1 text-zinc-400 sm:grid-cols-2">
            <div class="flex items-center gap-2">
              <WifiOff class="h-4 w-4 shrink-0 text-indigo-400" />
              <span>Works 100% offline</span>
            </div>
            <div class="flex items-center gap-2">
              <Fingerprint class="h-4 w-4 shrink-0 text-indigo-400" />
              <span>Instant biometric unlock</span>
            </div>
            <div class="flex items-center gap-2">
              <Shield class="h-4 w-4 shrink-0 text-indigo-400" />
              <span>Sandboxed storage</span>
            </div>
            <div class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 shrink-0 text-indigo-400" />
              <span>No address bar distractions</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end border-t border-white/10 bg-zinc-950/80 px-6 py-4">
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl border border-white/10 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
{/if}
