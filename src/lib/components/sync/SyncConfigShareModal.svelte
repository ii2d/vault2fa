<script lang="ts">
  import { Check, Cloud, Copy, QrCode, X } from '@lucide/svelte';
  import { BrowserQRCodeSvgWriter, EncodeHintType } from '@zxing/library';
  import { SvelteMap } from 'svelte/reactivity';
  import { encodeSyncConfigQr } from '$lib/core/sync';
  import type { GistSyncConfig } from '$lib/types';

  let {
    isOpen,
    onClose,
    config,
  }: {
    isOpen: boolean;
    onClose: () => void;
    config: GistSyncConfig;
  } = $props();

  let qrSvgHtml = $state('');
  let copied = $state(false);

  function generateQr() {
    if (!config || !config.token) {
      qrSvgHtml = '';
      return;
    }
    const uri = encodeSyncConfigQr(config);
    const writer = new BrowserQRCodeSvgWriter();
    const hints = new SvelteMap([[EncodeHintType.MARGIN, 2]]);
    try {
      const svgEl = writer.write(uri, 260, 260, hints);
      svgEl.setAttribute('viewBox', '0 0 260 260');
      svgEl.setAttribute('width', '100%');
      svgEl.setAttribute('height', '100%');
      svgEl.style.display = 'block';
      svgEl.style.margin = 'auto';
      qrSvgHtml = svgEl.outerHTML;
    } catch {
      qrSvgHtml = '';
    }
  }

  $effect(() => {
    if (isOpen) {
      generateQr();
      copied = false;
    }
  });

  async function handleCopyUri() {
    if (!config || !config.token) return;
    const uri = encodeSyncConfigQr(config);
    try {
      await navigator.clipboard.writeText(uri);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Ignore clipboard error
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="share-config-title"
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
            <QrCode class="h-4 w-4" />
          </div>
          <div>
            <h2 id="share-config-title" class="text-sm font-semibold text-white">
              Sync Config QR Code
            </h2>
            <p class="text-[11px] text-zinc-400">Pair another device to your Gist</p>
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

      <!-- Content -->
      <div class="flex flex-col items-center p-5 text-center">
        <div
          class="relative flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-2xl bg-white p-4 shadow-inner"
        >
          {#if qrSvgHtml}
            <div
              class="flex h-full w-full items-center justify-center [&_svg]:m-auto [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html qrSvgHtml}
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center text-xs text-zinc-500">
              <Cloud class="mb-1 h-8 w-8 text-zinc-400" />
              <span>No configuration found</span>
            </div>
          {/if}
        </div>

        <div
          class="mt-4 w-full space-y-2 rounded-xl border border-white/5 bg-zinc-950/60 p-3 text-left text-xs"
        >
          {#if config.gistId}
            <div class="flex items-center justify-between">
              <span class="text-zinc-500">Gist ID:</span>
              <span class="font-mono text-zinc-300">{config.gistId.slice(0, 10)}...</span>
            </div>
          {/if}
          <div class="flex items-center justify-between">
            <span class="text-zinc-500">Auto-Sync:</span>
            <span class="font-medium text-emerald-400"
              >{config.autoSync ? 'Enabled' : 'Disabled'}</span
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-zinc-500">Zero-Knowledge:</span>
            <span class="text-zinc-300">Argon2id + AES-256</span>
          </div>
        </div>

        <p class="mt-3 text-[11px] leading-relaxed text-zinc-400">
          Scan this QR code from the <strong>Sync</strong> tab on your second device to connect automatically
          without retyping your token.
        </p>

        <div class="mt-4 flex w-full gap-2">
          <button
            type="button"
            onclick={handleCopyUri}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
          >
            {#if copied}
              <Check class="h-3.5 w-3.5 text-emerald-400" />
              <span class="text-emerald-400">Copied URI!</span>
            {:else}
              <Copy class="h-3.5 w-3.5" />
              <span>Copy Config URI</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={onClose}
            class="rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-purple-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
