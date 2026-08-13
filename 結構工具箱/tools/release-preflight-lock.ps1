function Get-ReleasePreflightMutexName {
  param([Parameter(Mandatory = $true)][string]$WorkspaceRoot)

  $resolvedRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ).ToUpperInvariant()
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($resolvedRoot))
  } finally {
    $sha256.Dispose()
  }
  $hex = -join ($digest | ForEach-Object { $_.ToString('x2') })
  return "Local\StructuralToolsReleasePreflight-$hex"
}

function Enter-ReleasePreflightLock {
  param([Parameter(Mandatory = $true)][string]$WorkspaceRoot)

  $name = Get-ReleasePreflightMutexName -WorkspaceRoot $WorkspaceRoot
  $mutex = [System.Threading.Mutex]::new($false, $name)
  $abandoned = $false
  try {
    try {
      $acquired = $mutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
      $abandoned = $true
    }
    if (-not $acquired) {
      throw "Another formal release preflight is already running for this workspace. Wait for it to finish; overlapping release evidence runs are not allowed."
    }
    return [pscustomobject]@{
      Mutex = $mutex
      Name = $name
      Abandoned = $abandoned
    }
  } catch {
    $mutex.Dispose()
    throw
  }
}

function Exit-ReleasePreflightLock {
  param(
    [AllowNull()][System.Threading.Mutex]$Mutex,
    [bool]$Acquired
  )

  if ($null -eq $Mutex) { return }
  try {
    if ($Acquired) { $Mutex.ReleaseMutex() }
  } finally {
    $Mutex.Dispose()
  }
}
