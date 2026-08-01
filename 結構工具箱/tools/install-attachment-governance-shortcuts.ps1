[CmdletBinding()]
param(
  [string]$DesktopPath = [Environment]::GetFolderPath('Desktop'),
  [string]$SendToPath = [Environment]::GetFolderPath('SendTo'),
  [string]$ProgramsPath = [Environment]::GetFolderPath('Programs'),
  [switch]$Check,
  [switch]$Remove,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

if ($Check -and $Remove) {
  throw '檢查與移除模式不可同時使用。'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$targetPath = [IO.Path]::GetFullPath((Join-Path $repoRoot '啟動案件附件工作台.bat'))
$managedMarker = '案件附件工作台捷徑（由小工具安裝器管理）'
$iconLocation = "$env:SystemRoot\System32\shell32.dll,71"

if (-not $Check -and -not $Remove -and -not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
  throw "找不到受治理的工作台入口：$targetPath"
}

$desktopFullPath = [IO.Path]::GetFullPath($DesktopPath)
$sendToFullPath = [IO.Path]::GetFullPath($SendToPath)
$programsFullPath = [IO.Path]::GetFullPath($ProgramsPath)
foreach ($destination in @($desktopFullPath, $sendToFullPath, $programsFullPath)) {
  if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw "捷徑目的資料夾不存在：$destination"
  }
}

$shell = New-Object -ComObject WScript.Shell
$specs = @(
  [pscustomobject]@{
    Kind = 'desktop'
    Label = '桌面'
    Path = Join-Path $desktopFullPath '案件附件工作台.lnk'
    Description = "$managedMarker：開啟工作台"
  },
  [pscustomobject]@{
    Kind = 'send-to'
    Label = '傳送到'
    Path = Join-Path $sendToFullPath '以附件工作台檢查.lnk'
    Description = "$managedMarker：將單一資料夾交給唯讀辨識"
  },
  [pscustomobject]@{
    Kind = 'start-menu'
    Label = '開始功能表'
    Path = Join-Path $programsFullPath '案件附件工作台.lnk'
    Description = "$managedMarker：從 Windows 搜尋開啟工作台"
  }
)

function Get-ShortcutState {
  param([Parameter(Mandatory)][string]$Path)

  $shortcut = $shell.CreateShortcut($Path)
  return [pscustomobject]@{
    TargetPath = [string]$shortcut.TargetPath
    WorkingDirectory = [string]$shortcut.WorkingDirectory
    Arguments = [string]$shortcut.Arguments
    Description = [string]$shortcut.Description
    IconLocation = [string]$shortcut.IconLocation
  }
}

function Test-ShortcutCurrent {
  param(
    [Parameter(Mandatory)]$State,
    [Parameter(Mandatory)]$Spec
  )

  return (
    $State.TargetPath -ieq $targetPath -and
    $State.WorkingDirectory -ieq $repoRoot -and
    [string]::IsNullOrEmpty($State.Arguments) -and
    $State.Description -ceq $Spec.Description -and
    $State.IconLocation -ieq $iconLocation
  )
}

function Test-ShortcutManaged {
  param([Parameter(Mandatory)]$State)

  $targetLeaf = if ([string]::IsNullOrWhiteSpace($State.TargetPath)) { '' } else { [IO.Path]::GetFileName($State.TargetPath) }
  return $State.Description.StartsWith($managedMarker, [StringComparison]::Ordinal) -or $targetLeaf -ieq '啟動案件附件工作台.bat'
}

function Test-ShortcutRemovable {
  param([Parameter(Mandatory)]$State)

  return $State.Description.StartsWith($managedMarker, [StringComparison]::Ordinal) -or $State.TargetPath -ieq $targetPath
}

function Assert-ShortcutInstallable {
  param([Parameter(Mandatory)]$Spec)

  if (-not (Test-Path -LiteralPath $Spec.Path -PathType Leaf)) { return }
  $existing = Get-ShortcutState -Path $Spec.Path
  if ((Test-ShortcutCurrent -State $existing -Spec $Spec) -or (Test-ShortcutManaged -State $existing)) { return }
  throw "已有同名但非本工具管理的捷徑，已保留原檔：$($Spec.Path)"
}

function Install-Shortcut {
  param([Parameter(Mandatory)]$Spec)

  $status = 'created'
  if (Test-Path -LiteralPath $Spec.Path -PathType Leaf) {
    $existing = Get-ShortcutState -Path $Spec.Path
    if (Test-ShortcutCurrent -State $existing -Spec $Spec) {
      return [pscustomobject]@{ kind = $Spec.Kind; status = 'current'; path = $Spec.Path }
    }
    if (-not (Test-ShortcutManaged -State $existing)) {
      throw "已有同名但非本工具管理的捷徑，已保留原檔：$($Spec.Path)"
    }
    $status = 'updated'
  }

  $temporaryPath = Join-Path ([IO.Path]::GetDirectoryName($Spec.Path)) (".{0}.installing-{1}.lnk" -f [IO.Path]::GetFileNameWithoutExtension($Spec.Path), [guid]::NewGuid().ToString('N'))
  try {
    $shortcut = $shell.CreateShortcut($temporaryPath)
    $shortcut.TargetPath = $targetPath
    $shortcut.WorkingDirectory = $repoRoot
    $shortcut.Arguments = ''
    $shortcut.Description = $Spec.Description
    $shortcut.IconLocation = $iconLocation
    $shortcut.Save()

    $staged = Get-ShortcutState -Path $temporaryPath
    if (-not (Test-ShortcutCurrent -State $staged -Spec $Spec)) {
      throw "捷徑建立後驗證失敗：$($Spec.Path)"
    }

    Move-Item -LiteralPath $temporaryPath -Destination $Spec.Path -Force
    $installed = Get-ShortcutState -Path $Spec.Path
    if (-not (Test-ShortcutCurrent -State $installed -Spec $Spec)) {
      throw "捷徑安裝後驗證失敗：$($Spec.Path)"
    }
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }

  return [pscustomobject]@{ kind = $Spec.Kind; status = $status; path = $Spec.Path }
}

function Remove-ManagedShortcut {
  param([Parameter(Mandatory)]$Spec)

  if (-not (Test-Path -LiteralPath $Spec.Path -PathType Leaf)) {
    return [pscustomobject]@{ kind = $Spec.Kind; status = 'absent'; path = $Spec.Path }
  }

  $existing = Get-ShortcutState -Path $Spec.Path
  if (-not (Test-ShortcutRemovable -State $existing)) {
    return [pscustomobject]@{ kind = $Spec.Kind; status = 'preserved'; path = $Spec.Path }
  }

  Remove-Item -LiteralPath $Spec.Path -Force
  if (Test-Path -LiteralPath $Spec.Path) {
    throw "受管理捷徑移除後驗證失敗：$($Spec.Path)"
  }
  return [pscustomobject]@{ kind = $Spec.Kind; status = 'removed'; path = $Spec.Path }
}

function Get-ShortcutInspection {
  param([Parameter(Mandatory)]$Spec)

  if (-not (Test-Path -LiteralPath $Spec.Path -PathType Leaf)) {
    return [pscustomobject]@{ kind = $Spec.Kind; status = 'absent'; path = $Spec.Path }
  }

  $existing = Get-ShortcutState -Path $Spec.Path
  if (Test-ShortcutCurrent -State $existing -Spec $Spec) {
    return [pscustomobject]@{ kind = $Spec.Kind; status = 'current'; path = $Spec.Path }
  }
  if (Test-ShortcutManaged -State $existing) {
    return [pscustomobject]@{ kind = $Spec.Kind; status = 'repairable'; path = $Spec.Path }
  }
  return [pscustomobject]@{ kind = $Spec.Kind; status = 'foreign'; path = $Spec.Path }
}

$targetAvailable = [bool](Test-Path -LiteralPath $targetPath -PathType Leaf)
$resultStatus = $null
$resultExitCode = 0
if ($Check) {
  $operation = 'check'
  $results = @($specs | ForEach-Object { Get-ShortcutInspection -Spec $_ })
  if (-not $targetAvailable -or @($results | Where-Object { $_.status -eq 'foreign' }).Count -gt 0) {
    $resultStatus = 'blocked'
    $resultExitCode = 2
  } elseif (@($results | Where-Object { $_.status -ne 'current' }).Count -gt 0) {
    $resultStatus = 'review'
    $resultExitCode = 1
  } else {
    $resultStatus = 'ready'
  }
} elseif ($Remove) {
  $operation = 'remove'
  $results = @($specs | ForEach-Object { Remove-ManagedShortcut -Spec $_ })
} else {
  $operation = 'install'
  $specs | ForEach-Object { Assert-ShortcutInstallable -Spec $_ }
  $results = @($specs | ForEach-Object { Install-Shortcut -Spec $_ })
}
$payload = [ordered]@{
  version = 1
  operation = $operation
  target = $targetPath
  targetAvailable = $targetAvailable
  workingDirectory = $repoRoot
  shortcuts = $results
}
if ($Check) {
  $payload['status'] = $resultStatus
}

if ($Json) {
  $payload | ConvertTo-Json -Depth 4 -Compress
} else {
  foreach ($item in $results) {
    "[{0}] {1}" -f $item.status, $item.path
  }
  if ($Check) {
    "唯讀檢查結果：$resultStatus；未建立、更新或移除任何捷徑。"
  } elseif ($Remove) {
    '已只處理本工具管理的捷徑；同名使用者捷徑會保留。'
  } else {
    '桌面可直接開啟；案件資料夾可用右鍵「傳送到」進入唯讀辨識；也可按 Windows 鍵搜尋「案件附件工作台」。'
  }
}

if ($Check) { exit $resultExitCode }
