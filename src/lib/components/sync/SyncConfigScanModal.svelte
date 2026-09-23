<script lang="ts">
  import { AlertCircle, Camera, CheckCircle2, ClipboardPaste, X } from '@lucide/svelte';
  import type { IScannerControls } from '@zxing/browser';
  import { onMount } from 'svelte';
  import { parseSyncConfigQr } from '$lib/core/sync';
  import type { GistSyncConfig } from '$lib/types';

  let {
    isOpen,
    onClose,
    onScanned,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onScanned: (config: GistSyncConfig) => void;
  } = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let scannerControls = $state<IScannerControls | null>(null);
  let scannerError = $state('');
  let isSuccess = $state(false);
  let manualUri = $state('');
  let manualUriError = $state('');

  function applyConfig(config: GistSyncConfig) {
    isSuccess = true;
    stopScanner();
    setTimeout(() => {
      onScanned(config);
      onClose();
    }, 400);
  }

  function handleManualUri(raw: string) {
    manualUriError = '';
    const config = parseSyncConfigQr(raw);
    if (config) {
      applyConfig(config);
    } else {
      manualUriError = 'Invalid sync URI. Expected format: v2fa-sync://gist?token=...';
    }
  }

  async function handlePasteClipboard() {
    manualUriError = '';
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        manualUri = text;
        handleManualUri(text);
      } else {
        manualUriError = 'Clipboard is empty.';
      }
    } catch {
      manualUriError = 'Clipboard access denied. Please paste directly into the input.';
    }
  }

  async function startScanner() {
    stopScanner();
    scannerError = '';
    isSuccess = false;

    if (!videoEl) return;

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const codeReader = new BrowserQRCodeReader();
      const controls = await codeReader.decodeFromVideoDevice(
        undefined,
        videoEl,
        (result, error) => {
          if (result) {
            const rawText = result.getText();
            const config = parseSyncConfigQr(rawText);
            if (config) {
              applyConfig(config);
            }
          }
          if (error && error.name !== 'NotFoundException') {
            // Normal frame miss, continue scanning
          }
        },
      );
      scannerControls = controls;
    } catch (err: unknown) {
      scannerError =
        (err as Error).message ||
        'Unable to access camera. Please check camera permissions in your browser.';
    }
  }

  function stopScanner() {
    if (scannerControls) {
      scannerControls.stop();
      scannerControls = null;
    }
  }

  $effect(() => {
    if (isOpen) {
      manualUri = '';
      manualUriError = '';
      setTimeout(() => startScanner(), 100);
    } else {
      stopScanner();
    }
  });

  onMount(() => {
    return () => {
      stopScanner();
    };
  });
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="scan-config-title"
  >
    <div
      class="relative z-10 flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/90"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400"
          >
            <Camera class="h-4 w-4" />
          </div>
          <div>
            <h2 id="scan-config-title" class="text-sm font-semibold text-white">Pair Gist Sync</h2>
            <p class="text-[11px] text-zinc-400">Scan QR or paste pairing config URI</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Close modal"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Viewport / Body -->
      <div class="flex flex-col items-center p-5 text-center">
        {#if scannerError}
          <div
            class="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-300"
          >
            <AlertCircle class="mx-auto mb-1.5 h-5 w-5 text-amber-400" />
            <p class="text-[11px] leading-tight font-medium">{scannerError}</p>
            <button
              type="button"
              onclick={startScanner}
              class="mt-2.5 rounded-lg bg-zinc-800 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-700"
            >
              Retry Camera
            </button>
          </div>
        {:else}
          <div
            class="relative aspect-square w-full max-w-[240px] overflow-hidden rounded-2xl border-2 border-dashed border-purple-500/40 bg-zinc-950 shadow-inner"
          >
            <video bind:this={videoEl} class="h-full w-full object-cover" playsinline muted>
              <track kind="captions" />
            </video>

            <!-- Crosshair overlay -->
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div class="h-36 w-36 rounded-xl border-2 border-purple-400/60 shadow-lg"></div>
            </div>

            {#if isSuccess}
              <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 text-emerald-400"
              >
                <CheckCircle2 class="h-12 w-12 animate-bounce" />
                <span class="mt-2 text-xs font-semibold">Configuration Found!</span>
              </div>
            {/if}
          </div>

          <p class="mt-3 text-xs text-zinc-400">
            Point camera at the <strong>Sync Config QR code</strong> on your other device.
          </p>
        {/if}

        <!-- Divider -->
        <div class="my-3.5 flex w-full items-center gap-2">
          <div class="h-px flex-1 bg-white/10"></div>
          <span class="text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
            >or paste Config URI</span
          >
          <div class="h-px flex-1 bg-white/10"></div>
        </div>

        <!-- Manual URI Input & Clipboard Button -->
        <div class="w-full space-y-2">
          <div class="flex gap-1.5">
            <input
              type="text"
              bind:value={manualUri}
              placeholder="v2fa-sync://gist?token=..."
              oninput={() => (manualUriError = '')}
              onkeydown={(e) => e.key === 'Enter' && handleManualUri(manualUri)}
              class="flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onclick={() => handleManualUri(manualUri)}
              disabled={!manualUri.trim()}
              class="rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-500 disabled:opacity-40"
            >
              Apply
            </button>
          </div>

          <button
            type="button"
            onclick={handlePasteClipboard}
            class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800/80 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700"
          >
            <ClipboardPaste class="h-3.5 w-3.5 text-purple-400" />
            <span>Paste from Clipboard</span>
          </button>

          {#if manualUriError}
            <p class="text-left text-[11px] text-rose-400">{manualUriError}</p>
          {/if}
        </div>

        <button
          type="button"
          onclick={onClose}
          class="mt-4 w-full rounded-xl border border-white/10 bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
