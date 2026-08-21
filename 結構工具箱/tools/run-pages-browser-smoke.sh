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
result_normalizer="$runtime_dir/normalize-playwright-result.js"
attempts="${PAGES_BROWSER_SMOKE_ATTEMPTS:-1}"
retry_delay_seconds="${PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS:-5}"
result_file="${PAGES_BROWSER_SMOKE_RESULT_FILE:-}"
started_ms="$(date +%s%3N)"
attempt_count=0
result_written=false

if ! [[ "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "PAGES_BROWSER_SMOKE_ATTEMPTS must be a positive integer" >&2
  exit 2
fi
if ! [[ "$retry_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "PAGES_BROWSER_SMOKE_RETRY_DELAY_SECONDS must be a non-negative integer" >&2
  exit 2
fi

write_result() {
  local status="$1"
  local cli_json="${2:-}"
  local duration_ms="$(($(date +%s%3N) - started_ms))"
  if [[ -z "$result_file" ]]; then
    result_written=true
    return
  fi
  node - "$result_file" "$status" "$duration_ms" "$attempt_count" "$cli_json" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [targetValue, status, durationValue, attemptValue, cliJson] = process.argv.slice(2);
const target = path.resolve(targetValue);
const payload = {
  schemaVersion: 1,
  kind: 'pages-browser-smoke',
  status,
  durationMs: Number(durationValue),
  attemptCount: Math.max(1, Number(attemptValue) || 1),
};
if (status === 'passed') {
  const result = JSON.parse(cliJson);
  payload.routes = result.routes;
  payload.checks = result.checks;
  payload.issues = result.issues;
}
fs.mkdirSync(path.dirname(target), { recursive: true });
const temporary = `${target}.${process.pid}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(payload)}\n`, 'utf8');
fs.renameSync(temporary, target);
NODE
  result_written=true
}

cleanup() {
  local exit_code=$?
  if [[ "$result_written" != true ]]; then
    write_result failed || true
  fi
  node "$playwright_cli" "-s=$session" close >/dev/null 2>&1 || true
  return "$exit_code"
}
trap cleanup EXIT

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

node "$playwright_cli" install-browser chromium

open_json="$(node "$playwright_cli" --json "-s=$session" open "$base_url")"
node -e 'const value=JSON.parse(process.argv[1]);if(value.isError){throw new Error(value.error)}' "$open_json"

code="$(node "$terser_cli" "$browser_smoke_source" --compress 'side_effects=false' --mangle)"
code="${code%;}"
test -n "$code"

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  attempt_count="$attempt"
  result_json="$(node "$playwright_cli" --json "-s=$session" run-code "$code")"
  if node -e 'const value=JSON.parse(process.argv[1]);process.exit(value.isError?1:0)' "$result_json"; then
    normalized_result_json="$(node "$result_normalizer" "$result_json")"
    write_result passed "$normalized_result_json"
    echo "Pages browser smoke passed: $normalized_result_json"
    echo "pagesBrowserSmokeAttemptCount=$attempt_count"
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
