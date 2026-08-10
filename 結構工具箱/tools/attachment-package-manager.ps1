[CmdletBinding()]
param(
  [switch]$Smoke,
  [switch]$SmokeReadOnlyCancellation,
  [switch]$SmokeReadOnlyCompletion,
  [switch]$SmokeKeyboard,
  [switch]$SmokeViewport,
  [switch]$SmokeDragDrop,
  [switch]$SmokeBuildResponsiveness,
  [switch]$SmokeBuildRecoveryReceipt,
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
$script:BuildRequestedOutput = ''
$script:BuildSourceSnapshot = ''
$script:BuildStartedAt = $null
$script:BuildStatusLastElapsedSecond = -1
$script:BuildPhase = 'preparing-source'
$script:BuildTimer = $null
$script:BuildSmokeTimer = $null
$script:BuildSmokeState = $null
$script:BuildSmokeResult = $null
$script:BuildSmokeFixtureRoot = ''
$script:BuildHandoffRecoveryOutput = ''
$script:BtnBuildHandoffVerify = $null
$script:BtnBuildHandoffCopy = $null
$script:BuildRecoveryCandidates = @()
$script:BuildRecoveryReceiptPath = ''
$script:HandoffRecoveryReceiptPath = ''
$script:HandoffRecoveryExpiresAtUtc = $null
$script:HandoffRecoveryTimer = $null
$script:ActiveRecoveryReceiptPath = ''
$script:BuildRecoverySmokeTimer = $null
$script:BuildRecoverySmokeResult = $null
$script:BuildRecoverySmokeFixtureRoot = ''
$script:BuildRecoverySmokeState = $null
$script:ActiveMode = $InitialMode

$dynamicSmokeCount = @(@($SmokeReadOnlyCancellation, $SmokeReadOnlyCompletion, $SmokeKeyboard, $SmokeViewport, $SmokeDragDrop, $SmokeBuildResponsiveness, $SmokeBuildRecoveryReceipt) | Where-Object { $_ }).Count
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

function Clear-BuildHandoffRecovery {
  if ($script:HandoffRecoveryTimer) { $script:HandoffRecoveryTimer.Stop() }
  $script:BuildHandoffRecoveryOutput = ''
  $script:HandoffRecoveryReceiptPath = ''
  $script:HandoffRecoveryExpiresAtUtc = $null
  $script:BuildRecoveryCandidates = @()
  if ($script:BtnBuildHandoffVerify) {
    $script:BtnBuildHandoffVerify.Text = '唯讀驗證待確認輸出'
    $script:BtnBuildHandoffVerify.Visible = $false
    $script:BtnBuildHandoffVerify.Enabled = $false
  }
  if ($script:BtnBuildHandoffCopy) {
    $script:BtnBuildHandoffCopy.Text = '複製精確路徑 (Ctrl+C)'
    $script:BtnBuildHandoffCopy.Visible = $false
    $script:BtnBuildHandoffCopy.Enabled = $false
  }
  if ($script:StatusTitle) { $script:StatusTitle.Width = 960 }
  if ($script:StatusMeta) {
    $script:StatusMeta.Width = 960
    $script:StatusMeta.ForeColor = [System.Drawing.SystemColors]::ControlText
    $script:StatusMeta.AccessibleDescription = ''
  }
}

function Show-WorkerResponse {
  param($Response)
  Clear-BuildHandoffRecovery
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

function Show-BuildResultHandoffUnknown {
  param([System.Exception]$ErrorRecord, [string]$RequestedOutput, [string]$SourceSnapshot, [string]$RecoveryReceiptPath = '')
  Clear-BuildHandoffRecovery
  Set-StatusAppearance -Status 'review' -Title '正式附件包建立結果待確認'
  $script:StatusMeta.Text = '背景結果交接未完成；這不代表附件包建立失敗。請先驗證可能的輸出，不要直接重建。'
  $locationHint = if ($RequestedOutput) {
    "預定輸出：$RequestedOutput"
  } elseif ($SourceSnapshot) {
    "輸出位置未明確指定；請先檢查來源旁最新建立的正式附件包：$SourceSnapshot"
  } else {
    '輸出位置無法由目前畫面還原；請先檢查案件資料夾中的最新正式附件包。'
  }
  $script:DetailsBox.Text = "$($ErrorRecord.Message)`r`n$locationHint`r`n找到候選附件包後，請使用「驗證附件包」完成唯讀複驗；確認沒有新附件包後才能重新建立。"
  if ($RequestedOutput -and (Test-Path -LiteralPath $RequestedOutput -PathType Container)) {
    $recoveryCandidate = $null
    if ($RecoveryReceiptPath) {
      $currentCandidates = @(Get-EligibleBuildRecoveryReceipts -ReceiptPaths @($RecoveryReceiptPath) | Where-Object { $_.path.Equals($RecoveryReceiptPath, [System.StringComparison]::OrdinalIgnoreCase) -and $_.outputPath.Equals($RequestedOutput, [System.StringComparison]::OrdinalIgnoreCase) })
      if ($currentCandidates.Count -ne 1) {
        $script:StatusMeta.Text = '短期復原收據已到期或失效；複製與唯讀驗證已停用。'
        $script:BottomStatus.Text = '狀態：短期復原收據無效｜未執行複製、驗證或重建'
        return
      }
      $recoveryCandidate = $currentCandidates[0]
    }
    $script:LastOutputDirectory = $RequestedOutput
    $script:PackagePath.Text = $RequestedOutput
    $script:BtnOpenOutput.Enabled = $true
    $script:BuildHandoffRecoveryOutput = $RequestedOutput
    $script:HandoffRecoveryReceiptPath = $RecoveryReceiptPath
    if ($recoveryCandidate) {
      $script:BuildRecoveryCandidates = @($recoveryCandidate)
      $script:HandoffRecoveryExpiresAtUtc = ([DateTime]$recoveryCandidate.expiresAtUtc).ToUniversalTime()
    }
    $script:BtnBuildHandoffVerify.Text = '唯讀驗證待確認輸出'
    $script:BtnBuildHandoffVerify.Visible = $true
    $script:BtnBuildHandoffVerify.Enabled = $true
    $script:BtnBuildHandoffCopy.Text = '複製精確路徑 (Ctrl+C)'
    $script:BtnBuildHandoffCopy.Visible = $true
    $script:BtnBuildHandoffCopy.Enabled = $true
    $script:StatusTitle.Width = 530
    $script:StatusMeta.Width = 530
    if ($recoveryCandidate -and (Update-SingleBuildHandoffExpiry)) { $script:HandoffRecoveryTimer.Start() }
  }
  $script:BottomStatus.Text = '狀態：建立結果待確認｜先驗證輸出，不要直接重建'
}

function Assert-WorkerResponseEnvelope {
  param($Response, [string]$ExpectedAction, [int]$ExitCode)
  $status = [string](Get-ResponseValue $Response 'status')
  $action = [string](Get-ResponseValue $Response 'action')
  $expectedExitCodes = @{ ready = 0; review = 1; blocked = 2; error = 3 }
  if (-not $expectedExitCodes.ContainsKey($status)) {
    throw "背景結果含未知狀態：$status。"
  }
  $expectedActionValue = if ($status -eq 'error') { 'error' } else { $ExpectedAction }
  if ($action -ne $expectedActionValue -or $ExitCode -ne [int]$expectedExitCodes[$status]) {
    throw "背景結果與程序退出狀態不一致（action=$action, status=$status, exit=$ExitCode）；拒絕套用。"
  }
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

function Test-ManagedBuildRecoveryReceiptPath {
  param([string]$ReceiptPath)
  if (-not $ReceiptPath) { return $false }
  $resolved = [System.IO.Path]::GetFullPath($ReceiptPath)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  $parent = [System.IO.Path]::GetDirectoryName($resolved).TrimEnd('\')
  $name = [System.IO.Path]::GetFileName($resolved)
  return $parent -eq $tempRoot -and $name -match '^attachment-package-manager-build-recovery-[0-9a-f]{32}\.json$'
}

function Test-ManagedReadOnlyResultPath {
  param([string]$ResultFile)
  if (-not $ResultFile) { return $false }
  $resolved = [System.IO.Path]::GetFullPath($ResultFile)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  return [System.IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -eq $tempRoot -and [System.IO.Path]::GetFileName($resolved) -match '^attachment-package-manager-result-[0-9]+-[0-9a-f]{32}\.json$'
}

function Test-ManagedBuildProgressPath {
  param([string]$ProgressFile)
  if (-not $ProgressFile) { return $false }
  $resolved = [System.IO.Path]::GetFullPath($ProgressFile)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
  return [System.IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -eq $tempRoot -and [System.IO.Path]::GetFileName($resolved) -match '^attachment-package-manager-progress-[0-9]+-[0-9a-f]{32}\.jsonl$'
}

function Write-BuildRecoveryReceipt {
  param([string]$ReceiptPath, $Receipt, [switch]$CreateNew)
  if (-not (Test-ManagedBuildRecoveryReceiptPath -ReceiptPath $ReceiptPath)) { throw '拒絕寫入非受管的建立復原收據路徑。' }
  $json = $Receipt | ConvertTo-Json -Depth 4
  $encoding = New-Object System.Text.UTF8Encoding($false)
  if ($CreateNew) {
    $stream = New-Object System.IO.FileStream($ReceiptPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
      $bytes = $encoding.GetBytes("$json`n")
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush($true)
    } finally {
      $stream.Dispose()
    }
    return
  }
  if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { throw '待更新的建立復原收據不存在。' }
  $updatePath = "$ReceiptPath.update-$PID-$([guid]::NewGuid().ToString('N')).tmp"
  $backupPath = "$ReceiptPath.backup-$PID-$([guid]::NewGuid().ToString('N')).tmp"
  try {
    [System.IO.File]::WriteAllText($updatePath, "$json`n", $encoding)
    [System.IO.File]::Replace($updatePath, $ReceiptPath, $backupPath, $true)
  } finally {
    Remove-Item -LiteralPath $updatePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  }
}

function New-BuildRecoveryReceipt {
  param([string]$SourcePath, [string]$OutputPath, [string]$ResultFile, [string]$ProgressFile)
  $requestId = [guid]::NewGuid().ToString('N')
  $createdAt = [DateTime]::UtcNow
  $receiptPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "attachment-package-manager-build-recovery-$requestId.json")
  $managerProcess = Get-Process -Id $PID
  $receipt = [ordered]@{
    schemaVersion = 1
    kind = 'formal-attachment-build-recovery.v1'
    requestId = $requestId
    state = 'starting'
    createdAtUtc = $createdAt.ToString('o')
    expiresAtUtc = $createdAt.AddHours(24).ToString('o')
    managerPid = $PID
    managerStartedAtUtc = $managerProcess.StartTime.ToUniversalTime().ToString('o')
    workerPid = 0
    workerStartedAtUtc = ''
    sourcePath = [System.IO.Path]::GetFullPath($SourcePath)
    outputPath = [System.IO.Path]::GetFullPath($OutputPath)
    resultFile = [System.IO.Path]::GetFullPath($ResultFile)
    progressFile = [System.IO.Path]::GetFullPath($ProgressFile)
  }
  Write-BuildRecoveryReceipt -ReceiptPath $receiptPath -Receipt $receipt -CreateNew
  return [pscustomobject]@{ path = $receiptPath; data = $receipt }
}

function Remove-BuildRecoveryReceipt {
  param([string]$ReceiptPath, [switch]$CleanupArtifacts)
  if (-not (Test-ManagedBuildRecoveryReceiptPath -ReceiptPath $ReceiptPath)) { return }
  $receipt = $null
  if ($CleanupArtifacts -and (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) {
    try { $receipt = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
  }
  Remove-Item -LiteralPath ([System.IO.Path]::GetFullPath($ReceiptPath)) -Force -ErrorAction SilentlyContinue
  if ($receipt) {
    $managerAlive = Test-ReceiptProcessAlive -ProcessId ([int](Get-ResponseValue $receipt 'managerPid' 0)) -StartedAtUtc ([string](Get-ResponseValue $receipt 'managerStartedAtUtc'))
    $workerAlive = Test-ReceiptProcessAlive -ProcessId ([int](Get-ResponseValue $receipt 'workerPid' 0)) -StartedAtUtc ([string](Get-ResponseValue $receipt 'workerStartedAtUtc'))
    if (-not $managerAlive -and -not $workerAlive) {
      Remove-ReadOnlyResultFile -ResultFile ([string](Get-ResponseValue $receipt 'resultFile'))
      Remove-BuildProgressFile -ProgressFile ([string](Get-ResponseValue $receipt 'progressFile'))
      Remove-WorkerSourceTempRoots -WorkerPid ([int](Get-ResponseValue $receipt 'workerPid' 0))
    }
  }
}

function Set-BuildRecoveryReceiptState {
  param([string]$ReceiptPath, [string]$State, [int]$WorkerPid = 0, [string]$WorkerStartedAtUtc = '')
  if (-not (Test-ManagedBuildRecoveryReceiptPath -ReceiptPath $ReceiptPath) -or -not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { return }
  $receipt = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $receipt | Add-Member -NotePropertyName state -NotePropertyValue $State -Force
  $receipt | Add-Member -NotePropertyName workerPid -NotePropertyValue $WorkerPid -Force
  $receipt | Add-Member -NotePropertyName workerStartedAtUtc -NotePropertyValue $WorkerStartedAtUtc -Force
  if ($State -eq 'pending-verification') {
    $receipt | Add-Member -NotePropertyName managerPid -NotePropertyValue 0 -Force
    $receipt | Add-Member -NotePropertyName managerStartedAtUtc -NotePropertyValue '' -Force
  }
  Write-BuildRecoveryReceipt -ReceiptPath $ReceiptPath -Receipt $receipt
}

function Test-ReceiptProcessAlive {
  param([int]$ProcessId, [string]$StartedAtUtc)
  if ($ProcessId -le 0) { return $false }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  if (-not $StartedAtUtc) { return $true }
  try {
    $expected = [DateTime]::Parse($StartedAtUtc).ToUniversalTime()
    return [Math]::Abs(($process.StartTime.ToUniversalTime() - $expected).TotalSeconds) -lt 2
  } catch {
    return $true
  }
}

function Get-EligibleBuildRecoveryReceipts {
  param([string[]]$ReceiptPaths = @())
  if (-not $ReceiptPaths.Count) {
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $ReceiptPaths = @(Get-ChildItem -LiteralPath $tempRoot -File -Filter 'attachment-package-manager-build-recovery-*.json' -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  }
  $eligible = @()
  foreach ($receiptPath in @($ReceiptPaths)) {
    if (-not (Test-ManagedBuildRecoveryReceiptPath -ReceiptPath $receiptPath)) { continue }
    try {
      $receiptItem = Get-Item -LiteralPath $receiptPath -Force -ErrorAction Stop
      if (($receiptItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or $receiptItem.Length -gt 32768) {
        Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath
        continue
      }
      $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
      $requestId = [string](Get-ResponseValue $receipt 'requestId')
      $fileRequestId = ([System.IO.Path]::GetFileNameWithoutExtension($receiptPath) -replace '^attachment-package-manager-build-recovery-', '')
      $sourcePath = [string](Get-ResponseValue $receipt 'sourcePath')
      $outputPath = [string](Get-ResponseValue $receipt 'outputPath')
      $resultFile = [string](Get-ResponseValue $receipt 'resultFile')
      $progressFile = [string](Get-ResponseValue $receipt 'progressFile')
      $state = [string](Get-ResponseValue $receipt 'state')
      $createdAt = [DateTime]::Parse([string](Get-ResponseValue $receipt 'createdAtUtc')).ToUniversalTime()
      $expiresAt = [DateTime]::Parse([string](Get-ResponseValue $receipt 'expiresAtUtc')).ToUniversalTime()
      if ([int](Get-ResponseValue $receipt 'schemaVersion' 0) -ne 1 -or
          [string](Get-ResponseValue $receipt 'kind') -ne 'formal-attachment-build-recovery.v1' -or
          $requestId -notmatch '^[0-9a-f]{32}$' -or $requestId -ne $fileRequestId -or
          @('starting', 'running', 'pending-verification') -notcontains $state -or
          -not [System.IO.Path]::IsPathRooted($sourcePath) -or -not [System.IO.Path]::IsPathRooted($outputPath) -or
          -not (Test-ManagedReadOnlyResultPath -ResultFile $resultFile) -or -not (Test-ManagedBuildProgressPath -ProgressFile $progressFile) -or
          $createdAt -gt [DateTime]::UtcNow.AddMinutes(5) -or $expiresAt -le $createdAt -or ($expiresAt - $createdAt).TotalHours -gt 24.01) {
        Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath
        continue
      }
      $managerAlive = Test-ReceiptProcessAlive -ProcessId ([int](Get-ResponseValue $receipt 'managerPid' 0)) -StartedAtUtc ([string](Get-ResponseValue $receipt 'managerStartedAtUtc'))
      $workerAlive = Test-ReceiptProcessAlive -ProcessId ([int](Get-ResponseValue $receipt 'workerPid' 0)) -StartedAtUtc ([string](Get-ResponseValue $receipt 'workerStartedAtUtc'))
      if ($managerAlive -or $workerAlive) { continue }
      if ($expiresAt -le [DateTime]::UtcNow) {
        Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath -CleanupArtifacts
        continue
      }
      if (Test-Path -LiteralPath $outputPath -PathType Container) {
        $eligible += [pscustomobject]@{
          path = $receiptPath
          receipt = $receipt
          outputPath = $outputPath
          sourcePath = $sourcePath
          state = $state
          createdAtUtc = $createdAt
          expiresAtUtc = $expiresAt
        }
      }
    } catch {
      Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath
      continue
    }
  }
  return @($eligible)
}

function Restore-BuildRecoveryReceipt {
  param([string[]]$ReceiptPaths = @())
  $eligible = @(Get-EligibleBuildRecoveryReceipts -ReceiptPaths $ReceiptPaths)
  if (-not $eligible.Count) { return $false }
  Clear-BuildHandoffRecovery
  if ($eligible.Count -gt 1) {
    $script:BuildRecoveryCandidates = @($eligible)
    Set-StatusAppearance -Status 'review' -Title '有多筆建立結果待確認'
    $script:StatusMeta.Text = '未自動挑選任何項目；請開啟清單並明確選定一筆，再執行唯讀驗證。'
    $script:DetailsBox.Text = ($eligible | ForEach-Object { $_.outputPath }) -join "`r`n"
    $script:BtnBuildHandoffVerify.Text = "選擇 $($eligible.Count) 筆待確認輸出"
    $script:BtnBuildHandoffVerify.Visible = $true
    $script:BtnBuildHandoffVerify.Enabled = $true
    $script:BtnBuildHandoffCopy.Visible = $false
    $script:BtnBuildHandoffCopy.Enabled = $false
    $script:StatusTitle.Width = 710
    $script:StatusMeta.Width = 710
    $script:BottomStatus.Text = "狀態：$($eligible.Count) 筆待確認｜未自動選取或重建"
    return $true
  }
  $candidate = $eligible[0]
  $script:BuildRecoveryCandidates = @($candidate)
  Show-BuildResultHandoffUnknown -ErrorRecord ([System.InvalidOperationException]::new('已從上次異常中斷的本機短期收據還原精確預定輸出。')) -RequestedOutput $candidate.outputPath -SourceSnapshot $candidate.sourcePath -RecoveryReceiptPath $candidate.path
  return $true
}

function Get-BuildRecoveryStatusLabel {
  param([string]$State)
  switch ($State) {
    'starting' { return '啟動中斷後待確認' }
    'running' { return '建立中斷後待確認' }
    'pending-verification' { return '待唯讀驗證' }
    default { return '狀態待確認' }
  }
}

function Format-BuildRecoveryRemainingTime {
  param([DateTime]$ExpiresAtUtc, [DateTime]$NowUtc = [DateTime]::UtcNow)
  $remaining = $ExpiresAtUtc.ToUniversalTime() - $NowUtc.ToUniversalTime()
  if ($remaining.TotalSeconds -le 0) { return '已到期' }
  if ($remaining.TotalHours -ge 1) {
    return "剩餘 $([Math]::Floor($remaining.TotalHours)) 小時 $($remaining.Minutes) 分"
  }
  if ($remaining.TotalMinutes -ge 1) { return "剩餘 $([Math]::Floor($remaining.TotalMinutes)) 分" }
  return '剩餘不到 1 分鐘'
}

function Update-SingleBuildHandoffExpiry {
  param([DateTime]$NowUtc = [DateTime]::UtcNow)
  $receiptPath = [string]$script:HandoffRecoveryReceiptPath
  $outputPath = [string]$script:BuildHandoffRecoveryOutput
  if (-not $receiptPath -or -not $script:HandoffRecoveryExpiresAtUtc) { return $false }
  $expiresAt = ([DateTime]$script:HandoffRecoveryExpiresAtUtc).ToUniversalTime()
  if ($NowUtc.ToUniversalTime() -ge $expiresAt) {
    Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath -CleanupArtifacts
    Clear-BuildHandoffRecovery
    Set-StatusAppearance -Status 'review' -Title '正式附件包建立結果待確認'
    $script:StatusMeta.Text = '短期復原收據已到期；複製與唯讀驗證已自動停用。'
    $script:BottomStatus.Text = '狀態：短期復原收據已到期｜未執行複製、驗證或重建'
    return $false
  }
  $currentCandidates = @(Get-EligibleBuildRecoveryReceipts -ReceiptPaths @($receiptPath) | Where-Object { $_.path.Equals($receiptPath, [System.StringComparison]::OrdinalIgnoreCase) -and $_.outputPath.Equals($outputPath, [System.StringComparison]::OrdinalIgnoreCase) })
  if ($currentCandidates.Count -ne 1 -or -not (Test-Path -LiteralPath $outputPath -PathType Container)) {
    Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath -CleanupArtifacts
    Clear-BuildHandoffRecovery
    Set-StatusAppearance -Status 'review' -Title '正式附件包建立結果待確認'
    $script:StatusMeta.Text = '短期復原收據已失效或輸出不存在；複製與唯讀驗證已自動停用。'
    $script:BottomStatus.Text = '狀態：短期復原狀態失效｜未執行複製、驗證或重建'
    return $false
  }
  $remainingText = Format-BuildRecoveryRemainingTime -ExpiresAtUtc $expiresAt -NowUtc $NowUtc
  $remaining = $expiresAt - $NowUtc.ToUniversalTime()
  $urgencyLabel = if ($remaining.TotalMinutes -le 30) { '30 分鐘內到期' } elseif ($remaining.TotalHours -le 2) { '2 小時內到期' } else { '' }
  $urgencyDescription = if ($urgencyLabel) { $urgencyLabel } else { '期限狀態一般' }
  $script:StatusMeta.ForeColor = if ($remaining.TotalMinutes -le 30) {
    [System.Drawing.Color]::FromArgb(192, 57, 43)
  } elseif ($remaining.TotalHours -le 2) {
    [System.Drawing.Color]::FromArgb(146, 64, 14)
  } else {
    [System.Drawing.SystemColors]::ControlText
  }
  $localExpiry = $expiresAt.ToLocalTime().ToString('MM/dd HH:mm')
  $script:StatusMeta.Text = "短期收據有效至 $localExpiry｜$remainingText$(if ($urgencyLabel) { "｜$urgencyLabel" })"
  $script:StatusMeta.AccessibleDescription = "單筆待確認輸出的短期復原收據有效至 $($expiresAt.ToLocalTime().ToString('yyyy/MM/dd HH:mm:ss'))，$remainingText；$urgencyDescription。到期後複製與唯讀驗證會自動停用。"
  return $true
}

function Update-BuildRecoveryPickerRows {
  param(
    [Parameter(Mandatory = $true)][System.Windows.Forms.DataGridView]$Grid,
    [DateTime]$NowUtc = [DateTime]::UtcNow
  )
  foreach ($row in @($Grid.Rows)) {
    $candidate = $row.Tag
    if (-not $candidate) { continue }
    $expiresAt = ([DateTime]$candidate.expiresAtUtc).ToUniversalTime()
    $remaining = $expiresAt - $NowUtc.ToUniversalTime()
    $isCurrent = $remaining.TotalSeconds -gt 0
    $outputExists = Test-Path -LiteralPath ([string]$candidate.outputPath) -PathType Container
    $isEligible = $isCurrent -and $outputExists
    $isUrgent = $isEligible -and $remaining.TotalHours -le 2
    $isCritical = $isEligible -and $remaining.TotalMinutes -le 30
    $statusLabel = if (-not $outputExists) { '輸出已不存在' } elseif ($isCurrent) { Get-BuildRecoveryStatusLabel -State ([string]$candidate.state) } else { '已到期' }
    $row.Cells['status'].Value = if ($isCritical) { "$statusLabel｜30 分鐘內到期" } elseif ($isUrgent) { "$statusLabel｜2 小時內到期" } else { $statusLabel }
    $row.Cells['expiresAt'].Value = "$($expiresAt.ToLocalTime().ToString('yyyy/MM/dd HH:mm:ss'))（$(Format-BuildRecoveryRemainingTime -ExpiresAtUtc $expiresAt -NowUtc $NowUtc)）"
    $row.Cells['status'].Tag = $isEligible
    $row.DefaultCellStyle.ForeColor = if (-not $isEligible) {
      [System.Drawing.SystemColors]::GrayText
    } elseif ($isCritical) {
      [System.Drawing.Color]::FromArgb(192, 57, 43)
    } elseif ($isUrgent) {
      [System.Drawing.Color]::FromArgb(146, 64, 14)
    } else {
      [System.Drawing.SystemColors]::ControlText
    }
    $row.DefaultCellStyle.BackColor = if ($isCritical) { [System.Drawing.Color]::FromArgb(251, 234, 234) } elseif ($isUrgent) { [System.Drawing.Color]::FromArgb(255, 247, 230) } else { [System.Drawing.SystemColors]::Window }
  }
}

function Select-BuildRecoveryReceipt {
  param(
    [Parameter(Mandatory = $true)][object[]]$Candidates,
    [int]$SmokeSelectIndex = -1
  )
  if (-not $Candidates.Count) { return $null }
  $orderedCandidates = @($Candidates | Sort-Object @{ Expression = { ([DateTime]$_.expiresAtUtc).ToUniversalTime() } }, @{ Expression = { ([DateTime]$_.createdAtUtc).ToUniversalTime() } }, @{ Expression = { [string]$_.outputPath } })

  $dialog = New-Object System.Windows.Forms.Form
  $dialog.Text = '待確認輸出唯讀總覽'
  $dialog.StartPosition = 'CenterParent'
  $dialog.ClientSize = New-Object System.Drawing.Size(900, 420)
  $dialog.MinimizeBox = $false
  $dialog.MaximizeBox = $false
  $dialog.ShowInTaskbar = $false
  $dialog.AutoScaleMode = 'Dpi'

  $intro = New-Object System.Windows.Forms.Label
  $intro.Text = "$($Candidates.Count) 筆可驗證項目，已依最早到期優先排列；2 小時內深橙、30 分鐘內紅色並有明文提示。請明確選定一筆；可按 Ctrl+C 複製精確路徑。"
  $intro.Location = New-Object System.Drawing.Point(16, 16)
  $intro.Size = New-Object System.Drawing.Size(868, 42)
  $intro.AccessibleName = '待確認輸出選擇說明'
  $dialog.Controls.Add($intro)

  $grid = New-Object System.Windows.Forms.DataGridView
  $grid.Location = New-Object System.Drawing.Point(16, 64)
  $grid.Size = New-Object System.Drawing.Size(868, 292)
  $grid.Anchor = 'Top,Bottom,Left,Right'
  $grid.ReadOnly = $true
  $grid.AllowUserToAddRows = $false
  $grid.AllowUserToDeleteRows = $false
  $grid.AllowUserToResizeRows = $false
  $grid.MultiSelect = $false
  $grid.SelectionMode = 'FullRowSelect'
  $grid.ClipboardCopyMode = [System.Windows.Forms.DataGridViewClipboardCopyMode]::Disable
  $grid.RowHeadersVisible = $false
  $grid.AutoSizeColumnsMode = 'Fill'
  $grid.AccessibleName = '待確認附件包輸出清單'
  $grid.AccessibleDescription = '唯讀單選清單，初始不選取任何項目；2 小時內及 30 分鐘內到期會在狀態欄顯示明文提示，Ctrl+C 只複製有效選取項目的精確輸出路徑。'
  [void]$grid.Columns.Add('status', '狀態')
  [void]$grid.Columns.Add('createdAt', '建立時間')
  [void]$grid.Columns.Add('expiresAt', '有效至／剩餘期限')
  [void]$grid.Columns.Add('outputPath', '精確輸出路徑')
  $grid.Columns['status'].FillWeight = 18
  $grid.Columns['createdAt'].FillWeight = 20
  $grid.Columns['expiresAt'].FillWeight = 30
  $grid.Columns['outputPath'].FillWeight = 62
  foreach ($candidate in $orderedCandidates) {
    $createdAtText = ([DateTime]$candidate.createdAtUtc).ToLocalTime().ToString('yyyy/MM/dd HH:mm:ss')
    $rowIndex = $grid.Rows.Add('', $createdAtText, '', $candidate.outputPath)
    $grid.Rows[$rowIndex].Tag = $candidate
  }
  Update-BuildRecoveryPickerRows -Grid $grid
  $dialog.Controls.Add($grid)

  $openButton = New-Object System.Windows.Forms.Button
  $openButton.Text = '開啟選取資料夾'
  $openButton.Location = New-Object System.Drawing.Point(264, 372)
  $openButton.Size = New-Object System.Drawing.Size(160, 34)
  $openButton.Anchor = 'Bottom,Right'
  $openButton.Enabled = $false
  $openButton.AccessibleName = '開啟選取的附件包輸出資料夾'
  $openButton.AccessibleDescription = '只在 Windows 檔案總管開啟精確輸出位置，不驗證、不修改、不重建或核可附件包。'
  $dialog.Controls.Add($openButton)

  $copyButton = New-Object System.Windows.Forms.Button
  $copyButton.Text = '複製精確路徑 (Ctrl+C)'
  $copyButton.Location = New-Object System.Drawing.Point(432, 372)
  $copyButton.Size = New-Object System.Drawing.Size(176, 34)
  $copyButton.Anchor = 'Bottom,Right'
  $copyButton.Enabled = $false
  $copyButton.AccessibleName = '複製選取的附件包精確輸出路徑'
  $copyButton.AccessibleDescription = '按此按鈕或在清單按 Ctrl+C，只將仍有效且存在的精確輸出路徑複製到 Windows 剪貼簿，不驗證、不修改、不重建或核可附件包。'
  $dialog.Controls.Add($copyButton)

  $verifyButton = New-Object System.Windows.Forms.Button
  $verifyButton.Text = '唯讀驗證選取項目'
  $verifyButton.Location = New-Object System.Drawing.Point(616, 372)
  $verifyButton.Size = New-Object System.Drawing.Size(168, 34)
  $verifyButton.Anchor = 'Bottom,Right'
  $verifyButton.Enabled = $false
  $verifyButton.AccessibleName = '唯讀驗證選取的附件包輸出'
  $verifyButton.AccessibleDescription = '只有明確選取一列後才能執行；不會重建、修改或核可附件包。'
  $dialog.Controls.Add($verifyButton)

  $cancelButton = New-Object System.Windows.Forms.Button
  $cancelButton.Text = '取消'
  $cancelButton.Location = New-Object System.Drawing.Point(792, 372)
  $cancelButton.Size = New-Object System.Drawing.Size(92, 34)
  $cancelButton.Anchor = 'Bottom,Right'
  $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $dialog.Controls.Add($cancelButton)
  $dialog.CancelButton = $cancelButton

  $expiryTimer = New-Object System.Windows.Forms.Timer
  $expiryTimer.Interval = 30000
  $expiryTimer.Add_Tick({
    Update-BuildRecoveryPickerRows -Grid $grid
    $selectionEligible = [bool]($grid.SelectedRows.Count -eq 1 -and $grid.SelectedRows[0].Cells['status'].Tag)
    $openButton.Enabled = $selectionEligible
    $copyButton.Enabled = $selectionEligible
    $verifyButton.Enabled = $selectionEligible
  })

  $grid.Add_SelectionChanged({
    $selectionEligible = [bool]($grid.SelectedRows.Count -eq 1 -and $grid.SelectedRows[0].Cells['status'].Tag)
    $openButton.Enabled = $selectionEligible
    $copyButton.Enabled = $selectionEligible
    $copyButton.Text = '複製精確路徑 (Ctrl+C)'
    $verifyButton.Enabled = $selectionEligible
  })
  $openButton.Add_Click({
    Update-BuildRecoveryPickerRows -Grid $grid
    if ($grid.SelectedRows.Count -ne 1 -or -not $grid.SelectedRows[0].Cells['status'].Tag) { return }
    $candidate = $grid.SelectedRows[0].Tag
    $outputPath = [string]$candidate.outputPath
    if (-not (Test-Path -LiteralPath $outputPath -PathType Container)) {
      Update-BuildRecoveryPickerRows -Grid $grid
      $openButton.Enabled = $false
      $copyButton.Enabled = $false
      $verifyButton.Enabled = $false
      return
    }
    if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
      $script:BuildRecoverySmokeState.folderPreviewRequested = [bool]($outputPath.Equals($script:BuildRecoverySmokeState.outputPath, [System.StringComparison]::OrdinalIgnoreCase))
      return
    }
    try {
      Start-Process -FilePath explorer.exe -ArgumentList @($outputPath)
    } catch {
      [void][System.Windows.Forms.MessageBox]::Show($dialog, "無法開啟選取的輸出資料夾：$($_.Exception.Message)", '開啟資料夾失敗', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
    }
  })
  $copyButton.Add_Click({
    Update-BuildRecoveryPickerRows -Grid $grid
    if ($grid.SelectedRows.Count -ne 1 -or -not $grid.SelectedRows[0].Cells['status'].Tag) { return }
    $candidate = $grid.SelectedRows[0].Tag
    $outputPath = [string]$candidate.outputPath
    if (-not (Test-Path -LiteralPath $outputPath -PathType Container)) {
      Update-BuildRecoveryPickerRows -Grid $grid
      $openButton.Enabled = $false
      $copyButton.Enabled = $false
      $verifyButton.Enabled = $false
      return
    }
    if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
      $script:BuildRecoverySmokeState.exactPathCopyRequested = [bool]($outputPath.Equals($script:BuildRecoverySmokeState.outputPath, [System.StringComparison]::OrdinalIgnoreCase))
      return
    }
    try {
      [System.Windows.Forms.Clipboard]::SetText($outputPath)
      $copyButton.Text = '已複製精確路徑'
    } catch {
      [void][System.Windows.Forms.MessageBox]::Show($dialog, "無法複製精確輸出路徑：$($_.Exception.Message)", '複製路徑失敗', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
    }
  })
  $copyKeyHandler = {
    param($sender, $eventArgs)
    if (-not ($eventArgs.Control -and $eventArgs.KeyCode -eq [System.Windows.Forms.Keys]::C)) { return }
    $eventArgs.SuppressKeyPress = $true
    $eventArgs.Handled = $true
    if (-not $copyButton.Enabled) { return }
    if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
      $script:BuildRecoverySmokeState.exactPathKeyboardCopyRequested = $true
    }
    $copyButton.PerformClick()
  }
  $grid.Add_KeyDown($copyKeyHandler)
  $verifyButton.Add_Click({
    if ($grid.SelectedRows.Count -ne 1 -or -not $grid.SelectedRows[0].Cells['status'].Tag) { return }
    $dialog.Tag = $grid.SelectedRows[0].Tag
    $dialog.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $dialog.Close()
  })
  $dialog.Add_Shown({
    Update-BuildRecoveryPickerRows -Grid $grid
    $grid.ClearSelection()
    $grid.CurrentCell = $null
    $openButton.Enabled = $false
    $copyButton.Enabled = $false
    $verifyButton.Enabled = $false
    $expiryTimer.Start()
    if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
      $script:BuildRecoverySmokeState.overviewVisible = [bool]($grid.Columns.Contains('status') -and $grid.Columns.Contains('createdAt') -and $grid.Columns.Contains('expiresAt') -and $grid.Columns.Contains('outputPath') -and @($grid.Rows | Where-Object { $_.Cells['status'].Value -and $_.Cells['expiresAt'].Value -match '剩餘' }).Count -eq $Candidates.Count)
      $script:BuildRecoverySmokeState.initiallyUnselected = [bool]($grid.SelectedRows.Count -eq 0 -and -not $verifyButton.Enabled)
      $script:BuildRecoverySmokeState.earliestExpiryFirst = [bool]($grid.Rows.Count -eq $Candidates.Count -and $grid.Rows[0].Tag.path.Equals($script:BuildRecoverySmokeState.selectedReceiptPath, [System.StringComparison]::OrdinalIgnoreCase))
      $script:BuildRecoverySmokeState.urgentReceiptHighlighted = [bool]($grid.Rows[0].Cells['status'].Value -like '*2 小時內到期*' -and $grid.Rows[0].DefaultCellStyle.ForeColor.ToArgb() -eq [System.Drawing.Color]::FromArgb(146, 64, 14).ToArgb() -and $grid.Rows[0].DefaultCellStyle.BackColor.ToArgb() -eq [System.Drawing.Color]::FromArgb(255, 247, 230).ToArgb())
      $script:BuildRecoverySmokeState.normalReceiptUnhighlighted = [bool]($grid.Rows[1].Cells['status'].Value -notmatch '2 小時內到期|30 分鐘內到期' -and $grid.Rows[1].DefaultCellStyle.ForeColor.ToArgb() -eq [System.Drawing.SystemColors]::ControlText.ToArgb() -and $grid.Rows[1].DefaultCellStyle.BackColor.ToArgb() -eq [System.Drawing.SystemColors]::Window.ToArgb())
      $originalSmokeExpiry = $grid.Rows[0].Tag.expiresAtUtc
      $grid.Rows[0].Tag.expiresAtUtc = [DateTime]::UtcNow.AddMinutes(10)
      Update-BuildRecoveryPickerRows -Grid $grid
      $script:BuildRecoverySmokeState.criticalReceiptHighlighted = [bool]($grid.Rows[0].Cells['status'].Value -like '*30 分鐘內到期*' -and $grid.Rows[0].DefaultCellStyle.ForeColor.ToArgb() -eq [System.Drawing.Color]::FromArgb(192, 57, 43).ToArgb() -and $grid.Rows[0].DefaultCellStyle.BackColor.ToArgb() -eq [System.Drawing.Color]::FromArgb(251, 234, 234).ToArgb() -and $grid.AccessibleDescription -like '*2 小時內及 30 分鐘內到期*')
      $grid.Rows[0].Tag.expiresAtUtc = $originalSmokeExpiry
      Update-BuildRecoveryPickerRows -Grid $grid
      $script:BuildRecoverySmokeState.shortcutHintVisible = [bool]($intro.Text -like '*Ctrl+C*' -and $copyButton.Text -like '*Ctrl+C*')
      $unselectedCopyKeyEvent = New-Object System.Windows.Forms.KeyEventArgs ([System.Windows.Forms.Keys]::Control -bor [System.Windows.Forms.Keys]::C)
      & $copyKeyHandler $grid $unselectedCopyKeyEvent
      $script:BuildRecoverySmokeState.unselectedKeyboardCopyBlocked = [bool]($unselectedCopyKeyEvent.Handled -and $unselectedCopyKeyEvent.SuppressKeyPress -and -not $script:BuildRecoverySmokeState.exactPathCopyRequested -and -not $script:BuildRecoverySmokeState.exactPathKeyboardCopyRequested)
    }
    if ($SmokeSelectIndex -eq -2) {
      $cancelButton.PerformClick()
    } elseif ($SmokeSelectIndex -ge 0 -and $SmokeSelectIndex -lt $grid.Rows.Count) {
      $grid.Rows[$SmokeSelectIndex].Selected = $true
      $grid.CurrentCell = $grid.Rows[$SmokeSelectIndex].Cells[0]
      $openButton.PerformClick()
      $copyKeyEvent = New-Object System.Windows.Forms.KeyEventArgs ([System.Windows.Forms.Keys]::Control -bor [System.Windows.Forms.Keys]::C)
      & $copyKeyHandler $grid $copyKeyEvent
      $script:BuildRecoverySmokeState.exactPathKeyboardEventHandled = [bool]($copyKeyEvent.Handled -and $copyKeyEvent.SuppressKeyPress)
      $verifyButton.PerformClick()
    }
  })

  try {
    $result = $dialog.ShowDialog($script:MainForm)
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.Tag }
    return $null
  } finally {
    $expiryTimer.Stop()
    $expiryTimer.Dispose()
    $dialog.Dispose()
  }
}

function Remove-ReadOnlyResultFile {
  param([string]$ResultFile)
  if (-not $ResultFile) { return }
  if (Test-ManagedReadOnlyResultPath -ResultFile $ResultFile) { Remove-Item -LiteralPath ([System.IO.Path]::GetFullPath($ResultFile)) -Force -ErrorAction SilentlyContinue }
}

function Remove-BuildProgressFile {
  param([string]$ProgressFile)
  if (-not $ProgressFile) { return }
  if (Test-ManagedBuildProgressPath -ProgressFile $ProgressFile) { Remove-Item -LiteralPath ([System.IO.Path]::GetFullPath($ProgressFile)) -Force -ErrorAction SilentlyContinue }
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
  Clear-BuildHandoffRecovery
  $inputPath = $script:SourcePath.Text.Trim()
  $projectNo = $script:ProjectNo.Text.Trim()
  $outputPath = $script:OutputPath.Text.Trim()
  if (-not $inputPath -or $script:LastReadyInput -ne $inputPath -or $script:LastReadyProjectNo -ne $projectNo) {
    throw '附件來源或計畫編號已改變；請先重新執行唯讀檢查，再建立正式附件包。'
  }
  if (-not $outputPath) {
    throw '缺少可追溯的預定輸出位置；請重新執行唯讀檢查，或明確選擇輸出位置後再建立。'
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
  $receiptRecord = $null
  try {
    $receiptRecord = New-BuildRecoveryReceipt -SourcePath $inputPath -OutputPath $outputPath -ResultFile $resultFile -ProgressFile $progressFile
    [void]$process.Start()
  } catch {
    $process.Dispose()
    Remove-ReadOnlyResultFile -ResultFile $resultFile
    Remove-BuildProgressFile -ProgressFile $progressFile
    if ($receiptRecord) { Remove-BuildRecoveryReceipt -ReceiptPath $receiptRecord.path }
    throw
  }
  try {
    Set-BuildRecoveryReceiptState -ReceiptPath $receiptRecord.path -State 'running' -WorkerPid $process.Id -WorkerStartedAtUtc $process.StartTime.ToUniversalTime().ToString('o')
  } catch {
    # 初始收據已持久化；更新失敗不得取消已啟動的原子建立。
  }
  $script:BuildProcess = $process
  $script:BuildResultFile = $resultFile
  $script:BuildProgressFile = $progressFile
  $script:BuildRequestedOutput = $outputPath
  $script:BuildSourceSnapshot = $inputPath
  $script:BuildRecoveryReceiptPath = $receiptRecord.path
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
  $requestedOutput = $script:BuildRequestedOutput
  $sourceSnapshot = $script:BuildSourceSnapshot
  $recoveryReceiptPath = $script:BuildRecoveryReceiptPath
  $workerPid = $process.Id
  $exitCode = $process.ExitCode
  $process.Dispose()
  $script:BuildProcess = $null
  $script:BuildResultFile = ''
  $script:BuildProgressFile = ''
  $script:BuildRequestedOutput = ''
  $script:BuildSourceSnapshot = ''
  $script:BuildRecoveryReceiptPath = ''
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
    Assert-WorkerResponseEnvelope -Response $response -ExpectedAction 'build' -ExitCode $exitCode
    $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
    Show-WorkerResponse $response
    if ($response.built -and $response.outputDir) {
      $script:LastOutputDirectory = [string]$response.outputDir
      $script:PackagePath.Text = $script:LastOutputDirectory
      $script:BtnOpenOutput.Enabled = $true
    }
    Remove-BuildRecoveryReceipt -ReceiptPath $recoveryReceiptPath
  } catch {
    if ($requestedOutput -and (Test-Path -LiteralPath $requestedOutput -PathType Container)) {
      try { Set-BuildRecoveryReceiptState -ReceiptPath $recoveryReceiptPath -State 'pending-verification' -WorkerPid 0 } catch {}
      Show-BuildResultHandoffUnknown -ErrorRecord $_.Exception -RequestedOutput $requestedOutput -SourceSnapshot $sourceSnapshot -RecoveryReceiptPath $recoveryReceiptPath
    } else {
      Remove-BuildRecoveryReceipt -ReceiptPath $recoveryReceiptPath
      Show-BuildResultHandoffUnknown -ErrorRecord $_.Exception -RequestedOutput $requestedOutput -SourceSnapshot $sourceSnapshot
    }
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
  Clear-BuildHandoffRecovery
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
      $script:DetailsBox.AppendText("`r`n已產生本次建立專用的唯一預定輸出位置；尚未建立任何資料夾，建立前仍會檢查不覆寫。")
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
  $activeRecoveryReceiptPath = $script:ActiveRecoveryReceiptPath
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
    Assert-WorkerResponseEnvelope -Response $response -ExpectedAction $action -ExitCode $exitCode
    $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
    if ($action -eq 'check') { Apply-CheckResponse -Response $response -InputSnapshot $inputSnapshot -ProjectNoSnapshot $projectNoSnapshot }
    elseif ($script:PackagePath.Text.Trim() -eq $inputSnapshot) {
      if ($activeRecoveryReceiptPath -and $response.status -eq 'error') {
        $script:ActiveRecoveryReceiptPath = ''
        Show-BuildResultHandoffUnknown -ErrorRecord ([System.InvalidOperationException]::new([string](Get-ResponseValue $response 'displayText' '唯讀驗證未完成。'))) -RequestedOutput $inputSnapshot -RecoveryReceiptPath $activeRecoveryReceiptPath
      } else {
        Show-WorkerResponse $response
        if ($activeRecoveryReceiptPath) {
          Remove-BuildRecoveryReceipt -ReceiptPath $activeRecoveryReceiptPath -CleanupArtifacts
          $script:ActiveRecoveryReceiptPath = ''
        }
      }
    }
    else { $script:BottomStatus.Text = '附件包路徑已改變：已忽略過期驗證結果，請重新驗證。' }
  } catch {
    if ($activeRecoveryReceiptPath -and (Test-Path -LiteralPath $inputSnapshot -PathType Container)) {
      $script:ActiveRecoveryReceiptPath = ''
      Show-BuildResultHandoffUnknown -ErrorRecord $_.Exception -RequestedOutput $inputSnapshot -RecoveryReceiptPath $activeRecoveryReceiptPath
    } else {
      throw
    }
  } finally {
    Remove-ReadOnlyResultFile -ResultFile $resultFile
    Remove-WorkerSourceTempRoots -WorkerPid $workerPid
  }
}

function Cancel-ReadOnlyOperation {
  if (-not $script:ReadOnlyProcess) { return }
  $action = $script:ReadOnlyAction
  $inputSnapshot = $script:ReadOnlyInput
  $activeRecoveryReceiptPath = $script:ActiveRecoveryReceiptPath
  Stop-ReadOnlyOperation
  if ($activeRecoveryReceiptPath -and $action -eq 'verify' -and (Test-Path -LiteralPath $inputSnapshot -PathType Container)) {
    $script:ActiveRecoveryReceiptPath = ''
    Show-BuildResultHandoffUnknown -ErrorRecord ([System.OperationCanceledException]::new('待確認輸出的唯讀驗證已停止；短期復原收據仍保留，可再次驗證。')) -RequestedOutput $inputSnapshot -RecoveryReceiptPath $activeRecoveryReceiptPath
    return
  }
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
  if ($EventArgs.Control -and $EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::C) {
    $active = $script:MainForm.ActiveControl
    if ($active -ne $script:BtnBuildHandoffCopy) { return }
    Set-ManagerKeyHandled -EventArgs $EventArgs
    if (-not $script:BtnBuildHandoffCopy.Visible -or -not $script:BtnBuildHandoffCopy.Enabled -or $script:ReadOnlyProcess -or $script:BuildProcess) { return }
    if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
      $script:BuildRecoverySmokeState.singleHandoffKeyboardCopyRequested = $true
    }
    $script:BtnBuildHandoffCopy.PerformClick()
    return
  }
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
  if ($active -eq $script:BtnBuildHandoffVerify -and $script:BtnBuildHandoffVerify.Visible -and $script:BtnBuildHandoffVerify.Enabled) {
    $script:BtnBuildHandoffVerify.PerformClick()
    return
  }
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
$script:StatusMeta.AccessibleName = '附件包管理狀態補充資訊'
$script:StatusPanel.Controls.Add($script:StatusMeta)
$script:BtnBuildHandoffVerify = New-Object System.Windows.Forms.Button
$script:BtnBuildHandoffVerify.Text = '唯讀驗證待確認輸出'
$script:BtnBuildHandoffVerify.Location = New-Object System.Drawing.Point(748, 14)
$script:BtnBuildHandoffVerify.Size = New-Object System.Drawing.Size(230, 36)
$script:BtnBuildHandoffVerify.Anchor = 'Top,Right'
$script:BtnBuildHandoffVerify.Visible = $false
$script:BtnBuildHandoffVerify.Enabled = $false
$script:StatusPanel.Controls.Add($script:BtnBuildHandoffVerify)

$script:BtnBuildHandoffCopy = New-Object System.Windows.Forms.Button
$script:BtnBuildHandoffCopy.Text = '複製精確路徑 (Ctrl+C)'
$script:BtnBuildHandoffCopy.Location = New-Object System.Drawing.Point(570, 14)
$script:BtnBuildHandoffCopy.Size = New-Object System.Drawing.Size(170, 36)
$script:BtnBuildHandoffCopy.Anchor = 'Top,Right'
$script:BtnBuildHandoffCopy.Visible = $false
$script:BtnBuildHandoffCopy.Enabled = $false
$script:StatusPanel.Controls.Add($script:BtnBuildHandoffCopy)

$script:HandoffRecoveryTimer = New-Object System.Windows.Forms.Timer
$script:HandoffRecoveryTimer.Interval = 30000
$script:HandoffRecoveryTimer.Add_Tick({ [void](Update-SingleBuildHandoffExpiry) })

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
$script:BtnBuildHandoffVerify.TabIndex = 0
$script:BtnBuildHandoffVerify.AccessibleName = '唯讀驗證建立結果待確認的輸出'
$script:BtnBuildHandoffVerify.AccessibleDescription = '只呼叫既有附件包唯讀驗證，不會重新建立、修改或核可附件包。'
$script:BtnBuildHandoffCopy.TabIndex = 1
$script:BtnBuildHandoffCopy.AccessibleName = '複製單筆待確認輸出的精確路徑'
$script:BtnBuildHandoffCopy.AccessibleDescription = '按此按鈕或在焦點位於本按鈕時按 Ctrl+C，只將仍有效且存在的單筆待確認輸出路徑複製到 Windows 剪貼簿，不驗證、不修改、不重建或核可附件包。'
$script:ResultGrid.AccessibleName = '附件檢查結果清單'
$script:DetailsBox.AccessibleName = '附件檢查問題與處置說明'

foreach ($control in @($script:SourcePath, $script:ProjectNo, $script:OutputPath, $script:BtnCheck)) {
  $control.Add_Enter({ $script:ActiveMode = 'source' })
}
foreach ($control in @($script:PackagePath, $script:BtnVerify)) {
  $control.Add_Enter({ $script:ActiveMode = 'verify' })
}

$invalidateBuild = {
  Clear-BuildHandoffRecovery
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
  $verifyInput = $script:PackagePath.Text.Trim()
  $matchingReceipts = @(Get-EligibleBuildRecoveryReceipts | Where-Object { $_.outputPath.Equals($verifyInput, [System.StringComparison]::OrdinalIgnoreCase) })
  if ($matchingReceipts.Count -eq 1) { $script:ActiveRecoveryReceiptPath = $matchingReceipts[0].path }
  try {
    Start-ReadOnlyOperation -Action verify -InputPath $verifyInput
  } catch {
    $script:ActiveRecoveryReceiptPath = ''
    Show-OperationError $_.Exception
  }
})

$script:BtnBuildHandoffVerify.Add_Click({
  $restartCandidates = @($script:BuildRecoveryCandidates)
  $recoveryCandidate = $null
  if ($restartCandidates.Count -gt 1) {
    $pickerArgs = @{ Candidates = @($restartCandidates) }
    if ($SmokeBuildRecoveryReceipt) { $pickerArgs.SmokeSelectIndex = 0 }
    $recoveryCandidate = Select-BuildRecoveryReceipt @pickerArgs
    if (-not $recoveryCandidate) { return }
  }
  $recoveryOutput = if ($recoveryCandidate) { [string]$recoveryCandidate.outputPath } else { $script:BuildHandoffRecoveryOutput }
  $recoveryReceiptPath = if ($recoveryCandidate) { [string]$recoveryCandidate.path } else { $script:HandoffRecoveryReceiptPath }
  if ($restartCandidates.Count -gt 0 -and $recoveryReceiptPath) {
    $currentCandidates = @(Get-EligibleBuildRecoveryReceipts -ReceiptPaths @($recoveryReceiptPath) | Where-Object { $_.path.Equals($recoveryReceiptPath, [System.StringComparison]::OrdinalIgnoreCase) -and $_.outputPath.Equals($recoveryOutput, [System.StringComparison]::OrdinalIgnoreCase) })
    if ($currentCandidates.Count -ne 1) {
      Clear-BuildHandoffRecovery
      Show-OperationError ([System.InvalidOperationException]::new('選定的短期收據已到期、失效或與輸出路徑不一致；未執行驗證，請重新開啟管理器取得目前狀態。'))
      return
    }
    $recoveryCandidate = $currentCandidates[0]
    $recoveryOutput = [string]$recoveryCandidate.outputPath
    $recoveryReceiptPath = [string]$recoveryCandidate.path
  }
  if (-not $recoveryOutput -or -not (Test-Path -LiteralPath $recoveryOutput -PathType Container)) {
    Clear-BuildHandoffRecovery
    Show-OperationError ([System.InvalidOperationException]::new('待確認的預定輸出已不存在；請重新選擇候選附件包後執行唯讀驗證。'))
    return
  }
  Clear-BuildHandoffRecovery
  $script:PackagePath.Text = $recoveryOutput
  $script:ActiveMode = 'verify'
  $script:ActiveRecoveryReceiptPath = $recoveryReceiptPath
  try {
    Start-ReadOnlyOperation -Action verify -InputPath $recoveryOutput
    if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
      $script:BuildRecoverySmokeState.verifyStarted = [bool]($script:ReadOnlyProcess -and $script:ReadOnlyAction -eq 'verify' -and $script:ReadOnlyInput -eq $recoveryOutput -and $script:ActiveRecoveryReceiptPath -eq $recoveryReceiptPath)
    }
  } catch {
    $script:ActiveRecoveryReceiptPath = ''
    if ($recoveryReceiptPath) {
      Show-BuildResultHandoffUnknown -ErrorRecord $_.Exception -RequestedOutput $recoveryOutput -RecoveryReceiptPath $recoveryReceiptPath
      return
    }
    Show-OperationError $_.Exception
  }
})

$script:BtnBuildHandoffCopy.Add_Click({
  $recoveryOutput = [string]$script:BuildHandoffRecoveryOutput
  $recoveryReceiptPath = [string]$script:HandoffRecoveryReceiptPath
  if ($recoveryReceiptPath) {
    $currentCandidates = @(Get-EligibleBuildRecoveryReceipts -ReceiptPaths @($recoveryReceiptPath) | Where-Object { $_.path.Equals($recoveryReceiptPath, [System.StringComparison]::OrdinalIgnoreCase) -and $_.outputPath.Equals($recoveryOutput, [System.StringComparison]::OrdinalIgnoreCase) })
    if ($currentCandidates.Count -ne 1) {
      Clear-BuildHandoffRecovery
      Show-OperationError ([System.InvalidOperationException]::new('單筆短期收據已到期、失效或與輸出路徑不一致；未複製路徑，請重新開啟管理器取得目前狀態。'))
      return
    }
    $recoveryOutput = [string]$currentCandidates[0].outputPath
  }
  if (-not $recoveryOutput -or -not (Test-Path -LiteralPath $recoveryOutput -PathType Container)) {
    Clear-BuildHandoffRecovery
    Show-OperationError ([System.InvalidOperationException]::new('單筆待確認的預定輸出已不存在；未複製任何路徑。'))
    return
  }
  if ($SmokeBuildRecoveryReceipt -and $script:BuildRecoverySmokeState) {
    $script:BuildRecoverySmokeState.singleHandoffPathCopyRequested = [bool]($recoveryOutput.Equals($script:BuildRecoverySmokeState.outputPath, [System.StringComparison]::OrdinalIgnoreCase))
    return
  }
  try {
    [System.Windows.Forms.Clipboard]::SetText($recoveryOutput)
    $script:BtnBuildHandoffCopy.Text = '已複製 (Ctrl+C)'
  } catch {
    [void][System.Windows.Forms.MessageBox]::Show($script:MainForm, "無法複製單筆待確認輸出路徑：$($_.Exception.Message)", '複製路徑失敗', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
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
  if ($script:HandoffRecoveryTimer) { $script:HandoffRecoveryTimer.Stop() }
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

if ($SmokeBuildRecoveryReceipt) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
  $script:BuildRecoverySmokeFixtureRoot = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "attachment-manager-recovery-smoke-$PID-$([guid]::NewGuid().ToString('N'))")
  $sourceFolder = Join-Path $script:BuildRecoverySmokeFixtureRoot 'source'
  $outputFolder = Join-Path $script:BuildRecoverySmokeFixtureRoot 'exact-published-output'
  $secondOutputFolder = Join-Path $script:BuildRecoverySmokeFixtureRoot 'second-published-output'
  $timerExpiryOutputFolder = Join-Path $script:BuildRecoverySmokeFixtureRoot 'timer-expiry-output'
  [void](New-Item -ItemType Directory -Path $sourceFolder -Force)
  [void](New-Item -ItemType Directory -Path $outputFolder -Force)
  [void](New-Item -ItemType Directory -Path $secondOutputFolder -Force)
  [void](New-Item -ItemType Directory -Path $timerExpiryOutputFolder -Force)
  $receiptRecord = New-BuildRecoveryReceipt -SourcePath $sourceFolder -OutputPath $outputFolder -ResultFile (New-ReadOnlyResultPath) -ProgressFile (New-BuildProgressPath)
  $receiptRecord.data.managerPid = 0
  $receiptRecord.data.managerStartedAtUtc = ''
  $receiptRecord.data.workerPid = 0
  $receiptRecord.data.workerStartedAtUtc = ''
  $receiptRecord.data.state = 'pending-verification'
  $receiptRecord.data.expiresAtUtc = [DateTime]::UtcNow.AddHours(8).ToString('o')
  Write-BuildRecoveryReceipt -ReceiptPath $receiptRecord.path -Receipt $receiptRecord.data
  $secondReceiptRecord = New-BuildRecoveryReceipt -SourcePath $sourceFolder -OutputPath $secondOutputFolder -ResultFile (New-ReadOnlyResultPath) -ProgressFile (New-BuildProgressPath)
  $secondReceiptRecord.data.managerPid = 0
  $secondReceiptRecord.data.managerStartedAtUtc = ''
  $secondReceiptRecord.data.workerPid = 0
  $secondReceiptRecord.data.workerStartedAtUtc = ''
  $secondReceiptRecord.data.state = 'pending-verification'
  $secondReceiptRecord.data.expiresAtUtc = [DateTime]::UtcNow.AddHours(1).ToString('o')
  Write-BuildRecoveryReceipt -ReceiptPath $secondReceiptRecord.path -Receipt $secondReceiptRecord.data
  $timerExpiryReceipt = New-BuildRecoveryReceipt -SourcePath $sourceFolder -OutputPath $timerExpiryOutputFolder -ResultFile (New-ReadOnlyResultPath) -ProgressFile (New-BuildProgressPath)
  $timerExpiryReceipt.data.managerPid = 0
  $timerExpiryReceipt.data.managerStartedAtUtc = ''
  $timerExpiryReceipt.data.workerPid = 0
  $timerExpiryReceipt.data.workerStartedAtUtc = ''
  $timerExpiryReceipt.data.state = 'pending-verification'
  $timerExpiryReceipt.data.expiresAtUtc = [DateTime]::UtcNow.AddMinutes(10).ToString('o')
  Write-BuildRecoveryReceipt -ReceiptPath $timerExpiryReceipt.path -Receipt $timerExpiryReceipt.data
  $invalidReceipt = New-BuildRecoveryReceipt -SourcePath $sourceFolder -OutputPath $outputFolder -ResultFile (New-ReadOnlyResultPath) -ProgressFile (New-BuildProgressPath)
  $invalidReceipt.data.schemaVersion = 99
  $invalidReceipt.data.managerPid = 0
  $invalidReceipt.data.managerStartedAtUtc = ''
  Write-BuildRecoveryReceipt -ReceiptPath $invalidReceipt.path -Receipt $invalidReceipt.data
  $expiredReceipt = New-BuildRecoveryReceipt -SourcePath $sourceFolder -OutputPath $outputFolder -ResultFile (New-ReadOnlyResultPath) -ProgressFile (New-BuildProgressPath)
  $expiredReceipt.data.managerPid = 0
  $expiredReceipt.data.managerStartedAtUtc = ''
  $expiredReceipt.data.createdAtUtc = [DateTime]::UtcNow.AddHours(-25).ToString('o')
  $expiredReceipt.data.expiresAtUtc = [DateTime]::UtcNow.AddHours(-1).ToString('o')
  Write-BuildRecoveryReceipt -ReceiptPath $expiredReceipt.path -Receipt $expiredReceipt.data
  $activeReceipt = New-BuildRecoveryReceipt -SourcePath $sourceFolder -OutputPath $outputFolder -ResultFile (New-ReadOnlyResultPath) -ProgressFile (New-BuildProgressPath)
  $script:BuildRecoverySmokeState = [pscustomobject]@{
    receiptPath = $receiptRecord.path
    selectedReceiptPath = $secondReceiptRecord.path
    unselectedReceiptPath = $receiptRecord.path
    invalidReceiptPath = $invalidReceipt.path
    expiredReceiptPath = $expiredReceipt.path
    activeReceiptPath = $activeReceipt.path
    receiptPaths = @($receiptRecord.path, $secondReceiptRecord.path, $invalidReceipt.path, $expiredReceipt.path, $activeReceipt.path)
    cleanupReceiptPaths = @($receiptRecord.path, $secondReceiptRecord.path, $timerExpiryReceipt.path, $invalidReceipt.path, $expiredReceipt.path, $activeReceipt.path)
    timerExpiryReceiptPath = $timerExpiryReceipt.path
    timerExpiryOutputPath = $timerExpiryOutputFolder
    timerExpiryAtUtc = ([DateTime]$timerExpiryReceipt.data.expiresAtUtc).ToUniversalTime()
    outputPath = $secondOutputFolder
    restored = $false
    exactPathOffered = $false
    overviewVisible = $false
    initiallyUnselected = $false
    earliestExpiryFirst = $false
    urgentReceiptHighlighted = $false
    criticalReceiptHighlighted = $false
    normalReceiptUnhighlighted = $false
    shortcutHintVisible = $false
    folderPreviewRequested = $false
    exactPathCopyRequested = $false
    exactPathKeyboardCopyRequested = $false
    exactPathKeyboardEventHandled = $false
    unselectedKeyboardCopyBlocked = $false
    singleHandoffCopyOffered = $false
    singleHandoffExpiryVisible = $false
    singleHandoffExpiryTimerRunning = $false
    singleHandoffUrgentTierVisible = $false
    singleHandoffCriticalTierVisible = $false
    singleHandoffNormalTierVisible = $false
    singleHandoffShortcutHintVisible = $false
    singleHandoffPathCopyRequested = $false
    singleHandoffKeyboardCopyRequested = $false
    singleHandoffKeyboardEventHandled = $false
    singleHandoffUnfocusedKeyboardCopyBlocked = $false
    singleHandoffExpiryAutoDisabled = $false
    sameSessionHandoffHasNoFalseExpiry = $false
    multipleSelectorRestoredAfterSingleCopy = $false
    cancellationPreserved = $false
    verifyStarted = $false
  }
  $script:BuildRecoverySmokeTimer = New-Object System.Windows.Forms.Timer
  $script:BuildRecoverySmokeTimer.Interval = 200
  $script:BuildRecoverySmokeTimer.Add_Tick({
    if ($script:ReadOnlyProcess) { return }
    $state = $script:BuildRecoverySmokeState
    $receiptRemoved = $state -and -not (Test-Path -LiteralPath $state.selectedReceiptPath)
    $unselectedReceiptPreserved = $state -and (Test-Path -LiteralPath $state.unselectedReceiptPath)
    $invalidReceiptRejected = $state -and -not (Test-Path -LiteralPath $state.invalidReceiptPath)
    $expiredReceiptRemoved = $state -and -not (Test-Path -LiteralPath $state.expiredReceiptPath)
    $activeReceiptIgnored = $state -and (Test-Path -LiteralPath $state.activeReceiptPath)
    $script:BuildRecoverySmokeResult = [pscustomobject]@{
      status = if ($state.restored -and $state.exactPathOffered -and $state.overviewVisible -and $state.initiallyUnselected -and $state.earliestExpiryFirst -and $state.urgentReceiptHighlighted -and $state.criticalReceiptHighlighted -and $state.normalReceiptUnhighlighted -and $state.shortcutHintVisible -and $state.folderPreviewRequested -and $state.exactPathCopyRequested -and $state.exactPathKeyboardCopyRequested -and $state.exactPathKeyboardEventHandled -and $state.unselectedKeyboardCopyBlocked -and $state.singleHandoffCopyOffered -and $state.singleHandoffExpiryVisible -and $state.singleHandoffExpiryTimerRunning -and $state.singleHandoffUrgentTierVisible -and $state.singleHandoffCriticalTierVisible -and $state.singleHandoffNormalTierVisible -and $state.singleHandoffShortcutHintVisible -and $state.singleHandoffPathCopyRequested -and $state.singleHandoffKeyboardCopyRequested -and $state.singleHandoffKeyboardEventHandled -and $state.singleHandoffUnfocusedKeyboardCopyBlocked -and $state.singleHandoffExpiryAutoDisabled -and $state.sameSessionHandoffHasNoFalseExpiry -and $state.multipleSelectorRestoredAfterSingleCopy -and $state.cancellationPreserved -and $state.verifyStarted -and $receiptRemoved -and $unselectedReceiptPreserved -and $invalidReceiptRejected -and $expiredReceiptRemoved -and $activeReceiptIgnored -and -not $script:ActiveRecoveryReceiptPath -and -not $script:BuildProcess) { 'pass' } else { 'fail' }
      winFormsMessageLoop = $true
      restartReceiptRestored = [bool]$state.restored
      exactPathOffered = [bool]$state.exactPathOffered
      statusAndExpiryOverviewVisible = [bool]$state.overviewVisible
      pickerInitiallyUnselected = [bool]$state.initiallyUnselected
      earliestExpiryFirst = [bool]$state.earliestExpiryFirst
      urgentReceiptHighlighted = [bool]$state.urgentReceiptHighlighted
      criticalReceiptHighlighted = [bool]$state.criticalReceiptHighlighted
      normalReceiptUnhighlighted = [bool]$state.normalReceiptUnhighlighted
      shortcutHintVisible = [bool]$state.shortcutHintVisible
      folderPreviewRequestedWithoutExternalLaunch = [bool]$state.folderPreviewRequested
      exactPathCopyRequestedWithoutClipboardWrite = [bool]$state.exactPathCopyRequested
      exactPathKeyboardCopyRequested = [bool]$state.exactPathKeyboardCopyRequested
      exactPathKeyboardEventHandled = [bool]$state.exactPathKeyboardEventHandled
      unselectedKeyboardCopyBlocked = [bool]$state.unselectedKeyboardCopyBlocked
      singleHandoffCopyOffered = [bool]$state.singleHandoffCopyOffered
      singleHandoffExpiryVisible = [bool]$state.singleHandoffExpiryVisible
      singleHandoffExpiryTimerRunning = [bool]$state.singleHandoffExpiryTimerRunning
      singleHandoffUrgentTierVisible = [bool]$state.singleHandoffUrgentTierVisible
      singleHandoffCriticalTierVisible = [bool]$state.singleHandoffCriticalTierVisible
      singleHandoffNormalTierVisible = [bool]$state.singleHandoffNormalTierVisible
      singleHandoffShortcutHintVisible = [bool]$state.singleHandoffShortcutHintVisible
      singleHandoffPathCopyRequestedWithoutClipboardWrite = [bool]$state.singleHandoffPathCopyRequested
      singleHandoffKeyboardCopyRequested = [bool]$state.singleHandoffKeyboardCopyRequested
      singleHandoffKeyboardEventHandled = [bool]$state.singleHandoffKeyboardEventHandled
      singleHandoffUnfocusedKeyboardCopyBlocked = [bool]$state.singleHandoffUnfocusedKeyboardCopyBlocked
      singleHandoffExpiryAutoDisabled = [bool]$state.singleHandoffExpiryAutoDisabled
      sameSessionHandoffHasNoFalseExpiry = [bool]$state.sameSessionHandoffHasNoFalseExpiry
      multipleSelectorRestoredAfterSingleCopy = [bool]$state.multipleSelectorRestoredAfterSingleCopy
      pickerCancellationPreservedAll = [bool]$state.cancellationPreserved
      readOnlyVerifyStarted = [bool]$state.verifyStarted
      receiptRemovedAfterTrustedResult = [bool]$receiptRemoved
      unselectedReceiptPreserved = [bool]$unselectedReceiptPreserved
      invalidReceiptRejected = [bool]$invalidReceiptRejected
      expiredReceiptRemoved = [bool]$expiredReceiptRemoved
      activeReceiptIgnored = [bool]$activeReceiptIgnored
      buildProcessStarted = [bool]($null -ne $script:BuildProcess)
      built = $false
    }
    $script:BuildRecoverySmokeTimer.Stop()
    $script:MainForm.Close()
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
      $recoveryReceiptRemoved = -not (Test-Path -LiteralPath $state.recoveryReceiptPath)
      $extraDirectories = @(Get-ChildItem -LiteralPath $script:BuildSmokeFixtureRoot -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'source' })
      $uiRecovered = -not $script:SourcePath.ReadOnly -and $script:BtnCheck.Enabled -and $script:BtnVerify.Enabled -and $script:BtnBuild.Text -eq '2. 建立正式附件包'
      $buildGrantCleared = -not $script:BtnBuild.Enabled -and -not $script:LastReadyInput -and -not $script:LastReadyProjectNo
      $script:BuildSmokeResult = [pscustomobject]@{
        status = if ($state.uiTimerRanDuringBuild -and $state.closeBlocked -and $state.escapeBlocked -and $state.buildingActionVisible -and $state.phaseStatusSeen -and $state.elapsedStatusSeen -and $workerExited -and $resultFileRemoved -and $progressFileRemoved -and $recoveryReceiptRemoved -and $uiRecovered -and $buildGrantCleared -and $extraDirectories.Count -eq 0) { 'pass' } else { 'fail' }
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
        recoveryReceiptRemoved = [bool]$recoveryReceiptRemoved
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
  if ($SmokeBuildRecoveryReceipt) {
    $state = $script:BuildRecoverySmokeState
    $state.restored = [bool](Restore-BuildRecoveryReceipt -ReceiptPaths $state.receiptPaths)
    $state.exactPathOffered = [bool]($script:BtnBuildHandoffVerify.Visible -and $script:BtnBuildHandoffVerify.Enabled -and $script:BuildRecoveryCandidates.Count -eq 2 -and -not $script:BuildHandoffRecoveryOutput -and -not $script:HandoffRecoveryReceiptPath)
    if ($state.exactPathOffered) {
      Show-BuildResultHandoffUnknown -ErrorRecord ([System.InvalidOperationException]::new('單筆復原複製 smoke。')) -RequestedOutput $state.outputPath -RecoveryReceiptPath $state.selectedReceiptPath
      $state.singleHandoffCopyOffered = [bool]($script:BtnBuildHandoffCopy.Visible -and $script:BtnBuildHandoffCopy.Enabled -and $script:BuildHandoffRecoveryOutput -eq $state.outputPath -and $script:HandoffRecoveryReceiptPath -eq $state.selectedReceiptPath)
      $state.singleHandoffExpiryVisible = [bool]($script:StatusMeta.Text -like '短期收據有效至*' -and $script:StatusMeta.Text -like '*剩餘*' -and $script:StatusMeta.AccessibleDescription -like '*到期後複製與唯讀驗證會自動停用*')
      $state.singleHandoffExpiryTimerRunning = [bool]$script:HandoffRecoveryTimer.Enabled
      $state.singleHandoffUrgentTierVisible = [bool]($script:StatusMeta.Text -like '*2 小時內到期*' -and $script:StatusMeta.ForeColor.ToArgb() -eq [System.Drawing.Color]::FromArgb(146, 64, 14).ToArgb() -and $script:StatusMeta.AccessibleDescription -like '*2 小時內到期*')
      $state.singleHandoffShortcutHintVisible = [bool]($script:BtnBuildHandoffCopy.Text -like '*Ctrl+C*')
      if ($state.singleHandoffCopyOffered) {
        [void]$script:PackagePath.Focus()
        $unfocusedCopyEvent = New-Object System.Windows.Forms.KeyEventArgs(([System.Windows.Forms.Keys]::Control -bor [System.Windows.Forms.Keys]::C))
        Invoke-ManagerKeyDown -EventArgs $unfocusedCopyEvent
        $state.singleHandoffUnfocusedKeyboardCopyBlocked = [bool](-not $unfocusedCopyEvent.Handled -and -not $unfocusedCopyEvent.SuppressKeyPress -and -not $state.singleHandoffPathCopyRequested)
        [void]$script:BtnBuildHandoffCopy.Focus()
        $singleCopyEvent = New-Object System.Windows.Forms.KeyEventArgs(([System.Windows.Forms.Keys]::Control -bor [System.Windows.Forms.Keys]::C))
        Invoke-ManagerKeyDown -EventArgs $singleCopyEvent
        $state.singleHandoffKeyboardEventHandled = [bool]($singleCopyEvent.Handled -and $singleCopyEvent.SuppressKeyPress)
      }
      Show-BuildResultHandoffUnknown -ErrorRecord ([System.InvalidOperationException]::new('單筆復原到期 smoke。')) -RequestedOutput $state.timerExpiryOutputPath -RecoveryReceiptPath $state.timerExpiryReceiptPath
      $state.singleHandoffCriticalTierVisible = [bool]($script:StatusMeta.Text -like '*30 分鐘內到期*' -and $script:StatusMeta.ForeColor.ToArgb() -eq [System.Drawing.Color]::FromArgb(192, 57, 43).ToArgb() -and $script:StatusMeta.AccessibleDescription -like '*30 分鐘內到期*')
      [void](Update-SingleBuildHandoffExpiry -NowUtc $state.timerExpiryAtUtc.AddSeconds(1))
      $state.singleHandoffExpiryAutoDisabled = [bool](-not $script:BtnBuildHandoffCopy.Visible -and -not $script:BtnBuildHandoffCopy.Enabled -and -not $script:BtnBuildHandoffVerify.Visible -and -not $script:BtnBuildHandoffVerify.Enabled -and -not $script:HandoffRecoveryTimer.Enabled -and $script:StatusMeta.Text -like '*已到期*' -and -not (Test-Path -LiteralPath $state.timerExpiryReceiptPath))
      Show-BuildResultHandoffUnknown -ErrorRecord ([System.InvalidOperationException]::new('單筆復原一般期限 smoke。')) -RequestedOutput $outputFolder -RecoveryReceiptPath $state.unselectedReceiptPath
      $state.singleHandoffNormalTierVisible = [bool]($script:StatusMeta.Text -notmatch '2 小時內到期|30 分鐘內到期' -and $script:StatusMeta.ForeColor.ToArgb() -eq [System.Drawing.SystemColors]::ControlText.ToArgb() -and $script:StatusMeta.AccessibleDescription -like '*期限狀態一般*')
      Show-BuildResultHandoffUnknown -ErrorRecord ([System.InvalidOperationException]::new('同次交接無收據 smoke。')) -RequestedOutput $state.outputPath
      $state.sameSessionHandoffHasNoFalseExpiry = [bool]($script:BtnBuildHandoffCopy.Visible -and $script:BtnBuildHandoffVerify.Visible -and -not $script:HandoffRecoveryReceiptPath -and -not $script:HandoffRecoveryExpiresAtUtc -and -not $script:HandoffRecoveryTimer.Enabled -and $script:StatusMeta.Text -notmatch '有效至|剩餘|已到期')
      $state.multipleSelectorRestoredAfterSingleCopy = [bool](Restore-BuildRecoveryReceipt -ReceiptPaths $state.receiptPaths) -and $script:BuildRecoveryCandidates.Count -eq 2 -and $script:BtnBuildHandoffVerify.Visible -and $script:BtnBuildHandoffVerify.Enabled -and -not $script:BtnBuildHandoffCopy.Visible -and -not $script:BuildHandoffRecoveryOutput -and -not $script:HandoffRecoveryReceiptPath
      $cancelledCandidate = Select-BuildRecoveryReceipt -Candidates @($script:BuildRecoveryCandidates) -SmokeSelectIndex -2
      $state.cancellationPreserved = [bool](-not $cancelledCandidate -and (Test-Path -LiteralPath $state.selectedReceiptPath) -and (Test-Path -LiteralPath $state.unselectedReceiptPath) -and $script:BuildRecoveryCandidates.Count -eq 2)
      $script:BtnBuildHandoffVerify.PerformClick()
      $state.verifyStarted = [bool]($state.verifyStarted -or ($script:ReadOnlyProcess -and $script:ReadOnlyAction -eq 'verify' -and $script:ReadOnlyInput -eq $state.outputPath -and $script:ActiveRecoveryReceiptPath -eq $state.selectedReceiptPath))
    }
    $script:BuildRecoverySmokeTimer.Start()
    return
  }
  if ($SmokeBuildResponsiveness) {
    $sourceFolder = Join-Path $script:BuildSmokeFixtureRoot 'source'
    $script:SourcePath.Text = $sourceFolder
    $script:OutputPath.Text = Join-Path $script:BuildSmokeFixtureRoot 'planned-output-must-not-be-created'
    $script:LastReadyInput = $sourceFolder
    $script:LastReadyProjectNo = ''
    $script:BtnBuild.Enabled = $true
    $script:BtnBuild.PerformClick()
    if ($script:BuildProcess) {
      $script:BuildSmokeState = [pscustomobject]@{
        workerPid = $script:BuildProcess.Id
        resultFile = $script:BuildResultFile
        progressFile = $script:BuildProgressFile
        recoveryReceiptPath = $script:BuildRecoveryReceiptPath
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
  if ((-not $AutoInspect -or -not $InitialPath.Trim()) -and (Restore-BuildRecoveryReceipt)) { return }
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

if ($SmokeBuildRecoveryReceipt) {
  if (-not $script:BuildRecoverySmokeResult) {
    $script:BuildRecoverySmokeResult = [pscustomobject]@{ status = 'fail'; message = '建立復原收據 smoke 未產生結果。'; built = $false }
  }
  if ($script:BuildRecoverySmokeState) {
    foreach ($receiptPath in @($script:BuildRecoverySmokeState.cleanupReceiptPaths)) { Remove-BuildRecoveryReceipt -ReceiptPath $receiptPath -CleanupArtifacts }
  }
  if ($script:BuildRecoverySmokeFixtureRoot) {
    $resolvedFixture = [System.IO.Path]::GetFullPath($script:BuildRecoverySmokeFixtureRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolvedFixture.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedFixture).StartsWith('attachment-manager-recovery-smoke-')) {
      Remove-Item -LiteralPath $resolvedFixture -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  $script:BuildRecoverySmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:BuildRecoverySmokeResult.status -ne 'pass') { exit 3 }
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
