/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import path from 'path';
import packageJson from './package.json' with { type: 'json' };

function getAppVersion(): string {
  try {
    const gitDesc = execSync('git describe --tags --always', { encoding: 'utf-8' }).trim();
    return gitDesc.startsWith('v') ? gitDesc : `v${packageJson.version}-${gitDesc}`;
  } catch {
    return `v${packageJson.version}`;
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appName = env.VITE_APP_NAME || 'Vault2FA';
  const appTitle = env.VITE_APP_TITLE || 'Zero-Knowledge TOTP Authenticator';
  const appDesc =
    env.VITE_APP_DESCRIPTION ||
    'Privacy-first, zero-knowledge, local-first 2FA/TOTP authenticator PWA';
  const themeColor = env.VITE_APP_THEME_COLOR || '#09090b';

  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(getAppVersion()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      tailwindcss(),
      svelte(),
      {
        name: 'html-transform-branding',
        transformIndexHtml(html) {
          return html
            .replace(/%APP_NAME%/g, appName)
            .replace(/%APP_TITLE%/g, appTitle)
            .replace(/%APP_DESCRIPTION%/g, appDesc)
            .replace(/%APP_THEME_COLOR%/g, themeColor);
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: `${appName} - ${appTitle}`,
          short_name: appName,
          description: appDesc,
          theme_color: themeColor,
          background_color: themeColor,
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: 'icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: {
      alias: {
        $lib: path.resolve(import.meta.dirname, './src/lib'),
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,ts}'],
      globals: true,
    },
  };
});
