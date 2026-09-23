<script lang="ts">
  import {
    AlertTriangle,
    ArrowRightLeft,
    BookOpen,
    CheckCircle2,
    Cloud,
    Download,
    Fingerprint,
    Printer,
    Smartphone,
    X,
  } from '@lucide/svelte';
  import { APP_CONFIG } from '$lib/config';
  import { pwaInstall } from '$lib/stores';
  import InstallGuideModal from './InstallGuideModal.svelte';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();
  let isInstallGuideOpen = $state(false);

  async function handleInstallTrigger() {
    if (pwaInstall.canInstall) {
      await pwaInstall.promptInstall();
    } else {
      isInstallGuideOpen = true;
    }
  }
</script>

{#if isOpen}
  <div
    class="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md duration-200 print:hidden"
    role="dialog"
    aria-modal="true"
    aria-labelledby="user-guide-title"
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
            <BookOpen class="h-5 w-5" />
          </div>
          <div>
            <h2 id="user-guide-title" class="text-base font-bold text-white">
              User Guide & Features
            </h2>
            <p class="text-xs text-zinc-400">Everything you need to know about {APP_CONFIG.name}</p>
          </div>
        </div>

        <button
          type="button"
          onclick={onClose}
          aria-label="Close dialog"
          class="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="space-y-4 overflow-y-auto p-6 text-xs leading-relaxed text-zinc-300">
        <!-- Install & Offline PWA -->
        <div class="space-y-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-semibold text-zinc-100">
              <Smartphone class="h-4 w-4 shrink-0 text-indigo-400" />
              <span>Install as Standalone App</span>
            </div>
            {#if pwaInstall.isInstalled}
              <span
                class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
              >
                <CheckCircle2 class="h-3 w-3" /> Installed
              </span>
            {/if}
          </div>

          <p class="text-[11px] text-zinc-400">
            {APP_CONFIG.name} is a Progressive Web App (PWA) that installs on iOS, Android, macOS, and
            Windows. Once installed, all assets are cached so you can generate TOTP codes completely offline
            without network connectivity.
          </p>

          <div class="pt-1">
            <button
              type="button"
              onclick={handleInstallTrigger}
              class="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              <Download class="h-3.5 w-3.5" />
              <span>{pwaInstall.canInstall ? 'Install App Now' : 'View Installation Steps'}</span>
            </button>
          </div>
        </div>

        <!-- Biometrics & Security -->
        <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center gap-2 font-semibold text-zinc-100">
            <Fingerprint class="h-4 w-4 shrink-0 text-indigo-400" />
            <span>Hardware & Biometric Unlock</span>
          </div>
          <p class="text-[11px] text-zinc-400">
            Configure Touch ID, Face ID, Windows Hello, or FIDO2 hardware keys (YubiKey) via the
            WebAuthn standard. Your master password remains the true cryptographic key, while
            biometric credentials derive an ephemeral session token in your device's secure enclave.
          </p>
        </div>

        <!-- Decentralized Sync -->
        <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center gap-2 font-semibold text-zinc-100">
            <Cloud class="h-4 w-4 shrink-0 text-indigo-400" />
            <span>Multi-Device Sync Options</span>
          </div>
          <ul class="list-inside list-disc space-y-1.5 text-[11px] text-zinc-400">
            <li>
              <strong class="text-zinc-200">GitHub Gist E2EE:</strong> Syncs ciphertext blobs to a private
              GitHub Gist with version history. Pair new devices by scanning the sync QR code in Settings.
            </li>
            <li>
              <strong class="text-zinc-200">Local File Binding:</strong> Saves
              <code class="font-mono text-zinc-200">vault.enc</code> directly into iCloud Drive, Dropbox,
              OneDrive, or Syncthing.
            </li>
          </ul>
        </div>

        <!-- Emergency Recovery Kit -->
        <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center gap-2 font-semibold text-zinc-100">
            <Printer class="h-4 w-4 shrink-0 text-indigo-400" />
            <span>Emergency Recovery Kit</span>
          </div>
          <p class="text-[11px] text-zinc-400">
            In Vault Settings &rarr; Backups, you can generate a printable disaster recovery kit. It
            includes a high-density QR code with your encrypted vault payload and a field to write
            your master password. Store the printout in a secure location.
          </p>
        </div>

        <!-- Import & Export -->
        <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center gap-2 font-semibold text-zinc-100">
            <ArrowRightLeft class="h-4 w-4 shrink-0 text-indigo-400" />
            <span>Broad Interoperability</span>
          </div>
          <p class="text-[11px] text-zinc-400">
            Import accounts directly from <strong>Google Authenticator</strong> (QR migration
            codes), <strong>Aegis Authenticator</strong> (JSON), <strong>Bitwarden</strong>, or
            standard <code class="font-mono text-zinc-200">otpauth://</code> URI lists (.txt).
          </p>
        </div>

        <!-- Incognito & Private Browsing Advisory -->
        <div class="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div class="flex items-center gap-2 font-semibold text-amber-200">
            <AlertTriangle class="h-4 w-4 shrink-0 text-amber-400" />
            <span>Chrome Incognito Mode Advisory</span>
          </div>
          <p class="text-[11px] text-zinc-300">
            Do not use Chrome Incognito mode to link local <code class="font-mono text-amber-200"
              >.vault</code
            > files. Due to an internal Chromium bug (Issue #562119515), saving a native file handle into
            in-memory IndexedDB crashes the entire browser process.
          </p>
          <p class="text-[11px] text-zinc-400">
            To restore or use {APP_CONFIG.name} in Incognito mode safely, use
            <strong>Select Backup File</strong>
            (standard HTML upload) or <strong>GitHub Gist Sync</strong>, both of which never crash
            the browser. For continuous live local file synchronization, use a normal browser
            window.
          </p>
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

<InstallGuideModal isOpen={isInstallGuideOpen} onClose={() => (isInstallGuideOpen = false)} />
