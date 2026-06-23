param()

$ErrorActionPreference = "Stop"

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $toolsDir
$sharedDir = Join-Path $root "shared"

$tests = @(
  @{ Label = "P-M section shared regression"; Path = Join-Path $sharedDir "pmsection.test.js" },
  @{ Label = "Load case shared regression"; Path = Join-Path $sharedDir "loadcases.test.js" },
  @{ Label = "Wall base shared regression"; Path = Join-Path $sharedDir "wall-base.test.js" },
  @{ Label = "Wall evaluator shared regression"; Path = Join-Path $sharedDir "wall-evaluator.test.js" },
  @{ Label = "Shear wall page regression"; Path = Join-Path $toolsDir "shear-wall-regression.test.js" }
)

foreach ($test in $tests) {
  Write-Output "=== $($test.Label) ==="
  node $test.Path
}

Write-Output "Shear wall test suite completed cleanly."
