<script lang="ts">
  import { AlertTriangle, CheckCircle2, HardDrive, ShieldCheck, X } from '@lucide/svelte';
  import { APP_CONFIG } from '$lib/config';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();
</script>

{#if isOpen}
  <div
    class="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md duration-200 print:hidden"
    role="dialog"
    aria-modal="true"
    aria-labelledby="incognito-notice-title"
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
            class="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-600/20 text-amber-400"
          >
            <AlertTriangle class="h-5 w-5" />
          </div>
          <div>
            <h2 id="incognito-notice-title" class="text-base font-bold text-white">
              Incognito Mode Advisory
            </h2>
            <p class="text-xs text-zinc-400">Local .vault file linking in Chromium browsers</p>
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
        <!-- Hero Warning Banner -->
        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <div class="flex items-start gap-2.5">
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p class="font-semibold text-amber-100">
                Do Not Use Incognito Mode to Link Local .vault Files
              </p>
              <p class="mt-1 text-[11px] leading-relaxed text-amber-300/90">
                Attempting to link or persist local <code
                  class="rounded bg-black/40 px-1 py-0.5 font-mono text-amber-200">.vault</code
                >
                files via the File System Access API while in Chrome Incognito mode will cause the entire
                browser to crash.
              </p>
            </div>
          </div>
        </div>

        <!-- Technical Explanation -->
        <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center gap-2 font-semibold text-zinc-100">
            <HardDrive class="h-4 w-4 shrink-0 text-amber-400" />
            <span>Why Does Chrome Crash?</span>
          </div>
          <p class="text-[11px] text-zinc-400">
            When you link a <code class="font-mono text-zinc-300">.vault</code> file, {APP_CONFIG.name}
            saves a native
            <code class="font-mono text-zinc-300">FileSystemFileHandle</code> reference to IndexedDB for
            continuous two-way background auto-saving.
          </p>
          <p class="text-[11px] text-zinc-400">
            In Chrome Incognito mode, Chromium uses an in-memory SQLite storage engine. Due to a
            known Chromium internal C++ serialization bug (<a
              href="https://issues.chromium.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-indigo-400 underline hover:text-indigo-300">Issue #562119515</a
            >), persisting a native file handle into in-memory IndexedDB crashes the browser process
            instantly. This is a browser engine limitation that cannot be caught by JavaScript.
          </p>
        </div>

        <!-- Safe Alternatives -->
        <div class="space-y-3 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
          <div class="flex items-center gap-2 font-semibold text-zinc-100">
            <ShieldCheck class="h-4 w-4 shrink-0 text-emerald-400" />
            <span>Safe Ways to Restore & Sync in Incognito</span>
          </div>
          <ul class="space-y-2 text-[11px] text-zinc-400">
            <li class="flex items-start gap-2">
              <CheckCircle2 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <div>
                <strong class="text-zinc-200">Standard File Upload ("Select Backup File"):</strong>
                Standard HTML5 file upload reads the file in memory without saving native OS handles into
                IndexedDB. This is 100% safe and will never crash Chrome.
              </div>
            </li>
            <li class="flex items-start gap-2">
              <CheckCircle2 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <div>
                <strong class="text-zinc-200">GitHub Gist Cloud Sync:</strong>
                End-to-end encrypted synchronization with GitHub Gist operates completely in memory and
                REST API, safely functioning in Incognito mode.
              </div>
            </li>
            <li class="flex items-start gap-2">
              <CheckCircle2 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <div>
                <strong class="text-zinc-200">Regular Browser Window:</strong>
                For continuous live local file synchronization, simply open {APP_CONFIG.name} in a standard
                (non-Incognito) browser window or install it as a PWA.
              </div>
            </li>
          </ul>
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
