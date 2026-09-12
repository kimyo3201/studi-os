import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',

      manifest: {
        name: 'STUDY_OS',
        short_name: 'STUDY_OS',
        description: 'STUDY_OS',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
      },

      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,json,woff,woff2}'
        ],

        navigateFallback: '/index.html',

        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],

  base: '/',
})
