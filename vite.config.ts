import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import glsl from 'vite-plugin-glsl'
import { VitePWA } from 'vite-plugin-pwa'

const repoRoot = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')
) as { version?: string }

const envBuildNumber = Number(
  process.env.BUILD_NUMBER ??
    process.env.CF_PAGES_BUILD_NUMBER ??
    process.env.GITHUB_RUN_NUMBER ??
    ''
)

let shortSha = 'nogit'
try {
  shortSha =
    execSync('git rev-parse --short=8 HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim() || 'nogit'
} catch {
  // Fallback for environments without git metadata.
}

let commitCount = 0
try {
  const parsedCount = Number(
    execSync('git rev-list --count HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  )
  commitCount = Number.isFinite(parsedCount) ? parsedCount : 0
} catch {
  // Fallback for environments without git metadata.
}

const buildNumber =
  Number.isFinite(envBuildNumber) && envBuildNumber > 0
    ? envBuildNumber
    : commitCount

const appBuild = {
  version: packageJson.version ?? '0.0.0',
  sha: shortSha,
  number: buildNumber,
  commitCount,
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    wasm(),
    glsl(),
    ...(command === 'build'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            manifest: {
              name: 'Time in Transit',
              short_name: 'Time in Transit',
              start_url: '/',
              scope: '/',
              display: 'fullscreen',
              orientation: 'landscape',
              theme_color: '#05070d',
              background_color: '#05070d',
              icons: [
                {
                  src: '/icons/icon-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
                {
                  src: '/icons/icon-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                },
                {
                  src: '/icons/app-icon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any maskable',
                },
              ],
            },
            includeAssets: ['icons/app-icon.svg', 'icons/apple-touch-icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
            workbox: {
              cleanupOutdatedCaches: true,
              navigateFallback: '/index.html',
              globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,wasm}'],
              runtimeCaching: [
                {
                  urlPattern: ({ sameOrigin, url }) =>
                    sameOrigin && url.pathname.startsWith('/assets/'),
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'app-assets',
                    expiration: {
                      maxEntries: 200,
                      maxAgeSeconds: 60 * 60 * 24 * 365,
                    },
                  },
                },
                {
                  urlPattern: ({ sameOrigin, url }) =>
                    sameOrigin && url.pathname.startsWith('/icons/'),
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'app-icons',
                    expiration: {
                      maxEntries: 20,
                      maxAgeSeconds: 60 * 60 * 24 * 365,
                    },
                  },
                },
              ],
            },
          }),
        ]
      : []),
  ],
  define: {
    __APP_BUILD__: JSON.stringify(appBuild),
  },
}))
