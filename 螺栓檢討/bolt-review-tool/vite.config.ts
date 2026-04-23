import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * 取得當前 git commit 短 hash；CI / 無 git 環境回傳 'local'。
 */
function getBuildCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
}

const BUILD_COMMIT_HASH = getBuildCommitHash()
const BUILD_TIMESTAMP = new Date().toISOString()

/**
 * build 結束後將 dist/service-worker.js 內的 __BUILD_VERSION__ 佔位符
 * 替換為 dist 下主要 asset bundle 的 hash，避免舊 SW 吃到新 bundle。
 * 失敗則記警告，不中斷 build。
 */
function serviceWorkerVersionPlugin(): Plugin {
  return {
    name: 'sw-version-inject',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve('dist/service-worker.js')
      const indexPath = path.resolve('dist/index.html')
      try {
        const index = readFileSync(indexPath, 'utf-8')
        // 用 index.html 整頁哈希作為版本戳（asset hash 已包含在內）
        const version = createHash('sha1').update(index).digest('hex').slice(0, 10)
        const original = readFileSync(swPath, 'utf-8')
        if (!original.includes('__BUILD_VERSION__')) {
          return
        }
        const updated = original.replaceAll('__BUILD_VERSION__', version)
        writeFileSync(swPath, updated)
      } catch (error) {
        console.warn('[sw-version-inject] 無法注入 SW 版本：', error)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 部署於 GitHub Pages 的 oxsum324/section-properties-calculator 倉庫，
  // 站點實際路徑為 /section-properties-calculator/，因此 /anchor/ 需含 repo 前綴。
  // 若日後遷至 Vercel 或自訂 domain，此處調整為 '/anchor/' 即可。
  base: '/section-properties-calculator/anchor/',
  plugins: [react(), serviceWorkerVersionPlugin()],
  define: {
    __APP_COMMIT_HASH__: JSON.stringify(BUILD_COMMIT_HASH),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIMESTAMP),
  },
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
