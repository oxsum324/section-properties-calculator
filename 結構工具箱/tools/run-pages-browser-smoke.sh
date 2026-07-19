#!/usr/bin/env bash

set -euo pipefail

base_url="${1:?usage: run-pages-browser-smoke.sh <base-url> [session-name]}"
session="${2:-pages-browser-smoke}"
playwright_package='@playwright/cli@0.1.17'
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

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  result_json="$(npx --yes --package "$playwright_package" playwright-cli --json "-s=$session" run-code "$code")"
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
