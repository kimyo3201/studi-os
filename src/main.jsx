import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Service Worker 등록은 vite-plugin-pwa 하나만 담당한다.
// 수동 navigator.serviceWorker.register('/sw.js')는 사용하지 않는다.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
