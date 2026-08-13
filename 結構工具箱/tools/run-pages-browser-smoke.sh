#!/usr/bin/env bash

set -euo pipefail

base_url="${1:?usage: run-pages-browser-smoke.sh <base-url> [session-name]}"
session="${2:-pages-browser-smoke}"
runtime_dir="${PAGES_SMOKE_RUNTIME_DIR:-.github/pages-smoke}"
runtime_manifest="$runtime_dir/package.json"
playwright_manifest="$runtime_dir/node_modules/@playwright/cli/package.json"
terser_manifest="$runtime_dir/node_modules/terser/package.json"
playwright_cli="$runtime_dir/node_modules/@playwright/cli/playwright-cli.js"
terser_cli="$runtime_dir/node_modules/terser/bin/terser"
browser_smoke_source='結構工具箱/tools/pages-live-browser-smoke.js'
attempts="${PAGES_BROWSER_SMOKE_ATTEMPTS:-1}"
retry_delay_seconds="${PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS:-5}"

if ! [[ "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "PAGES_BROWSER_SMOKE_ATTEMPTS must be a positive integer" >&2
  exit 2
fi
if ! [[ "$retry_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS must be a non-negative integer" >&2
  exit 2
fi

node - "$runtime_manifest" "$playwright_manifest" "$terser_manifest" <<'NODE'
const fs = require('node:fs');
const [runtimePath, playwrightPath, terserPath] = process.argv.slice(2);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const runtime = readJson(runtimePath);
const playwright = readJson(playwrightPath);
const terser = readJson(terserPath);
if (runtime.dependencies?.['@playwright/cli'] !== playwright.version) {
  throw new Error(`Pages smoke Playwright version mismatch: expected ${runtime.dependencies?.['@playwright/cli']}, installed ${playwright.version}`);
}
if (runtime.dependencies?.terser !== terser.version) {
  throw new Error(`Pages smoke Terser version mismatch: expected ${runtime.dependencies?.terser}, installed ${terser.version}`);
}
NODE

cleanup() {
  node "$playwright_cli" "-s=$session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

node "$playwright_cli" install-browser chromium

open_json="$(node "$playwright_cli" --json "-s=$session" open "$base_url")"
node -e 'const value=JSON.parse(process.argv[1]);if(value.isError){throw new Error(value.error)}' "$open_json"

code="$(node "$terser_cli" "$browser_smoke_source" --compress 'side_effects=false' --mangle)"
code="${code%;}"
test -n "$code"

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  result_json="$(node "$playwright_cli" --json "-s=$session" run-code "$code")"
  if node -e 'const value=JSON.parse(process.argv[1]);process.exit(value.isError?1:0)' "$result_json"; then
    node -e 'const value=JSON.parse(process.argv[1]);const result=typeof value.result==="string"?value.result:JSON.stringify(value.result);console.log(`Pages browser smoke passed: ${result}`)' "$result_json"
    exit 0
  fi

  retryable=false
  if node -e 'const value=JSON.parse(process.argv[1]);const error=String(value.error||"");const transient=/\bstatus(?: of)? 5\d\d\b|"status":5\d\d|net::ERR_(?:TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|NETWORK_CHANGED|HTTP2_PROTOCOL_ERROR)\b/i;process.exit(transient.test(error)?0:1)' "$result_json"; then
    retryable=true
  fi

  if [[ "$retryable" == true && "$attempt" -lt "$attempts" ]]; then
    node -e 'const value=JSON.parse(process.argv[1]);console.error(`Pages browser smoke attempt failed with a transient network error:\n${value.error}`)' "$result_json"
    echo "Retrying the complete Pages browser smoke in ${retry_delay_seconds}s (attempt $((attempt + 1))/$attempts)..." >&2
    sleep "$retry_delay_seconds"
    continue
  fi

  node -e 'const value=JSON.parse(process.argv[1]);throw new Error(value.error)' "$result_json"
done
