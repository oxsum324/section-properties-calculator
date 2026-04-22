import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 部署於 section-properties-calculator 主倉庫的 /anchor/ 子路徑，
  // 讓 React + Vite build 出來的 asset 以相對於此 base 的方式引用。
  base: '/anchor/',
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
