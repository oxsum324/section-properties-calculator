import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 部署於 GitHub Pages 的 oxsum324/section-properties-calculator 倉庫，
  // 站點實際路徑為 /section-properties-calculator/，因此 /anchor/ 需含 repo 前綴。
  // 若日後遷至 Vercel 或自訂 domain，此處調整為 '/anchor/' 即可。
  base: '/section-properties-calculator/anchor/',
  plugins: [react()],
  build: {
    // XLSX 匯出改由 lazy chunk 載入；此 chunk 會帶入 workbook 引擎，
    // 比主應用大很多，但不影響首頁載入，因此提高 warning 門檻避免假警報。
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
