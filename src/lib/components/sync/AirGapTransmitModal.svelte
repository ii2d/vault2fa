<script lang="ts">
  import { onMount } from 'svelte';
  import {
    X,
    Play,
    Pause,
    ChevronLeft,
    ChevronRight,
    QrCode,
    ShieldCheck,
    Gauge,
  } from '@lucide/svelte';
  import { BrowserQRCodeSvgWriter } from '@zxing/library';
  import { vault } from '$lib/stores';
  import { encodeAirGapFrames } from '$lib/core/sync';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let frames = $state<string[]>([]);
  let currentIndex = $state(0);
  let isPlaying = $state(true);
  let fps = $state<3 | 5 | 8>(5);
  let currentSvgHtml = $state('');
  let timer: ReturnType<typeof setInterval> | null = null;
  let writer: BrowserQRCodeSvgWriter | null = null;

  async function initializeFrames() {
    try {
      const payload = await vault.getEncryptedPayload();
      frames = encodeAirGapFrames(payload, 280);
      currentIndex = 0;
      isPlaying = true;
    } catch {
      frames = [];
    }
  }

  function renderCurrentFrame() {
    if (frames.length === 0) return;
    if (!writer) {
      writer = new BrowserQRCodeSvgWriter();
    }
    try {
      const svgEl = writer.write(frames[currentIndex], 280, 280);
      currentSvgHtml = svgEl.outerHTML;
    } catch {
      currentSvgHtml = '';
    }
  }

  function startAnimation() {
    stopAnimation();
    if (!isPlaying) return;
    const intervalMs = Math.round(1000 / fps);
    timer = setInterval(() => {
      if (frames.length > 0) {
        currentIndex = (currentIndex + 1) % frames.length;
      }
    }, intervalMs);
  }

  function stopAnimation() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function handleTogglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      startAnimation();
    } else {
      stopAnimation();
    }
  }

  function handlePrev() {
    isPlaying = false;
    stopAnimation();
    if (frames.length > 0) {
      currentIndex = (currentIndex - 1 + frames.length) % frames.length;
    }
  }

  function handleNext() {
    isPlaying = false;
    stopAnimation();
    if (frames.length > 0) {
      currentIndex = (currentIndex + 1) % frames.length;
    }
  }

  function setFps(newFps: 3 | 5 | 8) {
    fps = newFps;
    if (isPlaying) {
      startAnimation();
    }
  }

  $effect(() => {
    if (isOpen) {
      initializeFrames();
    } else {
      stopAnimation();
    }
  });

  $effect(() => {
    if (isOpen && frames.length > 0) {
      renderCurrentFrame();
    }
  });

  $effect(() => {
    if (isOpen && isPlaying) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });

  onMount(() => {
    return () => stopAnimation();
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
      aria-label="Close transmit modal overlay"
    ></div>

    <!-- Modal Content -->
    <div
      class="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/90"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400"
          >
            <QrCode class="h-4 w-4" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-white">Air-Gap Transmit</h2>
            <p class="text-[11px] text-zinc-400">Animated frame-by-frame vault transfer</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Close transmit modal"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex flex-col items-center p-6">
        <!-- Security Pill -->
        <div
          class="mb-4 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400"
        >
          <ShieldCheck class="h-3.5 w-3.5" />
          <span>Zero-Knowledge AES-256-GCM Encrypted</span>
        </div>

        <!-- High contrast QR code frame -->
        <div
          class="flex aspect-square w-full max-w-[290px] items-center justify-center rounded-2xl bg-white p-2 shadow-xl shadow-indigo-500/10"
        >
          <div class="flex h-[280px] w-[280px] items-center justify-center">
            {#if currentSvgHtml}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html currentSvgHtml}
            {:else}
              <p class="text-xs text-zinc-500">Preparing encrypted frames...</p>
            {/if}
          </div>
        </div>

        <!-- Progress Indicator -->
        {#if frames.length > 0}
          <div class="mt-4 w-full">
            <div class="flex items-center justify-between text-xs font-medium text-zinc-300">
              <span>Frame {currentIndex + 1} of {frames.length}</span>
              <span class="font-mono text-indigo-400"
                >{Math.round(((currentIndex + 1) / frames.length) * 100)}%</span
              >
            </div>

            <!-- Frame progress ticks bar -->
            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full bg-indigo-500 transition-all duration-150"
                style="width: {((currentIndex + 1) / frames.length) * 100}%"
              ></div>
            </div>
          </div>
        {/if}

        <!-- Playback & Speed Controls -->
        <div class="mt-5 flex w-full items-center justify-between border-t border-white/10 pt-4">
          <!-- Frame Stepper Buttons -->
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onclick={handlePrev}
              class="rounded-xl border border-white/10 bg-zinc-800 p-2 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              title="Previous frame"
            >
              <ChevronLeft class="h-4 w-4" />
            </button>
            <button
              type="button"
              onclick={handleTogglePlay}
              class="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
              title={isPlaying ? 'Pause transmission' : 'Resume animation'}
            >
              {#if isPlaying}
                <Pause class="h-3.5 w-3.5" />
                <span>Pause</span>
              {:else}
                <Play class="h-3.5 w-3.5" />
                <span>Play</span>
              {/if}
            </button>
            <button
              type="button"
              onclick={handleNext}
              class="rounded-xl border border-white/10 bg-zinc-800 p-2 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              title="Next frame"
            >
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>

          <!-- FPS Selector -->
          <div class="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-950 p-1">
            <Gauge class="mx-1 h-3.5 w-3.5 text-zinc-500" />
            <button
              type="button"
              onclick={() => setFps(3)}
              class="rounded-lg px-2 py-1 text-[11px] font-medium {fps === 3
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'}"
            >
              3 fps
            </button>
            <button
              type="button"
              onclick={() => setFps(5)}
              class="rounded-lg px-2 py-1 text-[11px] font-medium {fps === 5
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'}"
            >
              5 fps
            </button>
            <button
              type="button"
              onclick={() => setFps(8)}
              class="rounded-lg px-2 py-1 text-[11px] font-medium {fps === 8
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'}"
            >
              8 fps
            </button>
          </div>
        </div>

        <p class="mt-4 text-center text-[11px] text-zinc-500">
          Point your receiving device's camera at this animated code. The frames will cycle
          continuously until all data is received.
        </p>
      </div>
    </div>
  </div>
{/if}
