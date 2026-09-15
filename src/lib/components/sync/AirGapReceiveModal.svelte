<script lang="ts">
  import { onMount } from 'svelte';
  import {
    X,
    Camera,
    ShieldCheck,
    CheckCircle2,
    RotateCcw,
    Loader2,
    AlertCircle,
    KeyRound,
  } from '@lucide/svelte';
  import type { IScannerControls } from '@zxing/browser';
  import { decryptVault, deriveMasterKey } from '$lib/core/crypto';
  import { AirGapDecoder, type MergeResult } from '$lib/core/sync';
  import { vault } from '$lib/stores';
  import type { EncryptedVaultPayload } from '$lib/types';

  let {
    isOpen,
    onClose,
    onMerged,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onMerged?: (result: MergeResult) => void;
  } = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let scannerControls = $state<IScannerControls | null>(null);
  let scannerError = $state('');

  // Decoder State
  const decoder = new AirGapDecoder();
  let receivedFrames = $state(0);
  let totalFrames = $state(0);
  let progressPercent = $state(0);
  let completedPayload = $state<EncryptedVaultPayload | null>(null);

  // Decryption & Merge State
  let passwordInput = $state('');
  let isDecrypting = $state(false);
  let mergeError = $state('');
  let mergeSummary = $state<MergeResult | null>(null);

  async function startScanner() {
    stopScanner();
    scannerError = '';
    decoder.reset();
    receivedFrames = 0;
    totalFrames = 0;
    progressPercent = 0;
    completedPayload = null;
    mergeSummary = null;
    mergeError = '';

    if (!videoEl) return;

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const codeReader = new BrowserQRCodeReader();
      const controls = await codeReader.decodeFromVideoDevice(undefined, videoEl, (result) => {
        if (result && !completedPayload) {
          handleFrameScanned(result.getText());
        }
      });
      scannerControls = controls;
    } catch (err: unknown) {
      scannerError =
        (err as Error).message || 'Camera permission was denied or no camera device is available.';
    }
  }

  function stopScanner() {
    if (scannerControls) {
      scannerControls.stop();
      scannerControls = null;
    }
  }

  function handleFrameScanned(rawText: string) {
    const res = decoder.feed(rawText);
    if (res.status === 'progress') {
      receivedFrames = res.received;
      totalFrames = res.total;
      progressPercent = res.percent;
    } else if (res.status === 'complete' && res.payload) {
      receivedFrames = res.received;
      totalFrames = res.total;
      progressPercent = 100;
      completedPayload = res.payload;
      stopScanner();
    }
  }

  async function handleDecryptAndMerge() {
    if (!completedPayload) return;
    isDecrypting = true;
    mergeError = '';

    try {
      let keyBytes: Uint8Array;

      if (passwordInput.trim()) {
        // User provided custom password for incoming vault
        const derived = await deriveMasterKey(passwordInput.trim(), completedPayload.kdf);
        keyBytes = derived.keyBytes;
      } else {
        // Attempt using active vault's session master key
        const currentKey = vault.getMasterKey();
        if (!currentKey) {
          throw new Error('Vault is locked. Please enter the master password.');
        }
        keyBytes = currentKey;
      }

      const remoteData = await decryptVault(completedPayload, keyBytes);
      const res = await vault.mergeRemoteData(remoteData);
      mergeSummary = res;
      onMerged?.(res);
    } catch (err: unknown) {
      mergeError =
        (err as Error).message ||
        'Failed to decrypt incoming vault. Please check password and try again.';
    } finally {
      isDecrypting = false;
    }
  }

  function handleReset() {
    completedPayload = null;
    mergeSummary = null;
    mergeError = '';
    passwordInput = '';
    startScanner();
  }

  $effect(() => {
    if (isOpen) {
      setTimeout(() => startScanner(), 100);
    } else {
      stopScanner();
    }
  });

  onMount(() => {
    return () => stopScanner();
  });
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
      onclick={onClose}
      role="button"
      tabindex="-1"
      aria-label="Close receive modal overlay"
    ></div>

    <!-- Modal Card -->
    <div
      class="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/90"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400"
          >
            <Camera class="h-4 w-4" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-white">Air-Gap Receive</h2>
            <p class="text-[11px] text-zinc-400">Scan animated QR to import encrypted vault</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Close receive modal"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex flex-col items-center p-6">
        {#if mergeSummary}
          <!-- Step 3: Success Result -->
          <div class="flex flex-col items-center text-center">
            <div
              class="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10"
            >
              <CheckCircle2 class="h-8 w-8" />
            </div>
            <h3 class="mt-4 text-base font-bold text-white">Vault Merged Successfully!</h3>
            <p class="mt-1 text-xs text-zinc-400">
              Your offline air-gap transfer was decrypted and merged seamlessly.
            </p>

            <div
              class="mt-4 grid w-full grid-cols-3 gap-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-3 text-center text-xs"
            >
              <div>
                <p class="text-sm font-bold text-emerald-400">{mergeSummary.entriesAdded}</p>
                <p class="text-[10px] text-zinc-500">Added</p>
              </div>
              <div>
                <p class="text-sm font-bold text-indigo-400">{mergeSummary.entriesUpdated}</p>
                <p class="text-[10px] text-zinc-500">Updated</p>
              </div>
              <div>
                <p class="text-sm font-bold text-rose-400">{mergeSummary.entriesDeleted}</p>
                <p class="text-[10px] text-zinc-500">Deleted</p>
              </div>
            </div>

            <button
              type="button"
              onclick={onClose}
              class="mt-6 w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
            >
              Done
            </button>
          </div>
        {:else if completedPayload}
          <!-- Step 2: Decrypt & Merge Prompt -->
          <div class="w-full">
            <div
              class="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5"
            >
              <ShieldCheck class="h-5 w-5 shrink-0 text-emerald-400" />
              <div class="text-xs">
                <p class="font-semibold text-emerald-300">All {totalFrames} Frames Received!</p>
                <p class="text-zinc-400">Encrypted vault packet reassembled.</p>
              </div>
            </div>

            {#if mergeError}
              <div
                class="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
              >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{mergeError}</span>
              </div>
            {/if}

            <form
              onsubmit={(e) => {
                e.preventDefault();
                handleDecryptAndMerge();
              }}
              class="mt-4 space-y-3"
            >
              <div>
                <label for="airgap-password" class="block text-xs font-medium text-zinc-300">
                  Master Password of Transmitted Vault
                </label>
                <p class="text-[11px] text-zinc-500">
                  Leave blank if it uses the same password as your currently unlocked vault.
                </p>
                <div class="relative mt-1.5">
                  <KeyRound
                    class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                  />
                  <input
                    id="airgap-password"
                    type="password"
                    bind:value={passwordInput}
                    placeholder="Enter password (if different)"
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 py-2.5 pr-3 pl-9 text-xs text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div class="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onclick={handleReset}
                  class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  <RotateCcw class="h-3.5 w-3.5" />
                  <span>Rescan</span>
                </button>
                <button
                  type="submit"
                  disabled={isDecrypting}
                  class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
                >
                  {#if isDecrypting}
                    <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    <span>Decrypting & Merging...</span>
                  {:else}
                    <span>Decrypt & Merge Vault</span>
                  {/if}
                </button>
              </div>
            </form>
          </div>
        {:else}
          <!-- Step 1: Camera Scanner Viewport & Progress Ring -->
          <div
            class="relative aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border-2 border-dashed border-indigo-500/40 bg-zinc-950 shadow-inner"
          >
            <video bind:this={videoEl} class="h-full w-full object-cover" playsinline muted>
              <track kind="captions" />
            </video>

            <!-- Overlay target crosshair -->
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                class="h-44 w-44 rounded-xl border-2 border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.25)]"
              ></div>
            </div>
          </div>

          {#if scannerError}
            <div
              class="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
            >
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{scannerError}</span>
            </div>
          {/if}

          <!-- Live Frame Progress Bar -->
          <div class="mt-4 w-full">
            <div class="flex items-center justify-between text-xs font-medium text-zinc-300">
              <span>Collecting Frames:</span>
              <span class="font-mono font-bold text-indigo-400">
                {receivedFrames} / {totalFrames || '?'} ({progressPercent}%)
              </span>
            </div>

            <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200"
                style="width: {progressPercent}%"
              ></div>
            </div>
          </div>

          <p class="mt-4 text-center text-[11px] text-zinc-500">
            Hold your camera steady in front of the transmitting device until all frames are
            collected.
          </p>
        {/if}
      </div>
    </div>
  </div>
{/if}
