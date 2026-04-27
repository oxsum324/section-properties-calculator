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
 * 部署 base path 統一以環境變數 ANCHOR_BASE_PATH 控制。
 * - 預設 '/section-properties-calculator/anchor/'（GitHub Pages oxsum324 倉庫）
 * - Vercel / 自訂 domain：設 ANCHOR_BASE_PATH=/anchor/
 * - Tauri / 桌面包裝：設 ANCHOR_BASE_PATH=./
 * - 子路徑：設 ANCHOR_BASE_PATH=/structural-tools/anchor/
 *
 * service worker 的 APP_SHELL 路徑也由此值生成，無第二處需要同步。
 */
const ANCHOR_BASE_PATH =
  process.env.ANCHOR_BASE_PATH ?? '/section-properties-calculator/anchor/'

/**
 * build 結束後將 dist/service-worker.js 內的占位符替換：
 * - __BUILD_VERSION__：以 dist/index.html 哈希為版本戳
 * - __BASE_PATH__：以 ANCHOR_BASE_PATH 為實際部署 path
 * 失敗則記警告，不中斷 build。
 */
function serviceWorkerInjectPlugin(): Plugin {
  return {
    name: 'sw-inject',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve('dist/service-worker.js')
      const indexPath = path.resolve('dist/index.html')
      try {
        const index = readFileSync(indexPath, 'utf-8')
        const version = createHash('sha1').update(index).digest('hex').slice(0, 10)
        const original = readFileSync(swPath, 'utf-8')
        let updated = original.replaceAll('__BUILD_VERSION__', version)
        updated = updated.replaceAll('__BASE_PATH__', ANCHOR_BASE_PATH)
        if (updated !== original) {
          writeFileSync(swPath, updated)
        }
      } catch (error) {
        console.warn('[sw-inject] 無法注入 SW 版本/base path：', error)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: ANCHOR_BASE_PATH,
  plugins: [react(), serviceWorkerInjectPlugin()],
  define: {
    __APP_COMMIT_HASH__: JSON.stringify(BUILD_COMMIT_HASH),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIMESTAMP),
    __APP_BASE_PATH__: JSON.stringify(ANCHOR_BASE_PATH),
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
