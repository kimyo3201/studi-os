import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// ─────────────────────────────────────────────
// STUDY_OS 오프라인 지원
// GitHub Pages에서 /studi-os/ 경로로 서비스되므로
// Vite의 BASE_URL을 사용해서 정확한 경로를 잡는다.
// ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL

    navigator.serviceWorker
      .register(`${baseUrl}sw.js`, {
        scope: baseUrl,
      })
      .then((registration) => {
        console.log(
          '[STUDY_OS] Service Worker registered:',
          registration.scope
        )
      })
      .catch((error) => {
        console.warn(
          '[STUDY_OS] Service Worker registration failed:',
          error
        )
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
