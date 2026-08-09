[CmdletBinding()]
param(
  [switch]$Smoke,
  [switch]$SmokeReadOnlyCancellation,
  [switch]$SmokeReadOnlyCompletion,
  [switch]$SmokeKeyboard,
  [switch]$SmokeViewport,
  [switch]$SmokeDragDrop,
  [switch]$SmokeBuildResponsiveness,
  [ValidateRange(0, 5000)][int]$WorkerSmokeDelayMilliseconds = 0,
  [string]$InitialPath = '',
  [ValidateSet('source', 'verify')][string]$InitialMode = 'source',
  [switch]$AutoInspect
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:ToolDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:WorkerPath = Join-Path $script:ToolDirectory 'attachment-package-manager-worker.js'
$script:LastReadyInput = ''
$script:LastReadyProjectNo = ''
$script:LastOutputDirectory = ''
$script:LastSuggestedOutput = ''
$script:ReadOnlyProcess = $null
$script:ReadOnlyAction = ''
$script:ReadOnlyInput = ''
$script:ReadOnlyProjectNo = ''
$script:ReadOnlyResultFile = ''
$script:ReadOnlyStartedAt = $null
$script:ReadOnlyTimer = $null
$script:CancellationSmokeTimer = $null
$script:CancellationSmokeResult = $null
$script:CompletionSmokeTimer = $null
$script:CompletionSmokeResult = $null
$script:CompletionSmokeWorkerPid = 0
$script:CompletionSmokeResultFile = ''
$script:KeyboardSmokeTimer = $null
$script:KeyboardSmokeResult = $null
$script:KeyboardSmokeState = $null
$script:ViewportSmokeTimer = $null
$script:ViewportSmokeResult = $null
$script:DragDropSmokeTimer = $null
$script:DragDropSmokeResult = $null
$script:BuildProcess = $null
$script:BuildResultFile = ''
$script:BuildProgressFile = ''
$script:BuildStartedAt = $null
$script:BuildStatusLastElapsedSecond = -1
$script:BuildPhase = 'preparing-source'
$script:BuildTimer = $null
$script:BuildSmokeTimer = $null
$script:BuildSmokeState = $null
$script:BuildSmokeResult = $null
$script:BuildSmokeFixtureRoot = ''
$script:ActiveMode = $InitialMode

$dynamicSmokeCount = @(@($SmokeReadOnlyCancellation, $SmokeReadOnlyCompletion, $SmokeKeyboard, $SmokeViewport, $SmokeDragDrop, $SmokeBuildResponsiveness) | Where-Object { $_ }).Count
if ($Smoke -and $dynamicSmokeCount) { throw '一般 smoke 與背景動態 smoke 不得同時執行。' }
if ($dynamicSmokeCount -gt 1) { throw '一次只能執行一種背景動態 smoke。' }

function Get-NodePath {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { $command = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $command) { throw '找不到 Node.js；請先安裝 Node.js 後再開啟附件包管理器。' }
  return $command.Source
}

function Invoke-AttachmentWorker {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('smoke', 'check', 'build', 'verify')][string]$Action,
    [string]$InputDirectory = '',
    [string]$OutputDirectory = '',
    [string]$ProjectNo = ''
  )

  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) {
    throw "找不到附件包管理器核心：$script:WorkerPath"
  }
  $arguments = @($script:WorkerPath, '--action', $Action)
  if ($InputDirectory.Trim()) { $arguments += @('--input', $InputDirectory.Trim()) }
  if ($OutputDirectory.Trim()) { $arguments += @('--output', $OutputDirectory.Trim()) }
  if ($ProjectNo.Trim()) { $arguments += @('--project-no', $ProjectNo.Trim()) }

  $previousOutputEncoding = [Console]::OutputEncoding
  try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $raw = @(& (Get-NodePath) @arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    [Console]::OutputEncoding = $previousOutputEncoding
  }
  $json = ($raw | ForEach-Object { $_.ToString() }) -join "`n"
  try {
    $response = $json | ConvertFrom-Json
  } catch {
    throw "附件包管理器核心未回傳有效結果（exit=$exitCode）：$json"
  }
  $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
  return $response
}

if ($Smoke) {
  $response = Invoke-AttachmentWorker -Action smoke
  [pscustomobject]@{
    status = $response.status
    windowsFormsLoaded = $true
    workerPath = $script:WorkerPath
    workerExitCode = $response.workerExitCode
    message = $response.displayText
  } | ConvertTo-Json -Compress
  if ($response.status -ne 'ready') { exit 3 }
  exit 0
}

function New-FolderDialog {
  param([string]$Description, [string]$SelectedPath = '')
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $true
  if ($SelectedPath -and (Test-Path -LiteralPath $SelectedPath -PathType Container)) {
    $dialog.SelectedPath = $SelectedPath
  }
  return $dialog
}

function Select-Folder {
  param([string]$Description, [string]$SelectedPath = '')
  $dialog = New-FolderDialog -Description $Description -SelectedPath $SelectedPath
  try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }
    return ''
  } finally {
    $dialog.Dispose()
  }
}

function Select-FormalSourceZip {
  param([string]$SelectedPath = '')
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = '選擇 PDF＋證據來源 ZIP'
  $dialog.Filter = 'PDF＋證據來源 ZIP (*.formal-source.zip)|*.formal-source.zip'
  $dialog.Multiselect = $false
  $dialog.CheckFileExists = $true
  if ($SelectedPath -and (Test-Path -LiteralPath $SelectedPath -PathType Leaf)) {
    $dialog.FileName = $SelectedPath
  } elseif ($SelectedPath) {
    $parent = Split-Path -Parent $SelectedPath -ErrorAction SilentlyContinue
    if ($parent -and (Test-Path -LiteralPath $parent -PathType Container)) { $dialog.InitialDirectory = $parent }
  }
  try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    return ''
  } finally {
    $dialog.Dispose()
  }
}

function Get-SourceBaseName {
  param([string]$SourcePath = '')
  if (-not $SourcePath.Trim()) { return '附件' }
  $name = Split-Path $SourcePath.Trim() -Leaf
  if ($name.EndsWith('.formal-source.zip', [System.StringComparison]::Ordinal)) {
    return $name.Substring(0, $name.Length - '.formal-source.zip'.Length)
  }
  return $name
}

function Get-ResponseValue {
  param($Object, [string]$Name, $Fallback = '')
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
    return $Object.$Name
  }
  return $Fallback
}

function Set-StatusAppearance {
  param([string]$Status, [string]$Title)
  $script:StatusTitle.Text = $Title
  switch ($Status) {
    'ready' {
      $script:StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(232, 245, 236)
      $script:StatusTitle.ForeColor = [System.Drawing.Color]::FromArgb(27, 138, 58)
    }
    'review' {
      $script:StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(255, 247, 230)
      $script:StatusTitle.ForeColor = [System.Drawing.Color]::FromArgb(146, 64, 14)
    }
    default {
      $script:StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(251, 234, 234)
      $script:StatusTitle.ForeColor = [System.Drawing.Color]::FromArgb(192, 57, 43)
    }
  }
}

function Show-WorkerResponse {
  param($Response)
  $status = [string](Get-ResponseValue $Response 'status' 'error')
  $title = [string](Get-ResponseValue $Response 'title' '附件包管理器未取得結果')
  Set-StatusAppearance -Status $status -Title $title

  $counts = Get-ResponseValue $Response 'counts' $null
  if ($counts) {
    $parts = @()
    foreach ($property in $counts.PSObject.Properties) { $parts += "$($property.Name)=$($property.Value)" }
    $script:StatusMeta.Text = $parts -join ' ｜ '
  } else {
    $script:StatusMeta.Text = ''
  }

  $script:ResultGrid.Rows.Clear()
  foreach ($record in @(Get-ResponseValue $Response 'records' @())) {
    [void]$script:ResultGrid.Rows.Add(
      [string](Get-ResponseValue $record 'file'),
      [string](Get-ResponseValue $record 'role'),
      [string](Get-ResponseValue $record 'state'),
      [string](Get-ResponseValue $record 'tool'),
      [string](Get-ResponseValue $record 'version'),
      [string](Get-ResponseValue $record 'fingerprint'),
      [string](Get-ResponseValue $record 'result')
    )
  }
  $script:DetailsBox.Text = [string](Get-ResponseValue $Response 'displayText')
  $script:BottomStatus.Text = "狀態：$status ｜ 核心退出碼：$([string](Get-ResponseValue $Response 'workerExitCode'))"
}

function Set-BuildUiState {
  param([bool]$Running)
  $script:MainForm.UseWaitCursor = $false
  $script:SourcePath.ReadOnly = $Running
  $script:ProjectNo.ReadOnly = $Running
  $script:OutputPath.ReadOnly = $Running
  $script:PackagePath.ReadOnly = $Running
  $script:BtnBrowseSource.Enabled = -not $Running
  $script:BtnBrowseSourceZip.Enabled = -not $Running
  $script:BtnBrowseOutput.Enabled = -not $Running
  $script:BtnBrowsePackage.Enabled = -not $Running
  $script:BtnCheck.Enabled = -not $Running
  $script:BtnVerify.Enabled = -not $Running
  $script:BtnBuild.Enabled = $false
  $script:BtnBuild.Text = if ($Running) { '正在建立正式附件包…' } else { '2. 建立正式附件包' }
  $script:BtnOpenOutput.Enabled = (-not $Running) -and $script:LastOutputDirectory -and (Test-Path -LiteralPath $script:LastOutputDirectory -PathType Container)
}

function Show-OperationError {
  param([System.Exception]$ErrorRecord)
  Set-StatusAppearance -Status 'error' -Title '附件包管理器執行失敗'
  $script:StatusMeta.Text = ''
  $script:DetailsBox.Text = $ErrorRecord.Message
  $script:BottomStatus.Text = '狀態：error'
}

function Show-DropRejected {
  param([System.Exception]$ErrorRecord)
  Set-StatusAppearance -Status 'review' -Title '拖放路徑未接受'
  $script:StatusMeta.Text = '未變更目前路徑；未執行檢查、驗證或建立。'
  $script:DetailsBox.Text = $ErrorRecord.Message
  $script:BottomStatus.Text = '狀態：拖放未接受；未執行檢查或建立'
}

function Test-ManagerDropPath {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('source', 'verify')][string]$Mode,
    [string]$CandidatePath
  )
  $candidate = [string]$CandidatePath
  if (-not $candidate.Trim()) { return $false }
  try {
    $item = Get-Item -LiteralPath $candidate.Trim() -Force -ErrorAction Stop
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
    if ($Mode -eq 'verify') { return [bool]$item.PSIsContainer }
    if ($item.PSIsContainer) { return $true }
    return [bool]$item.Name.EndsWith('.formal-source.zip', [System.StringComparison]::Ordinal)
  } catch {
    return $false
  }
}

function Get-ManagerDropPaths {
  param([System.Windows.Forms.IDataObject]$Data)
  if (-not $Data -or -not $Data.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) { return @() }
  return @($Data.GetData([System.Windows.Forms.DataFormats]::FileDrop) | ForEach-Object { [string]$_ })
}

function Set-ManagerDroppedPath {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('source', 'verify')][string]$Mode,
    [string[]]$Paths
  )
  if (@($Paths).Count -ne 1) {
    throw $(if ($Mode -eq 'source') { '來源區一次只能拖入一個資料夾或 .formal-source.zip。' } else { '驗證區一次只能拖入一個正式附件包資料夾；來源 ZIP 不可在此驗證。' })
  }
  $candidate = [string]$Paths[0]
  if (-not (Test-ManagerDropPath -Mode $Mode -CandidatePath $candidate)) {
    throw $(if ($Mode -eq 'source') { '來源區只接受單一現有實體資料夾或檔名精確以 .formal-source.zip 結尾的實體檔案；一般檔案、連結與特殊項目不會帶入。' } else { '驗證區只接受單一現有實體正式附件包資料夾；來源 ZIP、一般檔案、連結與特殊項目不會帶入。' })
  }
  $resolvedPath = (Resolve-Path -LiteralPath $candidate.Trim()).ProviderPath
  if ($script:ReadOnlyProcess) { Cancel-ReadOnlyOperation }
  $script:ActiveMode = $Mode
  if ($Mode -eq 'source') {
    $script:SourcePath.Text = $resolvedPath
    [void]$script:SourcePath.Focus()
    $script:ScrollViewport.ScrollControlIntoView($script:SourcePath)
    $script:BtnCheck.PerformClick()
  } else {
    $script:PackagePath.Text = $resolvedPath
    [void]$script:PackagePath.Focus()
    $script:ScrollViewport.ScrollControlIntoView($script:PackagePath)
    $script:BtnVerify.PerformClick()
  }
  return $resolvedPath
}

function New-ReadOnlyResultPath {
  $name = "attachment-package-manager-result-$PID-$([guid]::NewGuid().ToString('N')).json"
  return [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), $name)
}

function New-BuildProgressPath {
  $name = "attachment-package-manager-progress-$PID-$([guid]::NewGuid().ToString('N')).jsonl"
  return [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), $name)
}

function Remove-ReadOnlyResultFile {
  param([string]$ResultFile)
  if (-not $ResultFile) { return }
  $resolved = [System.IO.Path]::GetFullPath($ResultFile)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  $parent = [System.IO.Path]::GetDirectoryName($resolved).TrimEnd('\')
  $name = [System.IO.Path]::GetFileName($resolved)
  if ($parent -eq $tempRoot -and $name.StartsWith('attachment-package-manager-result-') -and $name.EndsWith('.json')) {
    Remove-Item -LiteralPath $resolved -Force -ErrorAction SilentlyContinue
  }
}

function Remove-BuildProgressFile {
  param([string]$ProgressFile)
  if (-not $ProgressFile) { return }
  $resolved = [System.IO.Path]::GetFullPath($ProgressFile)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  $parent = [System.IO.Path]::GetDirectoryName($resolved).TrimEnd('\')
  $name = [System.IO.Path]::GetFileName($resolved)
  if ($parent -eq $tempRoot -and $name.StartsWith('attachment-package-manager-progress-') -and $name.EndsWith('.jsonl')) {
    Remove-Item -LiteralPath $resolved -Force -ErrorAction SilentlyContinue
  }
}

function Remove-WorkerSourceTempRoots {
  param([int]$WorkerPid)
  if ($WorkerPid -le 0) { return }
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  foreach ($item in @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter "formal-source-$WorkerPid-*" -Force -ErrorAction SilentlyContinue)) {
    $resolved = [System.IO.Path]::GetFullPath($item.FullName)
    $parent = [System.IO.Path]::GetDirectoryName($resolved).TrimEnd('\')
    if ($parent -eq $tempRoot -and $item.Name.StartsWith("formal-source-$WorkerPid-")) {
      Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Set-ReadOnlyUiState {
  param([string]$Action = '', [bool]$Running)
  $script:SourcePath.ReadOnly = $Running
  $script:ProjectNo.ReadOnly = $Running
  $script:OutputPath.ReadOnly = $Running
  $script:PackagePath.ReadOnly = $Running
  $script:BtnBrowseSource.Enabled = -not $Running
  $script:BtnBrowseSourceZip.Enabled = -not $Running
  $script:BtnBrowseOutput.Enabled = -not $Running
  $script:BtnBrowsePackage.Enabled = -not $Running
  $script:BtnOpenOutput.Enabled = (-not $Running) -and $script:LastOutputDirectory -and (Test-Path -LiteralPath $script:LastOutputDirectory -PathType Container)
  $script:BtnBuild.Enabled = (-not $Running) -and $script:LastReadyInput -and
    $script:LastReadyInput -eq $script:SourcePath.Text.Trim() -and
    $script:LastReadyProjectNo -eq $script:ProjectNo.Text.Trim()
  if ($Running) {
    $script:BtnCheck.Enabled = $Action -eq 'check'
    $script:BtnVerify.Enabled = $Action -eq 'verify'
    $script:BtnCheck.Text = if ($Action -eq 'check') { '停止檢查' } else { '1. 檢查附件來源' }
    $script:BtnVerify.Text = if ($Action -eq 'verify') { '停止驗證' } else { '驗證附件包' }
  } else {
    $script:BtnCheck.Enabled = $true
    $script:BtnVerify.Enabled = $true
    $script:BtnCheck.Text = '1. 檢查附件來源'
    $script:BtnVerify.Text = '驗證附件包'
  }
}

function Stop-ReadOnlyOperation {
  $process = $script:ReadOnlyProcess
  $resultFile = $script:ReadOnlyResultFile
  $workerPid = if ($process) { $process.Id } else { 0 }
  if ($script:ReadOnlyTimer) { $script:ReadOnlyTimer.Stop() }
  $script:ReadOnlyProcess = $null
  $script:ReadOnlyAction = ''
  $script:ReadOnlyInput = ''
  $script:ReadOnlyProjectNo = ''
  $script:ReadOnlyResultFile = ''
  $script:ReadOnlyStartedAt = $null
  if ($process) {
    try {
      if (-not $process.HasExited) {
        & taskkill.exe /PID $workerPid /T /F 2>$null | Out-Null
        if (-not $process.HasExited) { $process.Kill() }
        [void]$process.WaitForExit(2000)
      }
    } catch {
      # 唯讀 worker 競態結束時，清理程序不得覆蓋主要畫面狀態。
    } finally {
      $process.Dispose()
    }
  }
  Remove-ReadOnlyResultFile -ResultFile $resultFile
  Remove-WorkerSourceTempRoots -WorkerPid $workerPid
  if ($script:BtnCheck) { Set-ReadOnlyUiState -Running $false }
}

function Update-BuildProgressStatus {
  if (-not $script:BuildProcess -or -not $script:BuildStartedAt -or $script:BuildProcess.HasExited) { return }
  if ($script:BuildProgressFile -and (Test-Path -LiteralPath $script:BuildProgressFile -PathType Leaf)) {
    try {
      $lastRecord = Get-Content -LiteralPath $script:BuildProgressFile -Encoding UTF8 -ErrorAction Stop | Select-Object -Last 1
      if ($lastRecord) {
        $progress = $lastRecord | ConvertFrom-Json -ErrorAction Stop
        $allowedPhases = @('preparing-source', 'source-recheck', 'staging', 'self-verification', 'publishing', 'complete')
        if ($progress.schemaVersion -eq 1 -and $allowedPhases -contains [string]$progress.phase) {
          $script:BuildPhase = [string]$progress.phase
        }
      }
    } catch {
      # worker 可能正在附加下一筆短 JSONL；保留上一個已驗證階段，下一個 tick 再讀。
    }
  }
  $elapsedSeconds = [Math]::Max(0, [int][Math]::Floor(((Get-Date) - $script:BuildStartedAt).TotalSeconds))
  if ($elapsedSeconds -eq $script:BuildStatusLastElapsedSecond) { return }
  $script:BuildStatusLastElapsedSecond = $elapsedSeconds
  $elapsed = [TimeSpan]::FromSeconds($elapsedSeconds)
  $elapsedText = if ($elapsed.TotalHours -ge 1) {
    '{0:00}:{1:00}:{2:00}' -f [int][Math]::Floor($elapsed.TotalHours), $elapsed.Minutes, $elapsed.Seconds
  } else {
    '{0:00}:{1:00}' -f $elapsed.Minutes, $elapsed.Seconds
  }
  $phaseLabels = @{
    'preparing-source' = '準備與驗證附件來源'
    'source-recheck' = '重新檢查附件來源'
    'staging' = '建立原子暫存附件包'
    'self-verification' = '發布前完整性與工程內容驗證'
    'publishing' = '原子發布正式附件包'
    'complete' = '完成發布並整理結果'
  }
  $phaseLabel = $phaseLabels[$script:BuildPhase]
  $script:StatusMeta.Text = "背景原子建立程序運作中｜目前階段：$phaseLabel｜已經過 $elapsedText｜不可取消或關閉。"
  $script:BottomStatus.Text = "狀態：正式建立進行中｜$phaseLabel｜已經過 $elapsedText｜不可取消或關閉"
}

function Start-BuildOperation {
  if ($script:BuildProcess) { return }
  $inputPath = $script:SourcePath.Text.Trim()
  $projectNo = $script:ProjectNo.Text.Trim()
  $outputPath = $script:OutputPath.Text.Trim()
  if (-not $inputPath -or $script:LastReadyInput -ne $inputPath -or $script:LastReadyProjectNo -ne $projectNo) {
    throw '附件來源或計畫編號已改變；請先重新執行唯讀檢查，再建立正式附件包。'
  }
  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) { throw "找不到附件包管理器核心：$script:WorkerPath" }
  Stop-ReadOnlyOperation
  $request = [ordered]@{ action = 'build'; input = $inputPath; output = $outputPath; projectNo = $projectNo }
  $requestJson = $request | ConvertTo-Json -Compress
  $requestBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($requestJson))
  $resultFile = New-ReadOnlyResultPath
  $progressFile = New-BuildProgressPath
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = Get-NodePath
  $startInfo.Arguments = "`"$script:WorkerPath`" --request-base64 $requestBase64 --result-file `"$resultFile`" --progress-file `"$progressFile`""
  if ($SmokeBuildResponsiveness -and $WorkerSmokeDelayMilliseconds -gt 0) {
    $startInfo.Arguments += " --smoke-delay-ms $WorkerSmokeDelayMilliseconds"
  }
  $startInfo.WorkingDirectory = $script:ToolDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    [void]$process.Start()
  } catch {
    $process.Dispose()
    Remove-ReadOnlyResultFile -ResultFile $resultFile
    Remove-BuildProgressFile -ProgressFile $progressFile
    throw
  }
  $script:BuildProcess = $process
  $script:BuildResultFile = $resultFile
  $script:BuildProgressFile = $progressFile
  $script:BuildStartedAt = Get-Date
  $script:BuildStatusLastElapsedSecond = -1
  $script:BuildPhase = 'preparing-source'
  Set-BuildUiState -Running $true
  Set-StatusAppearance -Status 'review' -Title '正式附件包建立中'
  $script:DetailsBox.Text = '建立核心會再次完整檢查來源，再以暫存資料夾原子發布並執行事後驗證。完成前請保留本視窗開啟。'
  Update-BuildProgressStatus
  $script:BuildTimer.Start()
}

function Complete-BuildOperation {
  $process = $script:BuildProcess
  if (-not $process -or -not $process.HasExited) { return }
  $resultFile = $script:BuildResultFile
  $progressFile = $script:BuildProgressFile
  $workerPid = $process.Id
  $exitCode = $process.ExitCode
  $process.Dispose()
  $script:BuildProcess = $null
  $script:BuildResultFile = ''
  $script:BuildProgressFile = ''
  $script:BuildStartedAt = $null
  $script:BuildStatusLastElapsedSecond = -1
  $script:BuildPhase = 'preparing-source'
  $script:BuildTimer.Stop()
  $script:LastReadyInput = ''
  $script:LastReadyProjectNo = ''
  Set-BuildUiState -Running $false
  try {
    if (-not (Test-Path -LiteralPath $resultFile -PathType Leaf)) { throw "附件包背景建立未回傳結果（exit=$exitCode）。" }
    $response = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
    Show-WorkerResponse $response
    if ($response.built -and $response.outputDir) {
      $script:LastOutputDirectory = [string]$response.outputDir
      $script:PackagePath.Text = $script:LastOutputDirectory
      $script:BtnOpenOutput.Enabled = $true
    }
  } catch {
    Show-OperationError $_.Exception
  } finally {
    Remove-ReadOnlyResultFile -ResultFile $resultFile
    Remove-BuildProgressFile -ProgressFile $progressFile
    Remove-WorkerSourceTempRoots -WorkerPid $workerPid
  }
}

function Start-ReadOnlyOperation {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('check', 'verify')][string]$Action,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [string]$ProjectNo = ''
  )
  if (-not $InputPath.Trim()) {
    throw $(if ($Action -eq 'check') { '請先選擇附件來源資料夾或 PDF＋證據來源 ZIP。' } else { '請先選擇要驗證的正式附件包資料夾。' })
  }
  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) { throw "找不到附件包管理器核心：$script:WorkerPath" }
  Stop-ReadOnlyOperation
  $request = [ordered]@{ action = $Action; input = $InputPath.Trim(); projectNo = $ProjectNo.Trim() }
  $requestJson = $request | ConvertTo-Json -Compress
  $requestBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($requestJson))
  $resultFile = New-ReadOnlyResultPath
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = Get-NodePath
  $startInfo.Arguments = "`"$script:WorkerPath`" --request-base64 $requestBase64 --result-file `"$resultFile`""
  if (($SmokeReadOnlyCancellation -or $SmokeKeyboard -or $SmokeDragDrop) -and $WorkerSmokeDelayMilliseconds -gt 0) {
    $startInfo.Arguments += " --smoke-delay-ms $WorkerSmokeDelayMilliseconds"
  }
  $startInfo.WorkingDirectory = $script:ToolDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    [void]$process.Start()
  } catch {
    $process.Dispose()
    Remove-ReadOnlyResultFile -ResultFile $resultFile
    throw
  }
  $script:ReadOnlyProcess = $process
  $script:ReadOnlyAction = $Action
  $script:ReadOnlyInput = $InputPath.Trim()
  $script:ReadOnlyProjectNo = $ProjectNo.Trim()
  $script:ReadOnlyResultFile = $resultFile
  $script:ReadOnlyStartedAt = Get-Date
  Set-ReadOnlyUiState -Action $Action -Running $true
  Set-StatusAppearance -Status 'review' -Title $(if ($Action -eq 'check') { '附件來源檢查進行中' } else { '正式附件包驗證進行中' })
  $script:StatusMeta.Text = '背景唯讀工作執行中；畫面仍可操作，可按同一按鈕停止。'
  $script:DetailsBox.Text = '唯讀檢查不會建立或修改案件資料；停止、逾時或關閉視窗都會清理背景程序與隔離暫存區。'
  $script:BottomStatus.Text = "狀態：$Action 進行中｜可安全停止"
  $script:ReadOnlyTimer.Start()
}

function Apply-CheckResponse {
  param($Response, [string]$InputSnapshot, [string]$ProjectNoSnapshot)
  if ($script:SourcePath.Text.Trim() -ne $InputSnapshot -or $script:ProjectNo.Text.Trim() -ne $ProjectNoSnapshot) {
    $script:BottomStatus.Text = '來源已改變：已忽略過期檢查結果，請重新檢查。'
    return
  }
  Show-WorkerResponse $Response
  $suggestedProjectNo = [string](Get-ResponseValue $Response 'suggestedProjectNo')
  if (-not $script:ProjectNo.Text.Trim() -and $suggestedProjectNo) {
    $script:ProjectNo.Text = $suggestedProjectNo
    $script:DetailsBox.AppendText("`r`n已從來源帶入唯一計畫編號：$suggestedProjectNo；建立前仍會再次完整檢查。")
  }
  if ($Response.status -eq 'ready' -and $Response.canBuild) {
    $suggestedOutputDir = [string](Get-ResponseValue $Response 'suggestedOutputDir')
    if (-not $script:OutputPath.Text.Trim() -and $suggestedOutputDir) {
      $script:LastSuggestedOutput = $suggestedOutputDir
      $script:OutputPath.Text = $suggestedOutputDir
      $script:DetailsBox.AppendText("`r`n已顯示來源 ZIP 的預計輸出位置；尚未建立任何資料夾，建立前仍會檢查不覆寫。")
    }
    $script:LastReadyInput = $script:SourcePath.Text.Trim()
    $script:LastReadyProjectNo = $script:ProjectNo.Text.Trim()
    $script:BtnBuild.Enabled = $true
  }
}

function Complete-ReadOnlyOperation {
  $process = $script:ReadOnlyProcess
  if (-not $process -or -not $process.HasExited) { return }
  $action = $script:ReadOnlyAction
  $inputSnapshot = $script:ReadOnlyInput
  $projectNoSnapshot = $script:ReadOnlyProjectNo
  $resultFile = $script:ReadOnlyResultFile
  $workerPid = $process.Id
  $exitCode = $process.ExitCode
  $process.Dispose()
  $script:ReadOnlyProcess = $null
  $script:ReadOnlyAction = ''
  $script:ReadOnlyInput = ''
  $script:ReadOnlyProjectNo = ''
  $script:ReadOnlyResultFile = ''
  $script:ReadOnlyStartedAt = $null
  $script:ReadOnlyTimer.Stop()
  Set-ReadOnlyUiState -Running $false
  try {
    if (-not (Test-Path -LiteralPath $resultFile -PathType Leaf)) { throw "附件包管理器背景工作未回傳結果（exit=$exitCode）。" }
    $response = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
    if ($action -eq 'check') { Apply-CheckResponse -Response $response -InputSnapshot $inputSnapshot -ProjectNoSnapshot $projectNoSnapshot }
    elseif ($script:PackagePath.Text.Trim() -eq $inputSnapshot) { Show-WorkerResponse $response }
    else { $script:BottomStatus.Text = '附件包路徑已改變：已忽略過期驗證結果，請重新驗證。' }
  } finally {
    Remove-ReadOnlyResultFile -ResultFile $resultFile
    Remove-WorkerSourceTempRoots -WorkerPid $workerPid
  }
}

function Cancel-ReadOnlyOperation {
  if (-not $script:ReadOnlyProcess) { return }
  $action = $script:ReadOnlyAction
  Stop-ReadOnlyOperation
  Set-StatusAppearance -Status 'review' -Title $(if ($action -eq 'check') { '已停止附件來源檢查' } else { '已停止正式附件包驗證' })
  $script:StatusMeta.Text = '背景唯讀工作已停止；未建立或修改案件資料。'
  $script:DetailsBox.Text = '可調整路徑後重新執行。背景程序、結果暫存檔與來源 ZIP 隔離暫存區均已清理。'
  $script:BottomStatus.Text = '狀態：已安全停止唯讀工作'
}

function Set-ManagerKeyHandled {
  param([System.Windows.Forms.KeyEventArgs]$EventArgs)
  $EventArgs.Handled = $true
  $EventArgs.SuppressKeyPress = $true
}

function Invoke-ManagerKeyDown {
  param([System.Windows.Forms.KeyEventArgs]$EventArgs)
  if ($EventArgs.Control -and $EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::L) {
    $target = if ($script:ActiveMode -eq 'verify') { $script:PackagePath } else { $script:SourcePath }
    [void]$target.Focus()
    $target.SelectAll()
    $script:ScrollViewport.ScrollControlIntoView($target)
    Set-ManagerKeyHandled -EventArgs $EventArgs
    return
  }
  if ($EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
    if ($script:BuildProcess) {
      $script:BottomStatus.Text = '正式建立採原子發布，執行中不可取消；完成後即可關閉視窗。'
    } elseif ($script:ReadOnlyProcess) { Cancel-ReadOnlyOperation }
    Set-ManagerKeyHandled -EventArgs $EventArgs
    return
  }
  if ($EventArgs.KeyCode -ne [System.Windows.Forms.Keys]::Enter) { return }
  Set-ManagerKeyHandled -EventArgs $EventArgs
  if ($script:ReadOnlyProcess -or $script:BuildProcess) { return }
  $active = $script:MainForm.ActiveControl
  if ($active -eq $script:PackagePath -or $active -eq $script:BtnVerify) {
    $script:ActiveMode = 'verify'
    $script:BtnVerify.PerformClick()
    return
  }
  if ($active -eq $script:SourcePath -or $active -eq $script:ProjectNo -or $active -eq $script:OutputPath -or $active -eq $script:BtnCheck) {
    $script:ActiveMode = 'source'
    $script:BtnCheck.PerformClick()
    return
  }
  $script:BottomStatus.Text = 'Enter 只執行目前欄位的唯讀檢查；正式建立請明確點按「2. 建立正式附件包」。'
}

function Set-ManagerWindowBounds {
  param([System.Drawing.Size]$PreferredSize = (New-Object System.Drawing.Size(1060, 850)))
  $workingArea = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position).WorkingArea
  $width = [Math]::Min($PreferredSize.Width, $workingArea.Width)
  $height = [Math]::Min($PreferredSize.Height, $workingArea.Height)
  $minimumWidth = [Math]::Min(800, $workingArea.Width)
  $minimumHeight = [Math]::Min(640, $workingArea.Height)
  $script:MainForm.MinimumSize = New-Object System.Drawing.Size($minimumWidth, $minimumHeight)
  $script:MainForm.Size = New-Object System.Drawing.Size($width, $height)
  $left = $workingArea.Left + [Math]::Max(0, [Math]::Floor(($workingArea.Width - $width) / 2))
  $top = $workingArea.Top + [Math]::Max(0, [Math]::Floor(($workingArea.Height - $height) / 2))
  $script:MainForm.Location = New-Object System.Drawing.Point($left, $top)
  return $workingArea
}

$script:MainForm = New-Object System.Windows.Forms.Form
$script:MainForm.Text = '正式附件包管理器'
$script:MainForm.StartPosition = 'Manual'
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(244, 247, 250)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)
$script:MainForm.KeyPreview = $true
$script:WindowWorkingArea = Set-ManagerWindowBounds

$script:ScrollViewport = New-Object System.Windows.Forms.Panel
$script:ScrollViewport.Dock = 'Fill'
$script:ScrollViewport.AutoScroll = $true
$script:ScrollViewport.BackColor = $script:MainForm.BackColor
$script:MainForm.Controls.Add($script:ScrollViewport)

$script:ContentSurface = New-Object System.Windows.Forms.Panel
$script:ContentSurface.Location = New-Object System.Drawing.Point(0, 0)
$script:ContentSurface.Size = New-Object System.Drawing.Size(1040, 784)
$script:ContentSurface.BackColor = $script:MainForm.BackColor
$script:ContentSurface.TabStop = $false
$script:ScrollViewport.AutoScrollMinSize = $script:ContentSurface.Size
$script:ScrollViewport.Controls.Add($script:ContentSurface)

$header = New-Object System.Windows.Forms.Label
$header.Text = '正式附件包管理器'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 22, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(22, 16)
$header.AutoSize = $true
$script:ContentSurface.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '管理畫面與檢查結果僅供內部整理，不進主報告。可拖入對應區塊；Ctrl+L 路徑、Enter 唯讀檢查、Esc 停止。'
$subheader.Location = New-Object System.Drawing.Point(25, 62)
$subheader.Size = New-Object System.Drawing.Size(980, 30)
$subheader.TextAlign = 'MiddleLeft'
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:ContentSurface.Controls.Add($subheader)

$sourceGroup = New-Object System.Windows.Forms.GroupBox
$sourceGroup.Text = '一、檢查並建立正式附件包'
$sourceGroup.Location = New-Object System.Drawing.Point(22, 104)
$sourceGroup.Size = New-Object System.Drawing.Size(1000, 220)
$sourceGroup.Anchor = 'Top,Left,Right'
$script:ContentSurface.Controls.Add($sourceGroup)

function Add-FieldRow {
  param($Parent, [string]$Label, [int]$Y)
  $labelControl = New-Object System.Windows.Forms.Label
  $labelControl.Text = $Label
  $labelControl.Location = New-Object System.Drawing.Point(18, ($Y + 5))
  $labelControl.Size = New-Object System.Drawing.Size(150, 24)
  $Parent.Controls.Add($labelControl)
  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Location = New-Object System.Drawing.Point(160, $Y)
  $textBox.Size = New-Object System.Drawing.Size(695, 28)
  $textBox.Anchor = 'Top,Left,Right'
  $Parent.Controls.Add($textBox)
  return $textBox
}

$script:SourcePath = Add-FieldRow -Parent $sourceGroup -Label '來源資料夾或 ZIP' -Y 32
$script:SourcePath.Width = 585
if ($InitialMode -eq 'source' -and $InitialPath.Trim()) { $script:SourcePath.Text = $InitialPath.Trim() }
$script:BtnBrowseSource = New-Object System.Windows.Forms.Button
$script:BtnBrowseSource.Text = '選資料夾…'
$script:BtnBrowseSource.Location = New-Object System.Drawing.Point(760, 30)
$script:BtnBrowseSource.Size = New-Object System.Drawing.Size(100, 32)
$script:BtnBrowseSource.Anchor = 'Top,Right'
$sourceGroup.Controls.Add($script:BtnBrowseSource)
$script:BtnBrowseSourceZip = New-Object System.Windows.Forms.Button
$script:BtnBrowseSourceZip.Text = '選擇來源 ZIP…'
$script:BtnBrowseSourceZip.Location = New-Object System.Drawing.Point(870, 30)
$script:BtnBrowseSourceZip.Size = New-Object System.Drawing.Size(105, 32)
$script:BtnBrowseSourceZip.Anchor = 'Top,Right'
$sourceGroup.Controls.Add($script:BtnBrowseSourceZip)

$script:ProjectNo = Add-FieldRow -Parent $sourceGroup -Label '計畫編號（選填）' -Y 72
$script:ProjectNo.Width = 300

$script:OutputPath = Add-FieldRow -Parent $sourceGroup -Label '輸出資料夾（選填）' -Y 112
$script:BtnBrowseOutput = New-Object System.Windows.Forms.Button
$script:BtnBrowseOutput.Text = '選擇上層…'
$script:BtnBrowseOutput.Location = New-Object System.Drawing.Point(870, 110)
$script:BtnBrowseOutput.Size = New-Object System.Drawing.Size(105, 32)
$script:BtnBrowseOutput.Anchor = 'Top,Right'
$sourceGroup.Controls.Add($script:BtnBrowseOutput)

$outputHint = New-Object System.Windows.Forms.Label
$outputHint.Text = '可選擇或拖入資料夾／PDF＋證據來源 ZIP；拖入只自動唯讀檢查，不會建立附件包。'
$outputHint.Location = New-Object System.Drawing.Point(160, 143)
$outputHint.Size = New-Object System.Drawing.Size(695, 20)
$outputHint.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$sourceGroup.Controls.Add($outputHint)

$script:BtnCheck = New-Object System.Windows.Forms.Button
$script:BtnCheck.Text = '1. 檢查附件來源'
$script:BtnCheck.Location = New-Object System.Drawing.Point(160, 174)
$script:BtnCheck.Size = New-Object System.Drawing.Size(180, 34)
$sourceGroup.Controls.Add($script:BtnCheck)

$script:BtnBuild = New-Object System.Windows.Forms.Button
$script:BtnBuild.Text = '2. 建立正式附件包'
$script:BtnBuild.Location = New-Object System.Drawing.Point(328, 174)
$script:BtnBuild.Size = New-Object System.Drawing.Size(190, 34)
$script:BtnBuild.Enabled = $false
$sourceGroup.Controls.Add($script:BtnBuild)

$script:BtnOpenOutput = New-Object System.Windows.Forms.Button
$script:BtnOpenOutput.Text = '開啟已建立資料夾'
$script:BtnOpenOutput.Location = New-Object System.Drawing.Point(531, 174)
$script:BtnOpenOutput.Size = New-Object System.Drawing.Size(180, 34)
$script:BtnOpenOutput.Enabled = $false
$sourceGroup.Controls.Add($script:BtnOpenOutput)

$verifyGroup = New-Object System.Windows.Forms.GroupBox
$verifyGroup.Text = '二、驗證既有正式附件包'
$verifyGroup.Location = New-Object System.Drawing.Point(22, 336)
$verifyGroup.Size = New-Object System.Drawing.Size(1000, 92)
$verifyGroup.Anchor = 'Top,Left,Right'
$script:ContentSurface.Controls.Add($verifyGroup)

$script:PackagePath = Add-FieldRow -Parent $verifyGroup -Label '正式附件包' -Y 34
$script:PackagePath.Width = 590
if ($InitialMode -eq 'verify' -and $InitialPath.Trim()) { $script:PackagePath.Text = $InitialPath.Trim() }
$script:BtnBrowsePackage = New-Object System.Windows.Forms.Button
$script:BtnBrowsePackage.Text = '選擇…'
$script:BtnBrowsePackage.Location = New-Object System.Drawing.Point(760, 32)
$script:BtnBrowsePackage.Size = New-Object System.Drawing.Size(100, 32)
$script:BtnBrowsePackage.Anchor = 'Top,Right'
$verifyGroup.Controls.Add($script:BtnBrowsePackage)
$script:BtnVerify = New-Object System.Windows.Forms.Button
$script:BtnVerify.Text = '驗證附件包'
$script:BtnVerify.Location = New-Object System.Drawing.Point(870, 32)
$script:BtnVerify.Size = New-Object System.Drawing.Size(105, 32)
$script:BtnVerify.Anchor = 'Top,Right'
$verifyGroup.Controls.Add($script:BtnVerify)

$script:StatusPanel = New-Object System.Windows.Forms.Panel
$script:StatusPanel.Location = New-Object System.Drawing.Point(22, 442)
$script:StatusPanel.Size = New-Object System.Drawing.Size(1000, 64)
$script:StatusPanel.Anchor = 'Top,Left,Right'
$script:StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(237, 242, 247)
$script:ContentSurface.Controls.Add($script:StatusPanel)

$script:StatusTitle = New-Object System.Windows.Forms.Label
$script:StatusTitle.Text = '請先選擇附件來源或正式附件包'
$script:StatusTitle.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 13, [System.Drawing.FontStyle]::Bold)
$script:StatusTitle.Location = New-Object System.Drawing.Point(16, 8)
$script:StatusTitle.Size = New-Object System.Drawing.Size(960, 26)
$script:StatusPanel.Controls.Add($script:StatusTitle)
$script:StatusMeta = New-Object System.Windows.Forms.Label
$script:StatusMeta.Location = New-Object System.Drawing.Point(17, 36)
$script:StatusMeta.Size = New-Object System.Drawing.Size(960, 20)
$script:StatusPanel.Controls.Add($script:StatusMeta)

$script:ResultGrid = New-Object System.Windows.Forms.DataGridView
$script:ResultGrid.Location = New-Object System.Drawing.Point(22, 518)
$script:ResultGrid.Size = New-Object System.Drawing.Size(1000, 162)
$script:ResultGrid.Anchor = 'Top,Bottom,Left,Right'
$script:ResultGrid.ReadOnly = $true
$script:ResultGrid.AllowUserToAddRows = $false
$script:ResultGrid.AllowUserToDeleteRows = $false
$script:ResultGrid.RowHeadersVisible = $false
$script:ResultGrid.AutoSizeColumnsMode = 'Fill'
$script:ResultGrid.SelectionMode = 'FullRowSelect'
foreach ($column in @(
  @('file', '檔案', 28), @('role', '角色', 12), @('state', '文件狀態', 12),
  @('tool', '產出工具', 15), @('version', '版本', 8), @('fingerprint', '計算指紋', 15), @('result', '檢查結果', 15)
)) {
  $dataColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
  $dataColumn.Name = $column[0]
  $dataColumn.HeaderText = $column[1]
  $dataColumn.FillWeight = $column[2]
  [void]$script:ResultGrid.Columns.Add($dataColumn)
}
$script:ContentSurface.Controls.Add($script:ResultGrid)

$script:DetailsBox = New-Object System.Windows.Forms.TextBox
$script:DetailsBox.Location = New-Object System.Drawing.Point(22, 692)
$script:DetailsBox.Size = New-Object System.Drawing.Size(1000, 90)
$script:DetailsBox.Anchor = 'Bottom,Left,Right'
$script:DetailsBox.Multiline = $true
$script:DetailsBox.ReadOnly = $true
$script:DetailsBox.ScrollBars = 'Vertical'
$script:DetailsBox.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 9)
$script:DetailsBox.Text = '檢查結果會顯示在這裡。只有 ready 狀態可建立正式附件包；review 與 blocked 不會建立輸出。'
$script:ContentSurface.Controls.Add($script:DetailsBox)

$script:LayoutProbe = New-Object System.Windows.Forms.Panel
$script:LayoutProbe.Location = New-Object System.Drawing.Point(1020, 780)
$script:LayoutProbe.Size = New-Object System.Drawing.Size(2, 2)
$script:LayoutProbe.BackColor = $script:ContentSurface.BackColor
$script:LayoutProbe.TabStop = $false
$script:ContentSurface.Controls.Add($script:LayoutProbe)

$statusStrip = New-Object System.Windows.Forms.StatusStrip
$script:BottomStatus = New-Object System.Windows.Forms.ToolStripStatusLabel
$script:BottomStatus.Text = '狀態：待命'
[void]$statusStrip.Items.Add($script:BottomStatus)
$script:MainForm.Controls.Add($statusStrip)
$statusStrip.BringToFront()

$sourceGroup.TabIndex = 0
$verifyGroup.TabIndex = 1
$script:StatusPanel.TabIndex = 2
$script:StatusPanel.TabStop = $false
$script:ResultGrid.TabIndex = 3
$script:DetailsBox.TabIndex = 4
$script:SourcePath.TabIndex = 0
$script:SourcePath.AccessibleName = '附件來源路徑'
$script:SourcePath.AccessibleDescription = '輸入、選擇或拖入單一實體附件來源資料夾或 PDF 加證據來源 ZIP；拖入只執行唯讀檢查，Ctrl+L 可聚焦。'
$script:BtnBrowseSource.TabIndex = 1
$script:BtnBrowseSource.AccessibleName = '選擇附件來源資料夾'
$script:BtnBrowseSourceZip.TabIndex = 2
$script:BtnBrowseSourceZip.AccessibleName = '選擇 PDF 加證據來源 ZIP'
$script:ProjectNo.TabIndex = 3
$script:ProjectNo.AccessibleName = '計畫編號，選填'
$script:ProjectNo.AccessibleDescription = '可留空；只有來源存在唯一一致值且欄位空白時才會建議帶入。'
$script:OutputPath.TabIndex = 4
$script:OutputPath.AccessibleName = '正式附件包輸出位置，選填'
$script:OutputPath.AccessibleDescription = '可留空使用安全預設；檢查不會建立這個資料夾。'
$script:BtnBrowseOutput.TabIndex = 5
$script:BtnBrowseOutput.AccessibleName = '選擇正式附件包輸出上層資料夾'
$script:BtnCheck.TabIndex = 6
$script:BtnCheck.AccessibleName = '檢查附件來源'
$script:BtnCheck.AccessibleDescription = '唯讀背景檢查；進行中可再次按下或按 Esc 安全停止。'
$script:BtnBuild.TabIndex = 7
$script:BtnBuild.AccessibleName = '建立正式附件包'
$script:BtnBuild.AccessibleDescription = '唯一寫入動作；通過檢查後仍須明確點按，不由 Enter 快捷鍵觸發；建立中保持畫面可回應，但不可取消或關閉。'
$script:BtnOpenOutput.TabIndex = 8
$script:BtnOpenOutput.AccessibleName = '開啟最近建立的正式附件包資料夾'
$script:PackagePath.TabIndex = 0
$script:PackagePath.AccessibleName = '既有正式附件包路徑'
$script:PackagePath.AccessibleDescription = '輸入、選擇或拖入單一實體正式附件包資料夾；來源 ZIP 不接受，拖入只執行唯讀驗證，Ctrl+L 可聚焦。'
$script:BtnBrowsePackage.TabIndex = 1
$script:BtnBrowsePackage.AccessibleName = '選擇既有正式附件包資料夾'
$script:BtnVerify.TabIndex = 2
$script:BtnVerify.AccessibleName = '驗證既有正式附件包'
$script:BtnVerify.AccessibleDescription = '唯讀背景驗證；進行中可再次按下或按 Esc 安全停止。'
$script:ResultGrid.AccessibleName = '附件檢查結果清單'
$script:DetailsBox.AccessibleName = '附件檢查問題與處置說明'

foreach ($control in @($script:SourcePath, $script:ProjectNo, $script:OutputPath, $script:BtnCheck)) {
  $control.Add_Enter({ $script:ActiveMode = 'source' })
}
foreach ($control in @($script:PackagePath, $script:BtnVerify)) {
  $control.Add_Enter({ $script:ActiveMode = 'verify' })
}

$invalidateBuild = {
  $script:BtnBuild.Enabled = $false
  $script:LastReadyInput = ''
  $script:LastReadyProjectNo = ''
}
$sourceChanged = {
  if ($script:ReadOnlyProcess) { Cancel-ReadOnlyOperation }
  & $invalidateBuild
  if ($script:LastSuggestedOutput -and $script:OutputPath.Text.Trim() -eq $script:LastSuggestedOutput) {
    $script:LastSuggestedOutput = ''
    $script:OutputPath.Clear()
  }
}
$projectChanged = {
  if ($script:ReadOnlyProcess -and $script:ReadOnlyAction -eq 'check') { Cancel-ReadOnlyOperation }
  & $invalidateBuild
}
$outputChanged = {
  if ($script:LastSuggestedOutput -and $script:OutputPath.Text.Trim() -ne $script:LastSuggestedOutput) {
    $script:LastSuggestedOutput = ''
  }
}
$script:SourcePath.Add_TextChanged($sourceChanged)
$script:ProjectNo.Add_TextChanged($projectChanged)
$script:OutputPath.Add_TextChanged($outputChanged)
$script:PackagePath.Add_TextChanged({
  if ($script:ReadOnlyProcess -and $script:ReadOnlyAction -eq 'verify') { Cancel-ReadOnlyOperation }
})

$sourceGroup.AllowDrop = $true
$script:SourcePath.AllowDrop = $true
$verifyGroup.AllowDrop = $true
$script:PackagePath.AllowDrop = $true
$sourceDragEnter = {
  $paths = @(Get-ManagerDropPaths -Data $_.Data)
  if ($paths.Count -eq 1 -and (Test-ManagerDropPath -Mode source -CandidatePath ([string]$paths[0]))) {
    $_.Effect = [System.Windows.Forms.DragDropEffects]::Copy
  } else {
    $_.Effect = [System.Windows.Forms.DragDropEffects]::None
  }
}
$sourceDragDrop = {
  try {
    $paths = @(Get-ManagerDropPaths -Data $_.Data)
    [void](Set-ManagerDroppedPath -Mode source -Paths $paths)
  } catch {
    Show-DropRejected -ErrorRecord $_.Exception
  }
}
$verifyDragEnter = {
  $paths = @(Get-ManagerDropPaths -Data $_.Data)
  if ($paths.Count -eq 1 -and (Test-ManagerDropPath -Mode verify -CandidatePath ([string]$paths[0]))) {
    $_.Effect = [System.Windows.Forms.DragDropEffects]::Copy
  } else {
    $_.Effect = [System.Windows.Forms.DragDropEffects]::None
  }
}
$verifyDragDrop = {
  try {
    $paths = @(Get-ManagerDropPaths -Data $_.Data)
    [void](Set-ManagerDroppedPath -Mode verify -Paths $paths)
  } catch {
    Show-DropRejected -ErrorRecord $_.Exception
  }
}
foreach ($control in @($sourceGroup, $script:SourcePath)) {
  $control.Add_DragEnter($sourceDragEnter)
  $control.Add_DragDrop($sourceDragDrop)
}
foreach ($control in @($verifyGroup, $script:PackagePath)) {
  $control.Add_DragEnter($verifyDragEnter)
  $control.Add_DragDrop($verifyDragDrop)
}

$script:BtnBrowseSource.Add_Click({
  $selected = Select-Folder -Description '選擇包含計算書與來源 JSON 的附件資料夾' -SelectedPath $script:SourcePath.Text
  if ($selected) { $script:SourcePath.Text = $selected }
})

$script:BtnBrowseSourceZip.Add_Click({
  $selected = Select-FormalSourceZip -SelectedPath $script:SourcePath.Text
  if ($selected) { $script:SourcePath.Text = $selected }
})

$script:BtnBrowseOutput.Add_Click({
  $selected = Select-Folder -Description '選擇正式附件包的輸出上層資料夾' -SelectedPath (Split-Path -Parent $script:OutputPath.Text -ErrorAction SilentlyContinue)
  if ($selected) {
    $sourceName = Get-SourceBaseName -SourcePath $script:SourcePath.Text
    $token = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:LastSuggestedOutput = ''
    $script:OutputPath.Text = Join-Path $selected "$sourceName-正式附件包-$token"
  }
})

$script:BtnBrowsePackage.Add_Click({
  $selected = Select-Folder -Description '選擇要驗證的正式附件包資料夾' -SelectedPath $script:PackagePath.Text
  if ($selected) { $script:PackagePath.Text = $selected }
})

$script:BtnCheck.Add_Click({
  if ($script:ReadOnlyProcess) {
    if ($script:ReadOnlyAction -eq 'check') { Cancel-ReadOnlyOperation }
    return
  }
  $script:LastReadyInput = ''
  $script:LastReadyProjectNo = ''
  try {
    Start-ReadOnlyOperation -Action check -InputPath $script:SourcePath.Text -ProjectNo $script:ProjectNo.Text
  } catch {
    Show-OperationError $_.Exception
  }
})

$script:BtnBuild.Add_Click({
  try {
    Start-BuildOperation
  } catch {
    Show-OperationError $_.Exception
  }
})

$script:BtnVerify.Add_Click({
  if ($script:ReadOnlyProcess) {
    if ($script:ReadOnlyAction -eq 'verify') { Cancel-ReadOnlyOperation }
    return
  }
  try {
    Start-ReadOnlyOperation -Action verify -InputPath $script:PackagePath.Text
  } catch {
    Show-OperationError $_.Exception
  }
})

$script:BtnOpenOutput.Add_Click({
  if ($script:LastOutputDirectory -and (Test-Path -LiteralPath $script:LastOutputDirectory -PathType Container)) {
    Start-Process -FilePath explorer.exe -ArgumentList @($script:LastOutputDirectory)
  }
})

$script:ReadOnlyTimer = New-Object System.Windows.Forms.Timer
$script:ReadOnlyTimer.Interval = 150
$script:ReadOnlyTimer.Add_Tick({
  try {
    if (-not $script:ReadOnlyProcess) {
      $script:ReadOnlyTimer.Stop()
      return
    }
    if ($script:ReadOnlyStartedAt -and ((Get-Date) - $script:ReadOnlyStartedAt).TotalSeconds -ge 300) {
      $action = $script:ReadOnlyAction
      Stop-ReadOnlyOperation
      throw $(if ($action -eq 'check') { '附件來源唯讀檢查超過 5 分鐘，已停止並清理暫存；請縮小來源範圍後重試。' } else { '附件包唯讀驗證超過 5 分鐘，已停止；請確認附件包大小後重試。' })
    }
    Complete-ReadOnlyOperation
  } catch {
    Stop-ReadOnlyOperation
    Show-OperationError $_.Exception
    $script:BottomStatus.Text = '狀態：唯讀工作未完成；可直接重試'
  }
})

$script:BuildTimer = New-Object System.Windows.Forms.Timer
$script:BuildTimer.Interval = 150
$script:BuildTimer.Add_Tick({
  try {
    if (-not $script:BuildProcess) {
      $script:BuildTimer.Stop()
      return
    }
    if ($script:BuildProcess.HasExited) {
      Complete-BuildOperation
      return
    }
    Update-BuildProgressStatus
  } catch {
    Show-OperationError $_.Exception
  }
})

$script:MainForm.Add_FormClosing({
  param($sender, $eventArgs)
  if ($script:BuildProcess) {
    $eventArgs.Cancel = $true
    $script:BottomStatus.Text = '正式建立採原子發布，執行中不可關閉；完成後即可離開。'
    return
  }
  Stop-ReadOnlyOperation
})
$script:MainForm.Add_KeyDown({
  param($sender, $eventArgs)
  Invoke-ManagerKeyDown -EventArgs $eventArgs
})

if ($SmokeReadOnlyCancellation) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:CancellationSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:CancellationSmokeTimer.Interval = 300
  $script:CancellationSmokeTimer.Add_Tick({
    $script:CancellationSmokeTimer.Stop()
    try {
      $process = $script:ReadOnlyProcess
      $workerPid = if ($process) { $process.Id } else { 0 }
      $resultFile = $script:ReadOnlyResultFile
      $runningActionVisible = $workerPid -gt 0 -and $script:BtnCheck.Text -eq '停止檢查'
      $windowVisibleBeforeCancel = [bool]$script:MainForm.Visible
      $script:BtnCheck.PerformClick()
      [System.Windows.Forms.Application]::DoEvents()
      $workerExited = $workerPid -gt 0 -and -not (Get-Process -Id $workerPid -ErrorAction SilentlyContinue)
      $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
      $sourceTemps = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter "formal-source-$workerPid-*" -Force -ErrorAction SilentlyContinue)
      $script:CancellationSmokeResult = [pscustomobject]@{
        status = if ($runningActionVisible -and $windowVisibleBeforeCancel -and $workerExited -and -not $script:ReadOnlyProcess -and $script:BtnCheck.Text -eq '1. 檢查附件來源' -and -not (Test-Path -LiteralPath $resultFile) -and $sourceTemps.Count -eq 0 -and $script:StatusTitle.Text -like '已停止*') { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        runningActionVisible = $runningActionVisible
        windowStayedOpen = [bool]($windowVisibleBeforeCancel -and $script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
        workerPid = $workerPid
        workerExited = $workerExited
        resultFileRemoved = [bool](-not (Test-Path -LiteralPath $resultFile))
        sourceTempRootsRemoved = [bool]($sourceTemps.Count -eq 0)
        operationCleared = [bool](-not $script:ReadOnlyProcess)
        idleActionRestored = [bool]($script:BtnCheck.Text -eq '1. 檢查附件來源')
        cancellationMessageShown = [bool]($script:StatusTitle.Text -like '已停止*')
        built = $false
      }
    } catch {
      $script:CancellationSmokeResult = [pscustomobject]@{ status = 'fail'; message = $_.Exception.Message; built = $false }
    } finally {
      $script:MainForm.Close()
    }
  })
}

if ($SmokeReadOnlyCompletion) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:CompletionSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:CompletionSmokeTimer.Interval = 150
  $script:CompletionSmokeTimer.Add_Tick({
    if ($script:ReadOnlyProcess) { return }
    $script:CompletionSmokeTimer.Stop()
    try {
      $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
      $sourceTemps = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter "formal-source-$($script:CompletionSmokeWorkerPid)-*" -Force -ErrorAction SilentlyContinue)
      $resultApplied = $script:BottomStatus.Text -like '狀態：*核心退出碼：*'
      $script:CompletionSmokeResult = [pscustomobject]@{
        status = if ($script:CompletionSmokeWorkerPid -gt 0 -and $resultApplied -and -not (Test-Path -LiteralPath $script:CompletionSmokeResultFile) -and $sourceTemps.Count -eq 0 -and -not $script:BtnBuild.Enabled) { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        workerPid = $script:CompletionSmokeWorkerPid
        workerExited = [bool]($script:CompletionSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:CompletionSmokeWorkerPid -ErrorAction SilentlyContinue))
        resultApplied = $resultApplied
        resultFileRemoved = [bool](-not (Test-Path -LiteralPath $script:CompletionSmokeResultFile))
        sourceTempRootsRemoved = [bool]($sourceTemps.Count -eq 0)
        operationCleared = [bool](-not $script:ReadOnlyProcess)
        buildStayedDisabled = [bool](-not $script:BtnBuild.Enabled)
        built = $false
      }
    } catch {
      $script:CompletionSmokeResult = [pscustomobject]@{ status = 'fail'; message = $_.Exception.Message; built = $false }
    } finally {
      $script:MainForm.Close()
    }
  })
}

if ($SmokeKeyboard) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:KeyboardSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:KeyboardSmokeTimer.Interval = 300
  $script:KeyboardSmokeTimer.Add_Tick({
    $script:KeyboardSmokeTimer.Stop()
    try {
      $state = $script:KeyboardSmokeState
      $runningActionVisible = $state.workerPid -gt 0 -and $script:BtnCheck.Text -eq '停止檢查'
      $escapeEvent = New-Object System.Windows.Forms.KeyEventArgs([System.Windows.Forms.Keys]::Escape)
      Invoke-ManagerKeyDown -EventArgs $escapeEvent
      [System.Windows.Forms.Application]::DoEvents()
      $workerExited = $state.workerPid -gt 0 -and -not (Get-Process -Id $state.workerPid -ErrorAction SilentlyContinue)
      $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
      $sourceTemps = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter "formal-source-$($state.workerPid)-*" -Force -ErrorAction SilentlyContinue)
      $script:BtnBuild.Enabled = $true
      [void]$script:BtnBuild.Focus()
      $buildEnter = New-Object System.Windows.Forms.KeyEventArgs([System.Windows.Forms.Keys]::Enter)
      Invoke-ManagerKeyDown -EventArgs $buildEnter
      $accessibleNamesPresent = [bool]($script:SourcePath.AccessibleName -and $script:BtnCheck.AccessibleName -and $script:BtnBuild.AccessibleDescription -like '唯一寫入動作*')
      $script:KeyboardSmokeResult = [pscustomobject]@{
        status = if ($state.ctrlLFocusedSource -and $state.ctrlLHandled -and $state.enterHandled -and $runningActionVisible -and $escapeEvent.Handled -and $escapeEvent.SuppressKeyPress -and $workerExited -and -not $script:ReadOnlyProcess -and -not (Test-Path -LiteralPath $state.resultFile) -and $sourceTemps.Count -eq 0 -and $buildEnter.Handled -and $buildEnter.SuppressKeyPress -and $script:BottomStatus.Text -like 'Enter 只執行*' -and $accessibleNamesPresent) { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        ctrlLFocusedSource = [bool]$state.ctrlLFocusedSource
        ctrlLHandled = [bool]$state.ctrlLHandled
        enterStartedReadOnly = [bool]($state.enterHandled -and $runningActionVisible)
        escapeStoppedWorker = [bool]($escapeEvent.Handled -and $workerExited)
        resultFileRemoved = [bool](-not (Test-Path -LiteralPath $state.resultFile))
        sourceTempRootsRemoved = [bool]($sourceTemps.Count -eq 0)
        buildEnterSuppressed = [bool]($buildEnter.Handled -and $buildEnter.SuppressKeyPress -and $script:BottomStatus.Text -like 'Enter 只執行*')
        accessibleNamesPresent = $accessibleNamesPresent
        built = $false
      }
    } catch {
      $script:KeyboardSmokeResult = [pscustomobject]@{ status = 'fail'; message = $_.Exception.Message; built = $false }
    } finally {
      $script:MainForm.Close()
    }
  })
}

if ($SmokeViewport) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:WindowWorkingArea = Set-ManagerWindowBounds -PreferredSize (New-Object System.Drawing.Size(800, 640))
  $script:ViewportSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:ViewportSmokeTimer.Interval = 250
  $script:ViewportSmokeTimer.Add_Tick({
    $script:ViewportSmokeTimer.Stop()
    try {
      $script:ScrollViewport.AutoScrollPosition = New-Object System.Drawing.Point($script:ContentSurface.Width, $script:ContentSurface.Height)
      [System.Windows.Forms.Application]::DoEvents()
      $viewportOrigin = $script:ScrollViewport.PointToScreen([System.Drawing.Point]::Empty)
      $viewportBounds = New-Object System.Drawing.Rectangle($viewportOrigin, $script:ScrollViewport.ClientSize)
      $probeOrigin = $script:LayoutProbe.PointToScreen([System.Drawing.Point]::Empty)
      $probeBounds = New-Object System.Drawing.Rectangle($probeOrigin, $script:LayoutProbe.Size)
      $statusOrigin = $statusStrip.PointToScreen([System.Drawing.Point]::Empty)
      $statusBounds = New-Object System.Drawing.Rectangle($statusOrigin, $statusStrip.Size)
      $formBounds = $script:MainForm.Bounds
      $rightBottomVisible = $viewportBounds.Contains($probeBounds)
      $statusFixedVisible = $statusStrip.Parent -eq $script:MainForm -and $statusStrip.Visible -and $formBounds.Contains($statusBounds)
      $script:ViewportSmokeResult = [pscustomobject]@{
        status = if ($script:WindowWorkingArea.Contains($formBounds) -and $script:MainForm.Width -le 800 -and $script:MainForm.Height -le 640 -and $script:ScrollViewport.HorizontalScroll.Value -gt 0 -and $script:ScrollViewport.VerticalScroll.Value -gt 0 -and $rightBottomVisible -and $statusFixedVisible -and -not $script:ReadOnlyProcess -and -not $script:BtnBuild.Enabled) { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        selectedScreenContainsWindow = [bool]$script:WindowWorkingArea.Contains($formBounds)
        windowWidth = $script:MainForm.Width
        windowHeight = $script:MainForm.Height
        horizontalScroll = $script:ScrollViewport.HorizontalScroll.Value
        verticalScroll = $script:ScrollViewport.VerticalScroll.Value
        rightBottomVisible = $rightBottomVisible
        statusFixedVisible = $statusFixedVisible
        operationRunning = [bool]$script:ReadOnlyProcess
        built = $false
      }
    } catch {
      $script:ViewportSmokeResult = [pscustomobject]@{ status = 'fail'; message = $_.Exception.Message; built = $false }
    } finally {
      $script:MainForm.Close()
    }
  })
}

if ($SmokeDragDrop) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:DragDropSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:DragDropSmokeTimer.Interval = 250
  $script:DragDropSmokeTimer.Add_Tick({
    $script:DragDropSmokeTimer.Stop()
    $fixtureRoot = ''
    try {
      $fixtureRoot = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "attachment-manager-drop-smoke-$PID-$([guid]::NewGuid().ToString('N'))")
      $sourceFolder = Join-Path $fixtureRoot 'source'
      $packageFolder = Join-Path $fixtureRoot 'package'
      $ordinaryFile = Join-Path $fixtureRoot '一般檔案.txt'
      $sourceZip = Join-Path $fixtureRoot '來源.formal-source.zip'
      [void](New-Item -ItemType Directory -Path $sourceFolder -Force)
      [void](New-Item -ItemType Directory -Path $packageFolder -Force)
      [System.IO.File]::WriteAllText($ordinaryFile, 'drag smoke', (New-Object System.Text.UTF8Encoding($false)))
      [System.IO.File]::WriteAllText($sourceZip, 'drag smoke', (New-Object System.Text.UTF8Encoding($false)))

      $flags = [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic
      $onDragEnter = [System.Windows.Forms.Control].GetMethod('OnDragEnter', $flags)
      $onDragDrop = [System.Windows.Forms.Control].GetMethod('OnDragDrop', $flags)
      $invokeDrop = {
        param($Control, [string[]]$Paths)
        $data = New-Object System.Windows.Forms.DataObject
        $data.SetData([System.Windows.Forms.DataFormats]::FileDrop, [string[]]$Paths)
        $allowed = [System.Windows.Forms.DragDropEffects]::Copy
        $enterArgs = New-Object System.Windows.Forms.DragEventArgs($data, 0, 0, 0, $allowed, [System.Windows.Forms.DragDropEffects]::None)
        [void]$onDragEnter.Invoke($Control, [object[]]@($enterArgs.PSObject.BaseObject))
        $dropArgs = New-Object System.Windows.Forms.DragEventArgs($data, 0, 0, 0, $allowed, $enterArgs.Effect)
        [void]$onDragDrop.Invoke($Control, [object[]]@($dropArgs.PSObject.BaseObject))
        return $enterArgs.Effect
      }

      $sourceEffect = & $invokeDrop $script:SourcePath @($sourceFolder)
      [System.Windows.Forms.Application]::DoEvents()
      $sourceWorkerPid = if ($script:ReadOnlyProcess) { $script:ReadOnlyProcess.Id } else { 0 }
      $sourceResultFile = $script:ReadOnlyResultFile
      $sourceReadOnlyStarted = $script:ReadOnlyAction -eq 'check' -and $sourceWorkerPid -gt 0 -and -not $script:BtnBuild.Enabled
      Stop-ReadOnlyOperation

      $multiEffect = & $invokeDrop $script:SourcePath @($sourceFolder, $packageFolder)
      $multiRejected = $multiEffect -eq [System.Windows.Forms.DragDropEffects]::None -and $script:BottomStatus.Text -like '狀態：拖放未接受*'
      $ordinaryEffect = & $invokeDrop $script:SourcePath @($ordinaryFile)
      $ordinaryRejected = $ordinaryEffect -eq [System.Windows.Forms.DragDropEffects]::None -and $script:SourcePath.Text -eq $sourceFolder

      $verifyEffect = & $invokeDrop $script:PackagePath @($packageFolder)
      [System.Windows.Forms.Application]::DoEvents()
      $verifyWorkerPid = if ($script:ReadOnlyProcess) { $script:ReadOnlyProcess.Id } else { 0 }
      $verifyResultFile = $script:ReadOnlyResultFile
      $verifyReadOnlyStarted = $script:ReadOnlyAction -eq 'verify' -and $verifyWorkerPid -gt 0 -and -not $script:BtnBuild.Enabled
      Stop-ReadOnlyOperation

      $zipVerifyEffect = & $invokeDrop $script:PackagePath @($sourceZip)
      $zipVerifyRejected = $zipVerifyEffect -eq [System.Windows.Forms.DragDropEffects]::None -and $script:PackagePath.Text -eq $packageFolder -and $script:BottomStatus.Text -like '狀態：拖放未接受*'
      $resultFilesRemoved = -not (Test-Path -LiteralPath $sourceResultFile) -and -not (Test-Path -LiteralPath $verifyResultFile)
      $script:DragDropSmokeResult = [pscustomobject]@{
        status = if ($sourceEffect -eq [System.Windows.Forms.DragDropEffects]::Copy -and $sourceReadOnlyStarted -and $multiRejected -and $ordinaryRejected -and $verifyEffect -eq [System.Windows.Forms.DragDropEffects]::Copy -and $verifyReadOnlyStarted -and $zipVerifyRejected -and $resultFilesRemoved -and -not $script:ReadOnlyProcess -and -not $script:BtnBuild.Enabled) { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        sourceDropAccepted = [bool]($sourceEffect -eq [System.Windows.Forms.DragDropEffects]::Copy -and $sourceReadOnlyStarted)
        multiDropRejected = [bool]$multiRejected
        ordinaryFileRejected = [bool]$ordinaryRejected
        verifyFolderAccepted = [bool]($verifyEffect -eq [System.Windows.Forms.DragDropEffects]::Copy -and $verifyReadOnlyStarted)
        sourceZipRejectedByVerify = [bool]$zipVerifyRejected
        resultFilesRemoved = [bool]$resultFilesRemoved
        operationCleared = [bool](-not $script:ReadOnlyProcess)
        built = $false
      }
    } catch {
      $script:DragDropSmokeResult = [pscustomobject]@{ status = 'fail'; message = $_.Exception.Message; built = $false }
    } finally {
      Stop-ReadOnlyOperation
      if ($fixtureRoot) {
        $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
        $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($resolvedFixture.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedFixture).StartsWith('attachment-manager-drop-smoke-')) {
          Remove-Item -LiteralPath $resolvedFixture -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
      $script:MainForm.Close()
    }
  })
}

if ($SmokeBuildResponsiveness) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:BuildSmokeFixtureRoot = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "attachment-manager-build-smoke-$PID-$([guid]::NewGuid().ToString('N'))")
  [void](New-Item -ItemType Directory -Path (Join-Path $script:BuildSmokeFixtureRoot 'source') -Force)
  $script:BuildSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:BuildSmokeTimer.Interval = 200
  $script:BuildSmokeTimer.Add_Tick({
    try {
      if ($script:BuildSmokeResult) {
        if ($script:BuildProcess) { return }
        $script:BuildSmokeTimer.Stop()
        $script:MainForm.Close()
        return
      }
      $state = $script:BuildSmokeState
      if (-not $state) { throw '背景建立 smoke 未取得啟動狀態。' }
      $state.phaseStatusSeen = [bool]($state.phaseStatusSeen -or ($script:StatusMeta.Text -match '目前階段：準備與驗證附件來源'))
      $state.elapsedStatusSeen = [bool]($state.elapsedStatusSeen -or ($script:StatusMeta.Text -match '程序運作中｜.*已經過 00:0[1-9]｜' -and $script:BottomStatus.Text -match '正式建立進行中｜.*已經過 00:0[1-9]｜不可取消或關閉'))
      if (-not $state.interactionChecked) {
        $state.uiTimerRanDuringBuild = [bool]($script:BuildProcess -and -not $script:BuildProcess.HasExited)
        $visibleBeforeClose = [bool]$script:MainForm.Visible
        $script:MainForm.Close()
        [System.Windows.Forms.Application]::DoEvents()
        $state.closeBlocked = [bool]($visibleBeforeClose -and $script:MainForm.Visible -and -not $script:MainForm.IsDisposed -and $script:BuildProcess)
        $escapeEvent = New-Object System.Windows.Forms.KeyEventArgs([System.Windows.Forms.Keys]::Escape)
        Invoke-ManagerKeyDown -EventArgs $escapeEvent
        [System.Windows.Forms.Application]::DoEvents()
        $state.escapeBlocked = [bool]($escapeEvent.Handled -and $escapeEvent.SuppressKeyPress -and $script:BuildProcess -and $script:BottomStatus.Text -like '正式建立採原子發布*')
        $state.buildingActionVisible = [bool]($script:BtnBuild.Text -eq '正在建立正式附件包…' -and -not $script:BtnBuild.Enabled)
        $state.interactionChecked = $true
        return
      }
      if ($script:BuildProcess) { return }
      $workerExited = $state.workerPid -gt 0 -and -not (Get-Process -Id $state.workerPid -ErrorAction SilentlyContinue)
      $resultFileRemoved = -not (Test-Path -LiteralPath $state.resultFile)
      $progressFileRemoved = -not (Test-Path -LiteralPath $state.progressFile)
      $extraDirectories = @(Get-ChildItem -LiteralPath $script:BuildSmokeFixtureRoot -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'source' })
      $uiRecovered = -not $script:SourcePath.ReadOnly -and $script:BtnCheck.Enabled -and $script:BtnVerify.Enabled -and $script:BtnBuild.Text -eq '2. 建立正式附件包'
      $buildGrantCleared = -not $script:BtnBuild.Enabled -and -not $script:LastReadyInput -and -not $script:LastReadyProjectNo
      $script:BuildSmokeResult = [pscustomobject]@{
        status = if ($state.uiTimerRanDuringBuild -and $state.closeBlocked -and $state.escapeBlocked -and $state.buildingActionVisible -and $state.phaseStatusSeen -and $state.elapsedStatusSeen -and $workerExited -and $resultFileRemoved -and $progressFileRemoved -and $uiRecovered -and $buildGrantCleared -and $extraDirectories.Count -eq 0) { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        uiResponsiveDuringBuild = [bool]$state.uiTimerRanDuringBuild
        closeBlockedDuringBuild = [bool]$state.closeBlocked
        escapeBlockedDuringBuild = [bool]$state.escapeBlocked
        buildingActionVisible = [bool]$state.buildingActionVisible
        buildPhaseVisible = [bool]$state.phaseStatusSeen
        elapsedStatusVisible = [bool]$state.elapsedStatusSeen
        workerExited = [bool]$workerExited
        resultFileRemoved = [bool]$resultFileRemoved
        progressFileRemoved = [bool]$progressFileRemoved
        uiRecovered = [bool]$uiRecovered
        buildGrantCleared = [bool]$buildGrantCleared
        noPackageCreated = [bool]($extraDirectories.Count -eq 0)
        built = $false
      }
      $script:BuildSmokeTimer.Stop()
      $script:MainForm.Close()
    } catch {
      $script:BuildSmokeResult = [pscustomobject]@{ status = 'fail'; message = $_.Exception.Message; built = $false }
      if (-not $script:BuildProcess) {
        $script:BuildSmokeTimer.Stop()
        $script:MainForm.Close()
      }
    }
  })
}

$script:MainForm.Add_Shown({
  if ($SmokeBuildResponsiveness) {
    $sourceFolder = Join-Path $script:BuildSmokeFixtureRoot 'source'
    $script:SourcePath.Text = $sourceFolder
    $script:LastReadyInput = $sourceFolder
    $script:LastReadyProjectNo = ''
    $script:BtnBuild.Enabled = $true
    $script:BtnBuild.PerformClick()
    if ($script:BuildProcess) {
      $script:BuildSmokeState = [pscustomobject]@{
        workerPid = $script:BuildProcess.Id
        resultFile = $script:BuildResultFile
        progressFile = $script:BuildProgressFile
        interactionChecked = $false
        uiTimerRanDuringBuild = $false
        closeBlocked = $false
        escapeBlocked = $false
        buildingActionVisible = $false
        phaseStatusSeen = $false
        elapsedStatusSeen = $false
      }
      $script:BuildSmokeTimer.Start()
    } else {
      $script:BuildSmokeResult = [pscustomobject]@{ status = 'fail'; message = '背景建立程序未啟動。'; built = $false }
      $script:MainForm.Close()
    }
    return
  }
  if ($SmokeDragDrop) {
    $script:DragDropSmokeTimer.Start()
    return
  }
  if ($SmokeViewport) {
    $script:ViewportSmokeTimer.Start()
    return
  }
  if ($SmokeReadOnlyCancellation) {
    $script:BtnCheck.PerformClick()
    if ($script:ReadOnlyProcess) { $script:CancellationSmokeTimer.Start() }
    else { $script:MainForm.Close() }
    return
  }
  if ($SmokeReadOnlyCompletion) {
    $script:BtnCheck.PerformClick()
    if ($script:ReadOnlyProcess) {
      $script:CompletionSmokeWorkerPid = $script:ReadOnlyProcess.Id
      $script:CompletionSmokeResultFile = $script:ReadOnlyResultFile
      $script:CompletionSmokeTimer.Start()
    } else { $script:MainForm.Close() }
    return
  }
  if ($SmokeKeyboard) {
    $ctrlL = New-Object System.Windows.Forms.KeyEventArgs(([System.Windows.Forms.Keys]::Control -bor [System.Windows.Forms.Keys]::L))
    Invoke-ManagerKeyDown -EventArgs $ctrlL
    $focusedSource = $script:MainForm.ActiveControl -eq $script:SourcePath
    $enter = New-Object System.Windows.Forms.KeyEventArgs([System.Windows.Forms.Keys]::Enter)
    Invoke-ManagerKeyDown -EventArgs $enter
    if ($script:ReadOnlyProcess) {
      $script:KeyboardSmokeState = [pscustomobject]@{
        ctrlLFocusedSource = $focusedSource
        ctrlLHandled = [bool]($ctrlL.Handled -and $ctrlL.SuppressKeyPress)
        enterHandled = [bool]($enter.Handled -and $enter.SuppressKeyPress)
        workerPid = $script:ReadOnlyProcess.Id
        resultFile = $script:ReadOnlyResultFile
      }
      $script:KeyboardSmokeTimer.Start()
    } else { $script:MainForm.Close() }
    return
  }
  if (-not $AutoInspect -or -not $InitialPath.Trim()) { return }
  if ($InitialMode -eq 'verify') { $script:BtnVerify.PerformClick() }
  else { $script:BtnCheck.PerformClick() }
})

[void]$script:MainForm.ShowDialog()

if ($SmokeReadOnlyCancellation) {
  if (-not $script:CancellationSmokeResult) {
    $script:CancellationSmokeResult = [pscustomobject]@{ status = 'fail'; message = '背景取消 smoke 未產生結果。'; built = $false }
  }
  $script:CancellationSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:CancellationSmokeResult.status -ne 'pass') { exit 3 }
  exit 0
}

if ($SmokeReadOnlyCompletion) {
  if (-not $script:CompletionSmokeResult) {
    $script:CompletionSmokeResult = [pscustomobject]@{ status = 'fail'; message = '背景完成 smoke 未產生結果。'; built = $false }
  }
  $script:CompletionSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:CompletionSmokeResult.status -ne 'pass') { exit 3 }
  exit 0
}

if ($SmokeKeyboard) {
  if (-not $script:KeyboardSmokeResult) {
    $script:KeyboardSmokeResult = [pscustomobject]@{ status = 'fail'; message = '鍵盤 smoke 未產生結果。'; built = $false }
  }
  $script:KeyboardSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:KeyboardSmokeResult.status -ne 'pass') { exit 3 }
  exit 0
}

if ($SmokeViewport) {
  if (-not $script:ViewportSmokeResult) {
    $script:ViewportSmokeResult = [pscustomobject]@{ status = 'fail'; message = '小視窗 smoke 未產生結果。'; built = $false }
  }
  $script:ViewportSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:ViewportSmokeResult.status -ne 'pass') { exit 3 }
  exit 0
}

if ($SmokeDragDrop) {
  if (-not $script:DragDropSmokeResult) {
    $script:DragDropSmokeResult = [pscustomobject]@{ status = 'fail'; message = '拖放 smoke 未產生結果。'; built = $false }
  }
  $script:DragDropSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:DragDropSmokeResult.status -ne 'pass') { exit 3 }
  exit 0
}

if ($SmokeBuildResponsiveness) {
  if (-not $script:BuildSmokeResult) {
    $script:BuildSmokeResult = [pscustomobject]@{ status = 'fail'; message = '背景建立回應性 smoke 未產生結果。'; built = $false }
  }
  if ($script:BuildSmokeFixtureRoot) {
    $resolvedFixture = [System.IO.Path]::GetFullPath($script:BuildSmokeFixtureRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolvedFixture.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedFixture).StartsWith('attachment-manager-build-smoke-')) {
      Remove-Item -LiteralPath $resolvedFixture -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  $script:BuildSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:BuildSmokeResult.status -ne 'pass') { exit 3 }
  exit 0
}
