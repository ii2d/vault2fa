<script lang="ts">
  import { Database, GitBranch, Globe, Lock, ShieldCheck, X } from '@lucide/svelte';
  import { APP_CONFIG } from '$lib/config';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();
</script>

{#if isOpen}
  <div
    class="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md duration-200 print:hidden"
    role="dialog"
    aria-modal="true"
    aria-labelledby="privacy-manifesto-title"
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
            class="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-600/20 text-emerald-400"
          >
            <ShieldCheck class="h-5 w-5" />
          </div>
          <div>
            <h2 id="privacy-manifesto-title" class="text-base font-bold text-white">
              Privacy & Security
            </h2>
            <p class="text-xs text-zinc-400">Zero-Backend, Local-First Architecture</p>
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
        <!-- Hero Banner -->
        <div
          class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200"
        >
          <p class="font-semibold text-emerald-100">Our Core Privacy Promise</p>
          <p class="mt-1 text-[11px] leading-normal text-emerald-300/90">
            {APP_CONFIG.name} is built on a zero-knowledge, zero-backend philosophy. Your secrets never
            leave your device unencrypted, and we never collect telemetry or analytics.
          </p>
        </div>

        <!-- Pillars -->
        <div class="space-y-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2 font-semibold text-zinc-100">
              <Globe class="h-4 w-4 shrink-0 text-emerald-400" />
              <span>0% Serverless & No Tracking</span>
            </div>
            <p class="pl-6 text-[11px] text-zinc-400">
              There is no central database or telemetry server. We do not use cookies, advertising
              SDKs, tracking pixels, or third-party analytics. Your IP and activity are never
              logged.
            </p>
          </div>

          <div class="space-y-1 border-t border-white/5 pt-3">
            <div class="flex items-center gap-2 font-semibold text-zinc-100">
              <Lock class="h-4 w-4 shrink-0 text-emerald-400" />
              <span>100% Client-Side End-to-End Cryptography</span>
            </div>
            <p class="pl-6 text-[11px] text-zinc-400">
              Master keys are derived on your device using <strong>Argon2id WASM</strong> (64 MB
              RAM, 3 iterations) to neutralize GPU brute-force attacks. Payloads are encrypted
              locally with <strong>AES-256-GCM</strong> using the browser's hardware-accelerated Web Crypto
              API.
            </p>
          </div>

          <div class="space-y-1 border-t border-white/5 pt-3">
            <div class="flex items-center gap-2 font-semibold text-zinc-100">
              <Database class="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Origin-Isolated Local Storage</span>
            </div>
            <p class="pl-6 text-[11px] text-zinc-400">
              All encrypted records are stored exclusively in your browser's sandboxed IndexedDB
              database. Optional remote sync drivers (such as GitHub Gist) only transmit encrypted
              ciphertext blobs; remote providers never possess your master password or keys.
            </p>
          </div>

          <div class="space-y-1 border-t border-white/5 pt-3">
            <div class="flex items-center gap-2 font-semibold text-zinc-100">
              <GitBranch class="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Auditable & Open Source</span>
            </div>
            <p class="pl-6 text-[11px] text-zinc-400">
              The entire application is open-source under the MIT license. You can inspect the code,
              verify builds, and host your own instance statically.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between border-t border-white/10 bg-zinc-950/80 px-6 py-4"
      >
        <a
          href={APP_CONFIG.repoUrl}
          target="_blank"
          rel="noreferrer"
          class="text-xs text-indigo-400 transition hover:underline"
        >
          View Source Code on GitHub &rarr;
        </a>
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl border border-white/10 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
