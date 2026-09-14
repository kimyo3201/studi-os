import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 새 배포가 감지돼도 작성 중 화면을 강제로 새로고침하지 않는다.
      // 새 Service Worker는 모든 기존 탭이 닫힌 뒤 안전하게 활성화된다.
      registerType: 'prompt',
      injectRegister: 'auto',
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
          '**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,json,woff,woff2}',
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // 사용 중인 페이지를 새 배포가 즉시 탈취하지 않도록 명시적으로 끈다.
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [
          {
            // Supabase 데이터 API는 절대 Service Worker 캐시를 거치지 않는다.
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  base: '/',
})
