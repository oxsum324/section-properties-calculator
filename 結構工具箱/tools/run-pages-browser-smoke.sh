#!/usr/bin/env bash

set -euo pipefail

base_url="${1:?usage: run-pages-browser-smoke.sh <base-url> [session-name]}"
session="${2:-pages-browser-smoke}"
playwright_package='@playwright/cli@0.1.17'
browser_smoke_source='結構工具箱/tools/pages-live-browser-smoke.js'

cleanup() {
  npx --yes --package "$playwright_package" playwright-cli "-s=$session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

npx --yes --package "$playwright_package" playwright-cli install-browser chromium

open_json="$(npx --yes --package "$playwright_package" playwright-cli --json "-s=$session" open "$base_url")"
node -e 'const value=JSON.parse(process.argv[1]);if(value.isError){throw new Error(value.error)}' "$open_json"

code="$(npx --yes 'terser@5.49.0' "$browser_smoke_source" --compress 'side_effects=false' --mangle)"
code="${code%;}"
test -n "$code"

result_json="$(npx --yes --package "$playwright_package" playwright-cli --json "-s=$session" run-code "$code")"
node -e 'const value=JSON.parse(process.argv[1]);if(value.isError){throw new Error(value.error)};const result=typeof value.result==="string"?value.result:JSON.stringify(value.result);console.log(`Pages browser smoke passed: ${result}`)' "$result_json"
