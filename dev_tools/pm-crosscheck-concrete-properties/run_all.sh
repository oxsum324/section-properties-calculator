#!/usr/bin/env bash
# RC 柱 P-M 離線交叉驗證：小工具 vs concrete-properties（說明見同目錄 README.md）
# 輸出寫入 repo 內已忽略的 output/pm-crosscheck-concrete-properties/，不修改任何追蹤檔。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${PMX_OUT:-$REPO/output/pm-crosscheck-concrete-properties}"
mkdir -p "$OUT"
# Python：可用 PMX_PYTHON 指定已安裝 concreteproperties 的直譯器；否則在輸出夾建立 venv 並安裝固定版本
if [ -n "${PMX_PYTHON:-}" ]; then
  PY="$PMX_PYTHON"
else
  [ -x "$OUT/venv/bin/python" ] || { python3 -m venv "$OUT/venv" && "$OUT/venv/bin/pip" install -q concreteproperties==0.8.0 sectionproperties==3.10.2; }
  PY="$OUT/venv/bin/python"
fi
{
  echo "run_at: $(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S') (Asia/Taipei)"
  echo "repo_head: $(git -C "$REPO" rev-parse HEAD)"
  echo "repo_dirty_files: $(git -C "$REPO" status --porcelain | wc -l)"
  echo "node: $(node --version)"
  echo "python: $("$PY" --version 2>&1)"
  "$PY" -m pip show concreteproperties sectionproperties 2>/dev/null | grep -E '^(Name|Version|License):' || true
} > "$OUT/run_meta.txt"
node "$HERE/tool_pm.js" "$OUT"
"$PY" "$HERE/cp_pm.py" "$OUT"
"$PY" "$HERE/compare.py" "$OUT" > /dev/null
cat "$OUT/run_meta.txt"
echo "done: $OUT/compare_tables.md, $OUT/summary.json"
