[CmdletBinding()]
param(
  [switch]$Smoke,
  [switch]$SmokeReadOnlyCancellation,
  [switch]$SmokeReadOnlyCompletion,
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

$dynamicSmokeCount = @(@($SmokeReadOnlyCancellation, $SmokeReadOnlyCompletion) | Where-Object { $_ }).Count
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

function Set-UiBusy {
  param([bool]$Busy)
  $script:MainForm.UseWaitCursor = $Busy
  $script:BtnCheck.Enabled = -not $Busy
  $script:BtnVerify.Enabled = -not $Busy
  $script:BtnBrowseSource.Enabled = -not $Busy
  $script:BtnBrowseSourceZip.Enabled = -not $Busy
  $script:BtnBrowseOutput.Enabled = -not $Busy
  $script:BtnBrowsePackage.Enabled = -not $Busy
  if ($Busy) { $script:BtnBuild.Enabled = $false }
  [System.Windows.Forms.Application]::DoEvents()
}

function Show-OperationError {
  param([System.Exception]$ErrorRecord)
  Set-StatusAppearance -Status 'error' -Title '附件包管理器執行失敗'
  $script:StatusMeta.Text = ''
  $script:DetailsBox.Text = $ErrorRecord.Message
  $script:BottomStatus.Text = '狀態：error'
}

function New-ReadOnlyResultPath {
  $name = "attachment-package-manager-result-$PID-$([guid]::NewGuid().ToString('N')).json"
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
  if ($SmokeReadOnlyCancellation -and $WorkerSmokeDelayMilliseconds -gt 0) {
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

$script:MainForm = New-Object System.Windows.Forms.Form
$script:MainForm.Text = '正式附件包管理器'
$script:MainForm.StartPosition = 'CenterScreen'
$script:MainForm.Size = New-Object System.Drawing.Size(1060, 850)
$script:MainForm.MinimumSize = New-Object System.Drawing.Size(980, 760)
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(244, 247, 250)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)

$header = New-Object System.Windows.Forms.Label
$header.Text = '正式附件包管理器'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 22, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(22, 16)
$header.AutoSize = $true
$script:MainForm.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '統一執行附件來源檢查、正式組包與事後驗證；管理畫面與檢查結果僅供內部整理，不會附入主報告。'
$subheader.Location = New-Object System.Drawing.Point(25, 62)
$subheader.Size = New-Object System.Drawing.Size(980, 30)
$subheader.TextAlign = 'MiddleLeft'
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:MainForm.Controls.Add($subheader)

$sourceGroup = New-Object System.Windows.Forms.GroupBox
$sourceGroup.Text = '一、檢查並建立正式附件包'
$sourceGroup.Location = New-Object System.Drawing.Point(22, 104)
$sourceGroup.Size = New-Object System.Drawing.Size(1000, 220)
$sourceGroup.Anchor = 'Top,Left,Right'
$script:MainForm.Controls.Add($sourceGroup)

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
$outputHint.Text = '可直接選 PDF＋證據來源 ZIP；輸出留白時會在原來源旁建立新資料夾，且不覆寫既有內容。'
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
$script:MainForm.Controls.Add($verifyGroup)

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
$script:MainForm.Controls.Add($script:StatusPanel)

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
$script:MainForm.Controls.Add($script:ResultGrid)

$script:DetailsBox = New-Object System.Windows.Forms.TextBox
$script:DetailsBox.Location = New-Object System.Drawing.Point(22, 692)
$script:DetailsBox.Size = New-Object System.Drawing.Size(1000, 90)
$script:DetailsBox.Anchor = 'Bottom,Left,Right'
$script:DetailsBox.Multiline = $true
$script:DetailsBox.ReadOnly = $true
$script:DetailsBox.ScrollBars = 'Vertical'
$script:DetailsBox.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 9)
$script:DetailsBox.Text = '檢查結果會顯示在這裡。只有 ready 狀態可建立正式附件包；review 與 blocked 不會建立輸出。'
$script:MainForm.Controls.Add($script:DetailsBox)

$statusStrip = New-Object System.Windows.Forms.StatusStrip
$script:BottomStatus = New-Object System.Windows.Forms.ToolStripStatusLabel
$script:BottomStatus.Text = '狀態：待命'
[void]$statusStrip.Items.Add($script:BottomStatus)
$script:MainForm.Controls.Add($statusStrip)

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
  Set-UiBusy $true
  try {
    $response = Invoke-AttachmentWorker -Action build -InputDirectory $script:SourcePath.Text -OutputDirectory $script:OutputPath.Text -ProjectNo $script:ProjectNo.Text
    Show-WorkerResponse $response
    $script:BtnBuild.Enabled = $false
    if ($response.built -and $response.outputDir) {
      $script:LastOutputDirectory = [string]$response.outputDir
      $script:PackagePath.Text = $script:LastOutputDirectory
      $script:BtnOpenOutput.Enabled = $true
    }
  } catch {
    Show-OperationError $_.Exception
  } finally {
    Set-UiBusy $false
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

$script:MainForm.Add_FormClosing({
  Stop-ReadOnlyOperation
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

$script:MainForm.Add_Shown({
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
