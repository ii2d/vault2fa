<script lang="ts">
  import { onMount } from 'svelte';
  import type { IScannerControls } from '@zxing/browser';
  import {
    QrCode,
    Keyboard,
    X,
    Camera,
    Upload,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Loader2,
  } from '@lucide/svelte';
  import { cleanSecret, isValidBase32, parseOtpUri } from '$lib/core/totp';
  import { vault } from '$lib/stores';
  import type { OTPAlgorithm, OTPType } from '$lib/types';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let activeTab = $state<'scan' | 'manual'>('scan');
  let videoEl = $state<HTMLVideoElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let scannerControls = $state<IScannerControls | null>(null);
  let scannerError = $state<string>('');
  let isScanning = $state(false);

  // Manual Form State
  let issuer = $state('');
  let label = $state('');
  let secret = $state('');
  let groupId = $state<string>('');
  let type = $state<OTPType>('totp');
  let algorithm = $state<OTPAlgorithm>('SHA1');
  let digits = $state(6);
  let period = $state(30);
  let counter = $state(0);
  let showAdvanced = $state(false);
  let formError = $state('');
  let isSaving = $state(false);

  // Start camera scanner
  async function startScanner() {
    stopScanner();
    scannerError = '';

    if (!videoEl) return;

    try {
      isScanning = true;
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const codeReader = new BrowserQRCodeReader();
      const controls = await codeReader.decodeFromVideoDevice(undefined, videoEl, (result) => {
        if (result) {
          handleScannedText(result.getText());
        }
      });
      scannerControls = controls;
    } catch (err: unknown) {
      scannerError =
        (err as Error).message || 'Camera permission was denied or no camera device is available.';
      isScanning = false;
    }
  }

  function stopScanner() {
    if (scannerControls) {
      scannerControls.stop();
      scannerControls = null;
    }
    isScanning = false;
  }

  async function handleScannedText(text: string) {
    stopScanner();
    try {
      const parsed = parseOtpUri(text);
      await vault.addEntry({
        issuer: parsed.issuer || 'Unnamed',
        label: parsed.label || 'Account',
        secret: parsed.secret,
        type: parsed.type,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        counter: parsed.counter,
        groupId: vault.activeGroupId ?? undefined,
      });
      onClose();
    } catch (err: unknown) {
      scannerError = (err as Error).message || 'Invalid 2FA QR code URI format.';
    }
  }

  // Handle image file upload fallback
  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const codeReader = new BrowserQRCodeReader();
      const objectUrl = URL.createObjectURL(file);
      const result = await codeReader.decodeFromImageUrl(objectUrl);
      URL.revokeObjectURL(objectUrl);
      if (result) {
        handleScannedText(result.getText());
      }
    } catch {
      scannerError = 'Could not find a valid 2FA QR code in the uploaded image.';
    }
  }

  async function handleManualSubmit(e: SubmitEvent) {
    e.preventDefault();
    formError = '';

    const cleanedSecret = cleanSecret(secret);
    if (!cleanedSecret) {
      formError = 'Secret key is required.';
      return;
    }

    if (!isValidBase32(cleanedSecret)) {
      formError = 'Secret key is not valid Base32 format (allowed: A-Z, 2-7).';
      return;
    }

    if (!label.trim() && !issuer.trim()) {
      formError = 'Account name or issuer is required.';
      return;
    }

    try {
      isSaving = true;
      await vault.addEntry({
        issuer: issuer.trim(),
        label: label.trim() || issuer.trim(),
        secret: cleanedSecret,
        type,
        algorithm,
        digits,
        period,
        counter: type === 'hotp' ? counter : undefined,
        groupId: groupId || undefined,
      });
      resetForm();
      onClose();
    } catch (err: unknown) {
      formError = (err as Error).message || 'Failed to save entry.';
    } finally {
      isSaving = false;
    }
  }

  function resetForm() {
    issuer = '';
    label = '';
    secret = '';
    groupId = '';
    type = 'totp';
    algorithm = 'SHA1';
    digits = 6;
    period = 30;
    counter = 0;
    showAdvanced = false;
    formError = '';
    scannerError = '';
    stopScanner();
  }

  $effect(() => {
    if (isOpen) {
      if (activeTab === 'scan') {
        // slight delay to let video element render in DOM
        setTimeout(() => startScanner(), 100);
      } else {
        stopScanner();
      }
    } else {
      stopScanner();
    }
  });

  onMount(() => {
    return () => stopScanner();
  });
</script>

{#if isOpen}
  <!-- Modal Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-account-title"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl"
    >
      <!-- Dialog Header -->
      <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 id="add-account-title" class="text-base font-bold text-white">Add 2FA Account</h2>
        <button
          type="button"
          onclick={onClose}
          aria-label="Close dialog"
          class="rounded-xl p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Tab Switcher -->
      <div class="flex border-b border-white/10 bg-zinc-950/40 p-2">
        <button
          type="button"
          onclick={() => (activeTab = 'scan')}
          class="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'scan'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <QrCode class="h-4 w-4 text-indigo-400" />
          <span>Scan QR Code</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'manual')}
          class="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'manual'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <Keyboard class="h-4 w-4 text-indigo-400" />
          <span>Manual Entry</span>
        </button>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- SCANNER TAB -->
        {#if activeTab === 'scan'}
          <div class="flex flex-col items-center">
            <!-- Video Viewport -->
            <div
              class="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl border-2 border-dashed border-indigo-500/40 bg-zinc-950 shadow-inner"
            >
              <video
                bind:this={videoEl}
                class="h-full w-full object-cover"
                autoplay
                playsinline
                muted
              ></video>

              <!-- Viewfinder Box Overlay -->
              <div
                class="pointer-events-none absolute inset-8 rounded-xl border-2 border-indigo-400/80 shadow-2xl"
              >
                <!-- Scanning animated line -->
                <div
                  class="h-0.5 w-full animate-[pulse_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                ></div>
              </div>

              {#if !isScanning && !scannerError}
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/80 text-zinc-400"
                >
                  <Camera class="h-8 w-8 animate-pulse text-zinc-500" />
                  <span class="text-xs">Starting camera...</span>
                </div>
              {/if}
            </div>

            <!-- Error Notification -->
            {#if scannerError}
              <div
                class="mt-4 flex w-full items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300"
              >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{scannerError}</span>
              </div>
            {/if}

            <!-- File Upload Fallback -->
            <div class="mt-6 flex flex-col items-center gap-2 text-center">
              <span class="text-xs text-zinc-400">Can't scan with camera?</span>
              <input
                bind:this={fileInputEl}
                type="file"
                accept="image/*"
                onchange={handleFileUpload}
                class="hidden"
              />
              <button
                type="button"
                onclick={() => fileInputEl?.click()}
                class="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-800/80 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
              >
                <Upload class="h-3.5 w-3.5" />
                <span>Upload QR Image File</span>
              </button>
            </div>
          </div>

          <!-- MANUAL ENTRY TAB -->
        {:else}
          <form onsubmit={handleManualSubmit} class="space-y-4">
            {#if formError}
              <div
                class="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300"
              >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            {/if}

            <!-- Issuer -->
            <div>
              <label for="issuer" class="mb-1.5 block text-xs font-medium text-zinc-400">
                Service / Issuer
              </label>
              <input
                id="issuer"
                type="text"
                bind:value={issuer}
                placeholder="e.g. GitHub, Google, AWS"
                class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <!-- Label -->
            <div>
              <label for="label" class="mb-1.5 block text-xs font-medium text-zinc-400">
                Account Username / Email
              </label>
              <input
                id="label"
                type="text"
                bind:value={label}
                placeholder="e.g. user@example.com"
                required
                class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <!-- Secret Key -->
            <div>
              <label for="secret" class="mb-1.5 block text-xs font-medium text-zinc-400">
                Secret Key (Base32)
              </label>
              <input
                id="secret"
                type="text"
                bind:value={secret}
                placeholder="e.g. JBSWY3DPEHPK3PXP"
                required
                class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm tracking-wider text-white uppercase placeholder-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <!-- Group Selection -->
            {#if vault.groups.length > 0}
              <div>
                <label for="group" class="mb-1.5 block text-xs font-medium text-zinc-400">
                  Group / Folder
                </label>
                <select
                  id="group"
                  bind:value={groupId}
                  class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">None (Uncategorized)</option>
                  {#each vault.groups as group (group.id)}
                    <option value={group.id}>{group.name}</option>
                  {/each}
                </select>
              </div>
            {/if}

            <!-- Advanced Settings Accordion -->
            <div class="border-t border-white/10 pt-3">
              <button
                type="button"
                onclick={() => (showAdvanced = !showAdvanced)}
                class="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                <span>Advanced Token Parameters</span>
                {#if showAdvanced}
                  <ChevronUp class="h-3.5 w-3.5" />
                {:else}
                  <ChevronDown class="h-3.5 w-3.5" />
                {/if}
              </button>

              {#if showAdvanced}
                <div class="mt-3 space-y-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
                  <!-- Type -->
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-zinc-400">Token Type</span>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        onclick={() => (type = 'totp')}
                        class="rounded-lg px-2.5 py-1 text-xs font-medium {type === 'totp'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-400'}"
                      >
                        TOTP (Time)
                      </button>
                      <button
                        type="button"
                        onclick={() => (type = 'hotp')}
                        class="rounded-lg px-2.5 py-1 text-xs font-medium {type === 'hotp'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-400'}"
                      >
                        HOTP (Counter)
                      </button>
                    </div>
                  </div>

                  <!-- Algorithm -->
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-zinc-400">Algorithm</span>
                    <select
                      bind:value={algorithm}
                      class="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                    >
                      <option value="SHA1">SHA1 (Standard)</option>
                      <option value="SHA256">SHA256</option>
                      <option value="SHA512">SHA512</option>
                    </select>
                  </div>

                  <!-- Digits -->
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-zinc-400">Digits</span>
                    <select
                      bind:value={digits}
                      class="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                    >
                      <option value={6}>6 Digits</option>
                      <option value={8}>8 Digits</option>
                    </select>
                  </div>

                  {#if type === 'totp'}
                    <!-- Period -->
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-zinc-400">Interval Period</span>
                      <select
                        bind:value={period}
                        class="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                      >
                        <option value={30}>30 seconds</option>
                        <option value={60}>60 seconds</option>
                      </select>
                    </div>
                  {:else}
                    <!-- Counter -->
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-zinc-400">Initial Counter</span>
                      <input
                        type="number"
                        bind:value={counter}
                        min="0"
                        class="w-20 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                      />
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Form Action Buttons -->
            <div class="mt-6 flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onclick={onClose}
                class="rounded-xl border border-white/10 bg-zinc-800/80 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
              >
                {#if isSaving}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                {:else}
                  <span>Save Account</span>
                {/if}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}
