import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { registerServiceWorker } from './pwa'

// SW 偵測到新版時，發 CustomEvent 給 App 元件監聽，由 App 顯示 toast / banner
registerServiceWorker({
  onUpdateAvailable: (registration) => {
    window.dispatchEvent(
      new CustomEvent('bolt-review-tool:sw-update-available', {
        detail: { registration },
      }),
    )
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
