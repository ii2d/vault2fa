<script lang="ts">
  import {
    AlertTriangle,
    Check,
    Download,
    KeyRound,
    Printer,
    ShieldAlert,
    X,
  } from '@lucide/svelte';
  import { BrowserQRCodeSvgWriter } from '@zxing/library';
  import { APP_CONFIG } from '$lib/config';
  import { downloadTextFile, exportEncryptedBackup } from '$lib/core/backup';
  import { db } from '$lib/core/storage';
  import { vault } from '$lib/stores';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let qrSvgHtml = $state('');
  let isDownloadingBackup = $state(false);
  let backupDownloaded = $state(false);

  const formattedDate = $derived(
    new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

  const totalEntries = $derived(vault.data?.entries.length ?? 0);

  function generateQr() {
    try {
      const appUrl = APP_CONFIG.origin;
      const writer = new BrowserQRCodeSvgWriter();
      const svgEl = writer.write(appUrl, 100, 100);
      svgEl.setAttribute('viewBox', '0 0 100 100');
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
      backupDownloaded = false;
    }
  });

  function handlePrint() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  async function handleDownloadBackup() {
    isDownloadingBackup = true;
    try {
      const payload = await db.loadEncryptedVault();
      if (!payload) throw new Error('No encrypted vault available');

      const jsonStr = exportEncryptedBackup(payload);
      const filename = `vault2fa-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadTextFile(filename, jsonStr);
      backupDownloaded = true;
      setTimeout(() => (backupDownloaded = false), 3000);
    } catch (err) {
      console.error('Failed to export backup:', err);
    } finally {
      isDownloadingBackup = false;
    }
  }
</script>

{#if isOpen}
  <!-- Print Overlay / Modal Wrapper -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md print:static print:inset-auto print:block print:bg-white print:p-0 print:text-black print:backdrop-blur-none"
    role="dialog"
    aria-modal="true"
    aria-labelledby="recovery-kit-title"
  >
    <div
      class="relative my-8 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl print:my-0 print:max-w-none print:rounded-none print:border-none print:bg-white print:p-0 print:text-black print:shadow-none"
    >
      <!-- Non-Print Header Bar -->
      <div
        class="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/60 px-6 py-4 print:hidden"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400"
          >
            <ShieldAlert class="h-5 w-5" />
          </div>
          <div>
            <h2 id="recovery-kit-title" class="text-base font-semibold text-zinc-100">
              Emergency Recovery Kit
            </h2>
            <p class="text-xs text-zinc-400">Offline credentials & disaster recovery sheet</p>
          </div>
        </div>

        <button
          type="button"
          onclick={onClose}
          class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Printable Recovery Kit Document -->
      <div id="recovery-sheet-content" class="space-y-6 p-6 sm:p-8 print:space-y-5 print:p-0">
        <!-- Sheet Header (Visible on print & screen) -->
        <div
          class="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between print:border-black/20 print:pb-4"
        >
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span
                class="rounded bg-indigo-600 px-2 py-0.5 text-xs font-bold tracking-wider text-white uppercase print:border print:border-black print:bg-black/5 print:text-black"
              >
                {APP_CONFIG.name}
              </span>
              <span class="text-sm font-semibold text-zinc-200 print:text-black">
                Account Recovery Sheet
              </span>
            </div>
            <h1 class="text-xl font-bold tracking-tight text-white print:text-xl print:text-black">
              Emergency Vault Access Document
            </h1>
            <p class="text-xs text-zinc-400 print:text-zinc-600">
              Generated: {formattedDate} • Protected Accounts: {totalEntries}
            </p>
          </div>

          <!-- App QR Code -->
          {#if qrSvgHtml}
            <div
              class="flex w-28 shrink-0 flex-col items-center justify-center self-center rounded-2xl border border-zinc-700 bg-white p-2.5 text-black shadow-sm print:border-black/20"
            >
              <div
                class="flex h-20 w-20 items-center justify-center overflow-hidden [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              >
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html qrSvgHtml}
              </div>
              <span
                class="mt-1 text-center font-mono text-[10px] font-bold tracking-tight text-zinc-900 print:text-black"
              >
                {APP_CONFIG.hostname}
              </span>
            </div>
          {/if}
        </div>

        <!-- Warning Callout -->
        <div
          class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200 print:border print:border-amber-600 print:bg-amber-50/80 print:text-amber-950"
        >
          <div class="flex items-start gap-2.5">
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-400 print:text-amber-700" />
            <div>
              <strong class="font-semibold">Keep this document confidential and offline.</strong>
              <p class="mt-0.5 opacity-90">
                `{APP_CONFIG.name}` uses zero-backend client-side encryption. If you lose your
                master password, there is no customer support or password reset mechanism to recover
                your 2FA tokens. Store this paper copy in a safe or secure lockbox.
              </p>
            </div>
          </div>
        </div>

        <!-- Master Password / Passphrase Write-in Area -->
        <div
          class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 print:border print:border-black/30 print:bg-zinc-50/50"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <KeyRound class="h-4 w-4 text-indigo-400 print:text-black" />
              <h3 class="text-sm font-semibold text-zinc-200 print:text-black">
                Master Password / Passphrase
              </h3>
            </div>
            <span class="text-[11px] text-zinc-400 print:text-zinc-600">
              (Handwrite below after printing)
            </span>
          </div>

          <!-- Handwritten Box Placeholder -->
          <div
            class="mt-3 flex min-h-[64px] items-center rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-900/50 px-4 print:border-black/40 print:bg-white"
          >
            <span class="text-xs text-zinc-500 select-none print:text-zinc-400">
              ✍️ Write your master password here in physical ink...
            </span>
          </div>
        </div>

        <!-- Quick Recovery Instructions -->
        <div class="space-y-3">
          <h3 class="text-xs font-semibold tracking-wider text-zinc-300 uppercase print:text-black">
            How to Restore Your Vault
          </h3>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              class="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5 print:border print:border-black/20 print:bg-zinc-50/50"
            >
              <span class="text-xs font-bold text-indigo-400 print:text-black">Step 1: Access</span>
              <p class="mt-1 text-xs text-zinc-400 print:text-zinc-800">
                Open <strong class="text-zinc-200 print:text-black">{APP_CONFIG.origin}</strong> on any
                modern browser or scan the QR code above.
              </p>
            </div>

            <div
              class="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5 print:border print:border-black/20 print:bg-zinc-50/50"
            >
              <span class="text-xs font-bold text-indigo-400 print:text-black">Step 2: Import</span>
              <p class="mt-1 text-xs text-zinc-400 print:text-zinc-800">
                Click <strong class="text-zinc-200 print:text-black">Unlock</strong>, enter your
                handwritten Master Password, or import your encrypted
                <code
                  class="rounded bg-zinc-800 px-1 py-0.5 text-[11px] print:border print:border-black/20 print:bg-zinc-200 print:text-black"
                  >.json</code
                > backup file.
              </p>
            </div>
          </div>
        </div>

        <!-- Security Specifications Footer -->
        <div
          class="border-t border-zinc-800 pt-4 text-[11px] text-zinc-500 print:border-black/20 print:text-zinc-600"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>Encryption: AES-256-GCM + Argon2id WebAssembly</span>
            <span>Architecture: 100% Zero-Backend & Client-Side Only</span>
          </div>
        </div>
      </div>

      <!-- Non-Print Footer Action Bar -->
      <div
        class="flex flex-col-reverse gap-3 border-t border-zinc-800 bg-zinc-950/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          Close
        </button>

        <div class="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onclick={handleDownloadBackup}
            disabled={isDownloadingBackup}
            class="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
          >
            {#if backupDownloaded}
              <Check class="h-4 w-4 text-emerald-400" />
              <span>Backup Saved</span>
            {:else}
              <Download class="h-4 w-4 text-zinc-400" />
              <span>Download Encrypted JSON</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={handlePrint}
            class="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500"
          >
            <Printer class="h-4 w-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @media print {
    :global(html),
    :global(body) {
      background: white !important;
      color: black !important;
      margin: 0 !important;
      padding: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    #recovery-sheet-content {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      color: black !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    @page {
      size: portrait;
      margin: 10mm 12mm;
    }
  }
</style>
