<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Camera, AlertCircle, CheckCircle2 } from '@lucide/svelte';
  import type { IScannerControls } from '@zxing/browser';
  import type { GistSyncConfig } from '$lib/types';
  import { parseSyncConfigQr } from '$lib/core/sync';

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
              isSuccess = true;
              stopScanner();
              setTimeout(() => {
                onScanned(config);
                onClose();
              }, 400);
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
            <h2 id="scan-config-title" class="text-sm font-semibold text-white">
              Scan Sync Config QR
            </h2>
            <p class="text-[11px] text-zinc-400">Pair Gist sync from another device</p>
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

      <!-- Viewport -->
      <div class="flex flex-col items-center p-5 text-center">
        {#if scannerError}
          <div
            class="w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300"
          >
            <AlertCircle class="mx-auto mb-2 h-6 w-6 text-rose-400" />
            <p class="font-medium">{scannerError}</p>
            <button
              type="button"
              onclick={startScanner}
              class="mt-3 rounded-xl bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-700"
            >
              Retry Camera
            </button>
          </div>
        {:else}
          <div
            class="relative aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border-2 border-dashed border-purple-500/40 bg-zinc-950 shadow-inner"
          >
            <video bind:this={videoEl} class="h-full w-full object-cover" playsinline muted>
              <track kind="captions" />
            </video>

            <!-- Crosshair overlay -->
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div class="h-40 w-40 rounded-xl border-2 border-purple-400/60 shadow-lg"></div>
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

          <p class="mt-4 text-xs text-zinc-400">
            Point camera at the <strong>Sync Config QR code</strong> displayed on your other device.
          </p>
        {/if}

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
