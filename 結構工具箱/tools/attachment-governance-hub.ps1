[CmdletBinding()]
param(
  [string]$InitialPath = '',
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$AdditionalPath = @(),
  [switch]$Smoke,
  [switch]$SmokeCancellation,
  [switch]$SmokeLifecycle,
  [switch]$SmokeTimeout,
  [switch]$SmokeFailure,
  [switch]$SmokeViewport,
  [ValidateRange(100, 5000)]
  [int]$AdvisorSmokeDelayMilliseconds = 2000,
  [ValidateRange(200, 5000)]
  [int]$AdvisorSmokeTimeoutMilliseconds = 600
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:StartupPaths = @()
if ($InitialPath) { $script:StartupPaths += $InitialPath }
$script:StartupPaths += @($AdditionalPath)
$advisorDynamicSmokeModeCount = 0
foreach ($mode in @($SmokeCancellation, $SmokeLifecycle, $SmokeTimeout, $SmokeFailure)) { if ($mode) { $advisorDynamicSmokeModeCount += 1 } }
$dynamicSmokeModeCount = $advisorDynamicSmokeModeCount + [int][bool]$SmokeViewport
if ($dynamicSmokeModeCount -gt 1) { throw '一次只能執行一種動態 smoke。' }
if ($advisorDynamicSmokeModeCount -eq 1 -and $script:StartupPaths.Count -ne 1) { throw 'advisor 動態 smoke 必須帶入單一 InitialPath。' }
if ($SmokeViewport -and $script:StartupPaths.Count -ne 0) { throw '小視窗 smoke 不接受 InitialPath。' }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:ToolDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:WorkerPath = Join-Path $script:ToolDirectory 'attachment-governance-hub-worker.js'
$script:Advice = $null
$script:AdvicePath = ''
$script:ToolButtons = @{}
$script:AdvisorProcess = $null
$script:AdvisorPath = ''
$script:AdvisorStartedAt = $null
$script:AdvisorTimer = $null
$script:BtnAdvise = $null
$script:CancellationSmokeTimer = $null
$script:CancellationSmokeResult = $null
$script:LifecycleSmokeTimer = $null
$script:LifecycleSmokeState = $null
$script:LifecycleFormClosingObserved = $false
$script:TimeoutSmokeWorkerPid = 0
$script:TimeoutRecoveryWorkerPid = 0
$script:TimeoutSmokeDelayInjected = $false
$script:TimeoutSmokeState = $null
$script:TimeoutSmokeResult = $null
$script:TimeoutRetryTimer = $null
$script:FailureSmokeWorkerPid = 0
$script:FailureRecoveryWorkerPid = 0
$script:FailureSmokeErrorInjected = $false
$script:FailureSmokeState = $null
$script:FailureSmokeResult = $null
$script:FailureRetryTimer = $null
$script:ViewportSmokeTimer = $null
$script:ViewportSmokeResult = $null
$script:ScrollPanel = $null
$script:ContentCanvas = $null
$script:ToolTargets = @(
  [pscustomobject]@{
    Id = 'manager'
    Name = '正式附件包管理器'
    Launcher = '啟動正式附件包管理器.bat'
    Script = 'attachment-package-manager.ps1'
    Action = '開啟組包管理器'
    Badge = '可新建產物'
    Title = '我要整理新案或重產後的正式附件'
    Description = '選擇已核可的計算書與追溯來源，先檢查一致性；只有 ready 才能另建 v3 正式附件包，並可再做事後驗證。'
    Boundary = '權限邊界：檢查與驗證唯讀；只有你在管理器內明確執行「建立」時才會新建資料夾。'
    Color = [System.Drawing.Color]::FromArgb(239, 246, 255)
    Accent = [System.Drawing.Color]::FromArgb(37, 99, 235)
  },
  [pscustomobject]@{
    Id = 'viewer'
    Name = '案件附件治理檢視器'
    Launcher = '啟動案件附件治理檢視器.bat'
    Script = 'attachment-case-governance-viewer.ps1'
    Action = '開啟唯讀檢視器'
    Badge = '永遠唯讀'
    Title = '我要知道單一案件或多案件目前卡在哪裡'
    Description = '查看附件包、版本鏈、待處理收據與 P0／P1／P2 優先順序；篩選只改變畫面，不改變案件狀態或治理指紋。'
    Boundary = '權限邊界：不建立、不修改、不核可、不輸出案件資料；ready 只表示可進入內部歸檔複核。'
    Color = [System.Drawing.Color]::FromArgb(236, 253, 245)
    Accent = [System.Drawing.Color]::FromArgb(5, 150, 105)
  },
  [pscustomobject]@{
    Id = 'upgrade'
    Name = '舊版附件升級助手'
    Launcher = '啟動舊版附件升級助手.bat'
    Script = 'attachment-package-upgrade-assistant.ps1'
    Action = '開啟升級助手'
    Badge = '另建升級產物'
    Title = '我有 v1／v2 舊版正式附件包要更新'
    Description = '先唯讀辨識階段；完整舊包可另建安全工作區，完成度 ready 的工作區可另建 v3 包，舊包不覆寫。'
    Boundary = '權限邊界：執行前需再次確認；舊核可不沿用，升級結果本身也不代表正式核可。'
    Color = [System.Drawing.Color]::FromArgb(255, 251, 235)
    Accent = [System.Drawing.Color]::FromArgb(217, 119, 6)
  }
)

function Get-TargetStatus {
  param($Target)
  $launcherPath = Join-Path $script:ToolDirectory $Target.Launcher
  $scriptPath = Join-Path $script:ToolDirectory $Target.Script
  return [pscustomobject]@{
    id = $Target.Id
    name = $Target.Name
    launcher = $Target.Launcher
    launcherPath = $launcherPath
    scriptPath = $scriptPath
    available = [bool]((Test-Path -LiteralPath $launcherPath -PathType Leaf) -and (Test-Path -LiteralPath $scriptPath -PathType Leaf))
  }
}

if ($Smoke) {
  $entries = @($script:ToolTargets | ForEach-Object { Get-TargetStatus $_ })
  $available = @($entries | Where-Object { $_.available }).Count
  [pscustomobject]@{
    status = if ($available -eq $entries.Count -and (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) { 'ready' } else { 'blocked' }
    windowsFormsLoaded = $true
    readOnlyHub = $true
    advisorAvailable = [bool](Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)
    available = $available
    total = $entries.Count
    entries = $entries
    message = "案件附件工作台入口檢查：$available/$($entries.Count) 可用"
  } | ConvertTo-Json -Depth 4 -Compress
  if ($available -ne $entries.Count -or -not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) { exit 3 }
  exit 0
}

function Get-NodePath {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { $command = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $command) { throw '找不到 Node.js；無法執行唯讀路徑辨識。' }
  return $command.Source
}

function Set-AdvisorButtonIdle {
  if ($script:BtnAdvise) {
    $script:BtnAdvise.Text = '唯讀辨識建議'
    $script:BtnAdvise.Enabled = $true
  }
}

function Stop-PathAdvisor {
  if ($script:AdvisorTimer) { $script:AdvisorTimer.Stop() }
  $process = $script:AdvisorProcess
  $script:AdvisorProcess = $null
  $script:AdvisorPath = ''
  $script:AdvisorStartedAt = $null
  Set-AdvisorButtonIdle
  if (-not $process) { return }
  try {
    if (-not $process.HasExited) {
      $process.Kill()
      [void]$process.WaitForExit(2000)
    }
  } catch {
    # 唯讀 advisor 結束或競態關閉時不覆蓋主要工作台狀態。
  } finally {
    $process.Dispose()
  }
}

function Start-PathAdvisor {
  param([string]$InputPath)
  $inputPath = [string]$InputPath
  if (-not $inputPath) { throw '請先選擇或輸入共用起始資料夾。' }
  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) { throw "找不到唯讀辨識核心：$script:WorkerPath" }
  Stop-PathAdvisor
  $injectFailure = $SmokeFailure -and -not $script:FailureSmokeErrorInjected
  $injectTimeoutDelay = $SmokeTimeout -and -not $script:TimeoutSmokeDelayInjected
  $smokeDelayMilliseconds = if ($SmokeTimeout -and -not $injectTimeoutDelay) { 0 } elseif ($dynamicSmokeModeCount -eq 1) { $AdvisorSmokeDelayMilliseconds } else { 0 }
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = Get-NodePath
  $startInfo.Arguments = "`"$script:WorkerPath`" --action advise --input `"$inputPath`""
  if ($smokeDelayMilliseconds -gt 0) { $startInfo.Arguments += " --smoke-delay-ms $smokeDelayMilliseconds" }
  if ($injectFailure) { $startInfo.Arguments += ' --smoke-error' }
  $startInfo.WorkingDirectory = $script:ToolDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $startInfo.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $script:AdvisorProcess = $process
  if ($injectTimeoutDelay) {
    $script:TimeoutSmokeWorkerPid = $process.Id
    $script:TimeoutSmokeDelayInjected = $true
  } elseif ($SmokeTimeout) {
    $script:TimeoutRecoveryWorkerPid = $process.Id
  }
  if ($injectFailure) {
    $script:FailureSmokeWorkerPid = $process.Id
    $script:FailureSmokeErrorInjected = $true
  } elseif ($SmokeFailure) {
    $script:FailureRecoveryWorkerPid = $process.Id
  }
  $script:AdvisorPath = $inputPath
  $script:AdvisorStartedAt = Get-Date
  $script:BtnAdvise.Text = '停止辨識'
  $script:AdvisorTimer.Start()
}

function Set-RecommendationResult {
  param($Response, [string]$InputPath)
  if ($script:SharedPath.Text.Trim() -ne $InputPath) { return }
  $script:Advice = $Response
  $script:AdvicePath = $InputPath
  if ($Response.outcome -ne 'matched') {
    $script:RecommendationText.Text = "$($Response.title)：$($Response.reason)"
    $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(161, 98, 7)
    $script:BottomStatus.Text = '唯讀辨識完成：沒有足夠訊號，請手動選擇；未開啟或執行任何工具。'
    return
  }
  $script:RecommendationText.Text = "$($Response.title)｜$($Response.reason)"
  $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
  $button = $script:ToolButtons[[string]$Response.recommendedTool]
  if ($button) {
    $button.Text = '建議｜開啟並唯讀檢查'
    $button.UseVisualStyleBackColor = $false
    $button.BackColor = [System.Drawing.Color]::FromArgb(220, 252, 231)
  }
  $script:BottomStatus.Text = '唯讀辨識完成：只提供建議，尚未開啟、檢查、建立、升級或核可。'
}

function Complete-PathAdvisor {
  $process = $script:AdvisorProcess
  if (-not $process -or -not $process.HasExited) { return }
  $inputPath = $script:AdvisorPath
  $script:AdvisorTimer.Stop()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $process.Dispose()
  $script:AdvisorProcess = $null
  $script:AdvisorPath = ''
  $script:AdvisorStartedAt = $null
  Set-AdvisorButtonIdle
  if ($script:SharedPath.Text.Trim() -ne $inputPath) { return }
  if (-not $stdout.Trim()) { throw "唯讀辨識沒有回傳結果。$stderr" }
  $response = $stdout.Trim() | ConvertFrom-Json
  if ($exitCode -eq 3 -or $response.outcome -eq 'error') { throw [string]$response.message }
  Set-RecommendationResult -Response $response -InputPath $inputPath
}

function Finish-FailureSmokeRecovery {
  $script:FailureRetryTimer.Stop()
  $recoveryWorkerExited = $script:FailureRecoveryWorkerPid -gt 0 -and -not (Get-Process -Id $script:FailureRecoveryWorkerPid -ErrorAction SilentlyContinue)
  $recoveryCompleted = $null -ne $script:Advice -and $script:AdvicePath -eq $script:SharedPath.Text.Trim()
  $recoveryMessageShown = $script:RecommendationText.Text -notlike '唯讀辨識未完成*' -and $script:BottomStatus.Text -like '唯讀辨識完成*'
  $windowStayedOpenAfterRecovery = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
  $script:FailureSmokeResult = [pscustomobject]@{
    status = if ($script:FailureSmokeState.phasePass -and $script:FailureSmokeState.retryPerformClick -and $script:FailureRecoveryWorkerPid -gt 0 -and $script:FailureRecoveryWorkerPid -ne $script:FailureSmokeWorkerPid -and $recoveryWorkerExited -and $recoveryCompleted -and -not $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '唯讀辨識建議' -and $recoveryMessageShown -and $windowStayedOpenAfterRecovery) { 'pass' } else { 'fail' }
    winFormsMessageLoop = $true
    failureObserved = [bool]$script:FailureSmokeState.failureObserved
    firstWorkerPid = $script:FailureSmokeWorkerPid
    firstWorkerExited = [bool]$script:FailureSmokeState.firstWorkerExited
    failureMessageShown = [bool]$script:FailureSmokeState.failureMessageShown
    retryActionVisible = [bool]$script:FailureSmokeState.retryActionVisible
    retryPerformClick = [bool]$script:FailureSmokeState.retryPerformClick
    recoveryWorkerPid = $script:FailureRecoveryWorkerPid
    recoveryWorkerExited = $recoveryWorkerExited
    recoveryCompleted = $recoveryCompleted
    advisorCleared = [bool](-not $script:AdvisorProcess)
    idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
    recoveryMessageShown = $recoveryMessageShown
    windowStayedOpenOnFailure = [bool]$script:FailureSmokeState.windowStayedOpenOnFailure
    windowStayedOpenAfterRecovery = $windowStayedOpenAfterRecovery
    changedState = $false
    autoLaunched = $false
  }
  $script:MainForm.Close()
}

function Finish-TimeoutSmokeRecovery {
  $script:TimeoutRetryTimer.Stop()
  $recoveryWorkerExited = $script:TimeoutRecoveryWorkerPid -gt 0 -and -not (Get-Process -Id $script:TimeoutRecoveryWorkerPid -ErrorAction SilentlyContinue)
  $recoveryCompleted = $null -ne $script:Advice -and $script:AdvicePath -eq $script:SharedPath.Text.Trim()
  $recoveryMessageShown = $script:RecommendationText.Text -notlike '唯讀辨識未完成*' -and $script:BottomStatus.Text -like '唯讀辨識完成*'
  $windowStayedOpenAfterRecovery = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
  $script:TimeoutSmokeResult = [pscustomobject]@{
    status = if ($script:TimeoutSmokeState.phasePass -and $script:TimeoutSmokeState.retryPerformClick -and $script:TimeoutRecoveryWorkerPid -gt 0 -and $script:TimeoutRecoveryWorkerPid -ne $script:TimeoutSmokeWorkerPid -and $recoveryWorkerExited -and $recoveryCompleted -and -not $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '唯讀辨識建議' -and $recoveryMessageShown -and $windowStayedOpenAfterRecovery) { 'pass' } else { 'fail' }
    winFormsMessageLoop = $true
    timeoutObserved = [bool]$script:TimeoutSmokeState.timeoutObserved
    firstWorkerPid = $script:TimeoutSmokeWorkerPid
    firstWorkerExited = [bool]$script:TimeoutSmokeState.firstWorkerExited
    timeoutMessageShown = [bool]$script:TimeoutSmokeState.timeoutMessageShown
    retryActionVisible = [bool]$script:TimeoutSmokeState.retryActionVisible
    retryPerformClick = [bool]$script:TimeoutSmokeState.retryPerformClick
    recoveryWorkerPid = $script:TimeoutRecoveryWorkerPid
    recoveryWorkerExited = $recoveryWorkerExited
    recoveryCompleted = $recoveryCompleted
    advisorCleared = [bool](-not $script:AdvisorProcess)
    idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
    recoveryMessageShown = $recoveryMessageShown
    windowStayedOpenOnTimeout = [bool]$script:TimeoutSmokeState.windowStayedOpenOnTimeout
    windowStayedOpenAfterRecovery = $windowStayedOpenAfterRecovery
    changedState = $false
    autoLaunched = $false
  }
  $script:MainForm.Close()
}

function Reset-ToolRecommendationButtons {
  foreach ($target in $script:ToolTargets) {
    $button = $script:ToolButtons[$target.Id]
    if ($button) {
      $button.Text = $target.Action
      $button.UseVisualStyleBackColor = $true
    }
  }
}

function Set-AdvisorFailureState {
  param([string]$Message)
  $script:Advice = $null
  $script:AdvicePath = ''
  Reset-ToolRecommendationButtons
  $script:BtnAdvise.Text = '重新辨識'
  $script:RecommendationText.Text = "唯讀辨識未完成：$Message"
  $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
  $script:BottomStatus.Text = '唯讀辨識失敗：未開啟工具、未改變案件狀態；可調整路徑後重試。'
}

function Reset-Recommendation {
  Stop-PathAdvisor
  $script:Advice = $null
  $script:AdvicePath = ''
  if ($script:RecommendationText) {
    $script:RecommendationText.Text = '選擇或拖入單一資料夾後會自動辨識；手動輸入路徑時可按右側按鈕。'
    $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
  }
  Reset-ToolRecommendationButtons
}

function Cancel-PathAdvisor {
  if (-not $script:AdvisorProcess) { return }
  Stop-PathAdvisor
  $script:Advice = $null
  $script:AdvicePath = ''
  Reset-ToolRecommendationButtons
  $script:RecommendationText.Text = '已停止唯讀辨識；可調整路徑後重新辨識，或依工作目的手動選擇。'
  $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(161, 98, 7)
  $script:BottomStatus.Text = '已停止唯讀辨識：未開啟工具、未改變案件狀態。'
}

function Show-Recommendation {
  Reset-Recommendation
  $inputPath = $script:SharedPath.Text.Trim()
  $script:RecommendationText.Text = '正在執行唯讀辨識；畫面可繼續操作，可按「停止辨識」取消，變更路徑也會取消本次辨識。'
  $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(29, 78, 216)
  $script:BottomStatus.Text = '唯讀辨識進行中：不開啟工具、不改變案件狀態。'
  Start-PathAdvisor -InputPath $inputPath
}

function Start-GovernedTool {
  param($Target)
  Stop-PathAdvisor
  $status = Get-TargetStatus $Target
  if (-not $status.available) {
    throw "找不到 $($Target.Name) 的受治理入口。"
  }
  $arguments = "-NoProfile -ExecutionPolicy Bypass -STA -File `"$($status.scriptPath)`""
  $initialPath = $script:SharedPath.Text.Trim()
  if ($initialPath) { $arguments += " -InitialPath `"$initialPath`"" }
  $autoInspect = $false
  if ($initialPath -and $script:Advice -and $script:AdvicePath -eq $initialPath -and $script:Advice.recommendedTool -eq $Target.Id) {
    $mode = [string]$script:Advice.recommendedMode
    if ($Target.Id -eq 'manager' -and @('source', 'verify') -contains $mode) { $arguments += " -InitialMode $mode" }
    if ($Target.Id -eq 'viewer' -and @('case', 'portfolio') -contains $mode) { $arguments += " -InitialMode $mode" }
    $arguments += ' -AutoInspect'
    $autoInspect = $true
  }
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = 'powershell.exe'
  $startInfo.Arguments = $arguments
  $startInfo.WorkingDirectory = $script:ToolDirectory
  $startInfo.UseShellExecute = $true
  [void][System.Diagnostics.Process]::Start($startInfo)
  $handoff = if ($autoInspect) { '已帶入建議模式並執行唯讀檢查。' } elseif ($initialPath) { '已帶入共用起始資料夾，尚未執行檢查。' } else { '未指定起始資料夾。' }
  $script:BottomStatus.Text = "已開啟：$($Target.Name)；$handoff"
}

function Set-SharedPathAndRecommend {
  param([string]$SelectedPath)
  $candidate = [string]$SelectedPath
  if (-not $candidate.Trim() -or -not (Test-Path -LiteralPath $candidate.Trim() -PathType Container)) {
    throw '只接受單一現有資料夾；檔案或多重路徑不會帶入工作台。'
  }
  $resolvedPath = (Resolve-Path -LiteralPath $candidate.Trim()).ProviderPath
  $script:SharedPath.Text = $resolvedPath
  $script:BottomStatus.Text = '已帶入資料夾，正在執行唯讀辨識建議…'
  Show-Recommendation
}

function Select-SharedFolder {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = '選擇共同起始資料夾；選取後會立即執行唯讀辨識建議'
  $dialog.ShowNewFolderButton = $false
  if ($script:SharedPath.Text.Trim() -and (Test-Path -LiteralPath $script:SharedPath.Text.Trim() -PathType Container)) {
    $dialog.SelectedPath = $script:SharedPath.Text.Trim()
  }
  try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      Set-SharedPathAndRecommend -SelectedPath $dialog.SelectedPath
    }
  } finally {
    $dialog.Dispose()
  }
}

function Show-LaunchError {
  param([System.Exception]$ErrorRecord, [switch]$PreserveStatus)
  if (-not $PreserveStatus) { $script:BottomStatus.Text = "啟動失敗：$($ErrorRecord.Message)" }
  [System.Windows.Forms.MessageBox]::Show(
    $script:MainForm,
    $ErrorRecord.Message,
    '案件附件工作台',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Add-ToolCard {
  param($Target, [int]$Top, [string]$Number)

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point(22, $Top)
  $panel.Size = New-Object System.Drawing.Size(1056, 142)
  $panel.Anchor = 'Top,Left,Right'
  $panel.BackColor = $Target.Color
  $panel.BorderStyle = 'FixedSingle'
  $script:ContentCanvas.Controls.Add($panel)

  $accent = New-Object System.Windows.Forms.Panel
  $accent.Location = New-Object System.Drawing.Point(0, 0)
  $accent.Size = New-Object System.Drawing.Size(9, 142)
  $accent.BackColor = $Target.Accent
  $panel.Controls.Add($accent)

  $step = New-Object System.Windows.Forms.Label
  $step.Text = $Number
  $step.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 17, [System.Drawing.FontStyle]::Bold)
  $step.ForeColor = $Target.Accent
  $step.Location = New-Object System.Drawing.Point(25, 18)
  $step.Size = New-Object System.Drawing.Size(45, 38)
  $panel.Controls.Add($step)

  $title = New-Object System.Windows.Forms.Label
  $title.Text = $Target.Title
  $title.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 12, [System.Drawing.FontStyle]::Bold)
  $title.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
  $title.Location = New-Object System.Drawing.Point(75, 14)
  $title.Size = New-Object System.Drawing.Size(565, 30)
  $panel.Controls.Add($title)

  $badge = New-Object System.Windows.Forms.Label
  $badge.Text = $Target.Badge
  $badge.TextAlign = 'MiddleCenter'
  $badge.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 9, [System.Drawing.FontStyle]::Bold)
  $badge.ForeColor = $Target.Accent
  $badge.Location = New-Object System.Drawing.Point(650, 14)
  $badge.Size = New-Object System.Drawing.Size(130, 28)
  $panel.Controls.Add($badge)

  $description = New-Object System.Windows.Forms.Label
  $description.Text = $Target.Description
  $description.Location = New-Object System.Drawing.Point(76, 49)
  $description.Size = New-Object System.Drawing.Size(700, 38)
  $description.ForeColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
  $panel.Controls.Add($description)

  $boundary = New-Object System.Windows.Forms.Label
  $boundary.Text = $Target.Boundary
  $boundary.Location = New-Object System.Drawing.Point(76, 94)
  $boundary.Size = New-Object System.Drawing.Size(700, 34)
  $boundary.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
  $panel.Controls.Add($boundary)

  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Target.Action
  $button.Location = New-Object System.Drawing.Point(820, 49)
  $button.Size = New-Object System.Drawing.Size(205, 46)
  $button.Anchor = 'Top,Right'
  $button.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10, [System.Drawing.FontStyle]::Bold)
  $button.Tag = $Target
  $button.Add_Click({
    try { Start-GovernedTool -Target $this.Tag }
    catch { Show-LaunchError -ErrorRecord $_.Exception }
  })
  $panel.Controls.Add($button)
  $script:ToolButtons[$Target.Id] = $button

  $availability = Get-TargetStatus $Target
  if (-not $availability.available) {
    $button.Enabled = $false
    $button.Text = '啟動器缺失'
  }
}

$script:MainForm = New-Object System.Windows.Forms.Form
$script:MainForm.Text = '案件附件工作台'
$script:MainForm.StartPosition = 'CenterScreen'
$workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$defaultHeight = [Math]::Min(890, [Math]::Max(640, $workingArea.Height - 40))
$script:MainForm.MinimumSize = New-Object System.Drawing.Size(1120, 640)
$script:MainForm.Size = New-Object System.Drawing.Size(1120, $defaultHeight)
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)

$script:ScrollPanel = New-Object System.Windows.Forms.Panel
$script:ScrollPanel.Dock = 'Fill'
$script:ScrollPanel.AutoScroll = $true
$script:ScrollPanel.BackColor = $script:MainForm.BackColor
$script:MainForm.Controls.Add($script:ScrollPanel)
$script:MainForm.PerformLayout()
$script:ScrollPanel.AutoScrollMinSize = New-Object System.Drawing.Size(1090, 800)
$script:ScrollPanel.AutoScrollMargin = New-Object System.Drawing.Size(16, 16)

$script:ContentCanvas = New-Object System.Windows.Forms.Panel
$script:ContentCanvas.Location = New-Object System.Drawing.Point(0, 0)
$script:ContentCanvas.Size = New-Object System.Drawing.Size(1090, 800)
$script:ContentCanvas.BackColor = $script:MainForm.BackColor
$script:ScrollPanel.Controls.Add($script:ContentCanvas)

$header = New-Object System.Windows.Forms.Label
$header.Text = '案件附件工作台'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 21, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(24, 18)
$header.Size = New-Object System.Drawing.Size(1040, 45)
$script:ContentCanvas.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '選擇或拖入一個資料夾後會自動提出唯讀建議；建議不會自動開啟工具、不改判狀態，也不代替正式核可。'
$subheader.Location = New-Object System.Drawing.Point(26, 66)
$subheader.Size = New-Object System.Drawing.Size(1040, 28)
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:ContentCanvas.Controls.Add($subheader)

$pathPanel = New-Object System.Windows.Forms.Panel
$pathPanel.Location = New-Object System.Drawing.Point(22, 101)
$pathPanel.Size = New-Object System.Drawing.Size(1056, 100)
$pathPanel.Anchor = 'Top,Left,Right'
$pathPanel.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$pathPanel.BorderStyle = 'FixedSingle'
$pathPanel.AllowDrop = $true
$script:ContentCanvas.Controls.Add($pathPanel)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = '共用起始資料夾（可拖放）'
$pathLabel.Location = New-Object System.Drawing.Point(16, 18)
$pathLabel.Size = New-Object System.Drawing.Size(200, 26)
$pathPanel.Controls.Add($pathLabel)

$script:SharedPath = New-Object System.Windows.Forms.TextBox
$script:SharedPath.Location = New-Object System.Drawing.Point(215, 14)
$script:SharedPath.Size = New-Object System.Drawing.Size(550, 30)
$script:SharedPath.Anchor = 'Top,Left,Right'
$script:SharedPath.AllowDrop = $true
$pathPanel.Controls.Add($script:SharedPath)

$browseShared = New-Object System.Windows.Forms.Button
$browseShared.Text = '選擇並辨識…'
$browseShared.Location = New-Object System.Drawing.Point(780, 12)
$browseShared.Size = New-Object System.Drawing.Size(120, 34)
$browseShared.Anchor = 'Top,Right'
$browseShared.Add_Click({
  try { Select-SharedFolder }
  catch { Show-LaunchError -ErrorRecord $_.Exception }
})
$pathPanel.Controls.Add($browseShared)

$script:BtnAdvise = New-Object System.Windows.Forms.Button
$script:BtnAdvise.Text = '唯讀辨識建議'
$script:BtnAdvise.Location = New-Object System.Drawing.Point(915, 12)
$script:BtnAdvise.Size = New-Object System.Drawing.Size(120, 34)
$script:BtnAdvise.Anchor = 'Top,Right'
$script:BtnAdvise.Add_Click({
  try {
    if ($script:AdvisorProcess) {
      Cancel-PathAdvisor
      return
    }
    Show-Recommendation
  }
  catch { Show-LaunchError -ErrorRecord $_.Exception }
})
$pathPanel.Controls.Add($script:BtnAdvise)

$script:RecommendationText = New-Object System.Windows.Forms.Label
$script:RecommendationText.Text = '選擇或拖入單一資料夾後會自動辨識；手動輸入路徑時可按右側按鈕。'
$script:RecommendationText.Location = New-Object System.Drawing.Point(215, 56)
$script:RecommendationText.Size = New-Object System.Drawing.Size(820, 42)
$script:RecommendationText.Anchor = 'Top,Left,Right'
$script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$pathPanel.Controls.Add($script:RecommendationText)

$folderDragEnter = {
  $paths = @($_.Data.GetData([System.Windows.Forms.DataFormats]::FileDrop))
  if ($paths.Count -eq 1 -and (Test-Path -LiteralPath ([string]$paths[0]) -PathType Container)) {
    $_.Effect = [System.Windows.Forms.DragDropEffects]::Copy
  } else {
    $_.Effect = [System.Windows.Forms.DragDropEffects]::None
  }
}
$folderDragDrop = {
  try {
    $paths = @($_.Data.GetData([System.Windows.Forms.DataFormats]::FileDrop))
    if ($paths.Count -ne 1) { throw '一次只能拖入一個資料夾。' }
    Set-SharedPathAndRecommend -SelectedPath ([string]$paths[0])
  } catch {
    Show-LaunchError -ErrorRecord $_.Exception
  }
}
$pathPanel.Add_DragEnter($folderDragEnter)
$pathPanel.Add_DragDrop($folderDragDrop)
$script:SharedPath.Add_DragEnter($folderDragEnter)
$script:SharedPath.Add_DragDrop($folderDragDrop)

$guide = New-Object System.Windows.Forms.Panel
$guide.Location = New-Object System.Drawing.Point(22, 211)
$guide.Size = New-Object System.Drawing.Size(1056, 48)
$guide.Anchor = 'Top,Left,Right'
$guide.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
$script:ContentCanvas.Controls.Add($guide)

$guideText = New-Object System.Windows.Forms.Label
$guideText.Text = '選擇原則：新案組包 → 管理器　｜　只想查狀態 → 唯讀檢視器　｜　v1／v2 舊包 → 升級助手'
$guideText.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 11, [System.Drawing.FontStyle]::Bold)
$guideText.Location = New-Object System.Drawing.Point(20, 11)
$guideText.Size = New-Object System.Drawing.Size(1015, 28)
$guide.Controls.Add($guideText)

Add-ToolCard -Target $script:ToolTargets[0] -Top 272 -Number '01'
Add-ToolCard -Target $script:ToolTargets[1] -Top 422 -Number '02'
Add-ToolCard -Target $script:ToolTargets[2] -Top 572 -Number '03'

$script:SharedPath.Add_TextChanged({ Reset-Recommendation })

$notice = New-Object System.Windows.Forms.Label
$notice.Text = '重要：工程結果、附件完整性、治理 ready 與「正式附件核可」是不同層次；只有計算書內明確核可才是正式附件。'
$notice.Location = New-Object System.Drawing.Point(26, 726)
$notice.Size = New-Object System.Drawing.Size(1040, 34)
$notice.ForeColor = [System.Drawing.Color]::FromArgb(127, 29, 29)
$notice.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10, [System.Drawing.FontStyle]::Bold)
$script:ContentCanvas.Controls.Add($notice)

$availableCount = @($script:ToolTargets | Where-Object { (Get-TargetStatus $_).available }).Count
$script:BottomStatus = New-Object System.Windows.Forms.StatusStrip
$statusLabel = New-Object System.Windows.Forms.ToolStripStatusLabel
$statusLabel.Text = "工作台待命：$availableCount/$($script:ToolTargets.Count) 個治理工具可用"
$statusLabel.Spring = $true
$statusLabel.TextAlign = 'MiddleLeft'
[void]$script:BottomStatus.Items.Add($statusLabel)
$script:BottomStatus.SizingGrip = $false
$script:MainForm.Controls.Add($script:BottomStatus)
$script:BottomStatus.BringToFront()
$script:BottomStatus = $statusLabel

$script:AdvisorTimer = New-Object System.Windows.Forms.Timer
$script:AdvisorTimer.Interval = 150
$script:AdvisorTimer.Add_Tick({
  try {
    if (-not $script:AdvisorProcess) {
      $script:AdvisorTimer.Stop()
      return
    }
    $timeoutSeconds = if ($SmokeTimeout) { $AdvisorSmokeTimeoutMilliseconds / 1000.0 } else { 60 }
    if ($script:AdvisorStartedAt -and ((Get-Date) - $script:AdvisorStartedAt).TotalSeconds -ge $timeoutSeconds) {
      if ($SmokeTimeout -and $script:AdvisorProcess) { $script:TimeoutSmokeWorkerPid = $script:AdvisorProcess.Id }
      Stop-PathAdvisor
      if ($SmokeTimeout) { throw '唯讀辨識測試逾時，已停止背景程序。' }
      throw '唯讀辨識超過 60 秒，已停止；請改選較小的案件或附件資料夾。'
    }
    Complete-PathAdvisor
    if ($SmokeFailure -and $script:FailureSmokeState -and -not $script:FailureSmokeResult -and -not $script:AdvisorProcess) {
      Finish-FailureSmokeRecovery
    }
  } catch {
    Stop-PathAdvisor
    if ($SmokeTimeout) {
      $errorMessage = $_.Exception.Message
      Set-AdvisorFailureState -Message $errorMessage
      $script:BottomStatus.Text = "唯讀辨識逾時：$errorMessage；未開啟工具、未改變案件狀態，可直接重新辨識。"
      $workerExited = $script:TimeoutSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:TimeoutSmokeWorkerPid -ErrorAction SilentlyContinue)
      $script:TimeoutSmokeState = [pscustomobject]@{
        phasePass = [bool]($errorMessage -like '唯讀辨識測試逾時*' -and $workerExited -and -not $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '重新辨識' -and $script:RecommendationText.Text -like '唯讀辨識未完成*')
        timeoutObserved = [bool]($errorMessage -like '唯讀辨識測試逾時*')
        firstWorkerExited = $workerExited
        timeoutMessageShown = [bool]($script:RecommendationText.Text -like '唯讀辨識未完成*逾時*' -and $script:BottomStatus.Text -like '唯讀辨識逾時*')
        retryActionVisible = [bool]($script:BtnAdvise.Text -eq '重新辨識')
        retryPerformClick = $false
        windowStayedOpenOnTimeout = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
      }
      $script:TimeoutRetryTimer.Start()
    } elseif ($SmokeFailure) {
      $errorMessage = $_.Exception.Message
      Set-AdvisorFailureState -Message $errorMessage
      $workerExited = $script:FailureSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:FailureSmokeWorkerPid -ErrorAction SilentlyContinue)
      $script:FailureSmokeState = [pscustomobject]@{
        phasePass = [bool]($errorMessage -like '附件路徑唯讀建議測試錯誤*' -and $workerExited -and -not $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '重新辨識' -and $script:RecommendationText.Text -like '唯讀辨識未完成*')
        failureObserved = [bool]($errorMessage -like '附件路徑唯讀建議測試錯誤*')
        firstWorkerExited = $workerExited
        failureMessageShown = [bool]($script:RecommendationText.Text -like '唯讀辨識未完成*' -and $script:BottomStatus.Text -like '唯讀辨識失敗*')
        retryActionVisible = [bool]($script:BtnAdvise.Text -eq '重新辨識')
        retryPerformClick = $false
        windowStayedOpenOnFailure = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
      }
      $script:FailureRetryTimer.Start()
    } else {
      Set-AdvisorFailureState -Message $_.Exception.Message
      Show-LaunchError -ErrorRecord $_.Exception -PreserveStatus
    }
  }
})
$script:MainForm.Add_FormClosing({
  if ($SmokeLifecycle) { $script:LifecycleFormClosingObserved = $true }
  Stop-PathAdvisor
})

if ($dynamicSmokeModeCount -eq 1) {
  $script:MainForm.Opacity = 0
  $script:MainForm.ShowInTaskbar = $false
}

if ($SmokeViewport) {
  $script:MainForm.Size = New-Object System.Drawing.Size(1120, 640)
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AttachmentHubNativeScroll {
  public const int WM_VSCROLL = 0x115;
  public const int SB_BOTTOM = 7;
  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, int message, IntPtr wParam, IntPtr lParam);
}
'@
  $script:ViewportSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:ViewportSmokeTimer.Interval = 150
  $script:ViewportSmokeTimer.Add_Tick({
    $script:ViewportSmokeTimer.Stop()
    try {
      $initialFormHeight = $script:MainForm.Height
      $script:MainForm.PerformLayout()
      $script:ScrollPanel.PerformLayout()
      $script:MainForm.Update()
      $scrollVisible = [bool]$script:ScrollPanel.VerticalScroll.Visible
      $scrollBefore = $script:ScrollPanel.VerticalScroll.Value
      $scrollTarget = [Math]::Max(0, $script:ScrollPanel.VerticalScroll.Maximum - $script:ScrollPanel.VerticalScroll.LargeChange + 1)
      [void][AttachmentHubNativeScroll]::SendMessage($script:ScrollPanel.Handle, [AttachmentHubNativeScroll]::WM_VSCROLL, [IntPtr][AttachmentHubNativeScroll]::SB_BOTTOM, [IntPtr]::Zero)
      $script:MainForm.Update()
      $scrollAfter = $script:ScrollPanel.VerticalScroll.Value
      $clientRectangle = $script:ScrollPanel.RectangleToScreen($script:ScrollPanel.ClientRectangle)
      $noticeRectangle = $notice.RectangleToScreen($notice.ClientRectangle)
      $noticeReachable = $noticeRectangle.Top -ge $clientRectangle.Top -and $noticeRectangle.Bottom -le $clientRectangle.Bottom
      $script:ViewportSmokeResult = [pscustomobject]@{
        status = if ($script:ScrollPanel.AutoScroll -and $script:MainForm.MinimumSize.Height -le 640 -and $initialFormHeight -le $workingArea.Height -and $scrollVisible -and $scrollAfter -gt $scrollBefore -and $noticeReachable) { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        autoScrollEnabled = [bool]$script:ScrollPanel.AutoScroll
        minimumHeight = $script:MainForm.MinimumSize.Height
        workingAreaHeight = $workingArea.Height
        initialFormHeight = $initialFormHeight
        smallClientHeight = $script:ScrollPanel.ClientSize.Height
        autoScrollMinHeight = $script:ScrollPanel.AutoScrollMinSize.Height
        displayRectangleHeight = $script:ScrollPanel.DisplayRectangle.Height
        displayRectangleY = $script:ScrollPanel.DisplayRectangle.Y
        verticalScrollVisible = $scrollVisible
        scrollMaximum = $script:ScrollPanel.VerticalScroll.Maximum
        scrollLargeChange = $script:ScrollPanel.VerticalScroll.LargeChange
        scrollTarget = $scrollTarget
        scrollBefore = $scrollBefore
        scrollAfter = $scrollAfter
        clientTop = $clientRectangle.Top
        clientBottom = $clientRectangle.Bottom
        noticeTop = $noticeRectangle.Top
        noticeBottom = $noticeRectangle.Bottom
        bottomNoticeReachable = $noticeReachable
        windowStayedOpen = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
        changedState = $false
        autoLaunched = $false
      }
    } catch {
      $script:ViewportSmokeResult = [pscustomobject]@{
        status = 'fail'
        winFormsMessageLoop = $true
        autoScrollEnabled = [bool]$script:ScrollPanel.AutoScroll
        changedState = $false
        autoLaunched = $false
        message = $_.Exception.Message
      }
    } finally {
      $script:MainForm.Close()
    }
  })
}

if ($SmokeTimeout) {
  $script:TimeoutRetryTimer = New-Object System.Windows.Forms.Timer
  $script:TimeoutRetryTimer.Interval = 50
  $script:TimeoutRetryTimer.Add_Tick({
    try {
      if (-not $script:TimeoutSmokeState.retryPerformClick) {
        $script:BtnAdvise.PerformClick()
        $script:TimeoutSmokeState.retryPerformClick = [bool]($script:TimeoutRecoveryWorkerPid -gt 0 -and $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '停止辨識')
        if (-not $script:TimeoutSmokeState.retryPerformClick) { throw '逾時後重新辨識按鈕未啟動第二個背景程序。' }
        $script:AdvisorTimer.Stop()
        $script:TimeoutRetryTimer.Interval = 150
        return
      }
      if (-not $script:AdvisorProcess -or -not $script:AdvisorProcess.HasExited) { return }
      Complete-PathAdvisor
      Finish-TimeoutSmokeRecovery
    } catch {
      $script:TimeoutRetryTimer.Stop()
      Stop-PathAdvisor
      $script:TimeoutSmokeResult = [pscustomobject]@{
        status = 'fail'
        winFormsMessageLoop = $true
        timeoutObserved = [bool]($script:TimeoutSmokeState -and $script:TimeoutSmokeState.timeoutObserved)
        firstWorkerPid = $script:TimeoutSmokeWorkerPid
        firstWorkerExited = [bool]($script:TimeoutSmokeState -and $script:TimeoutSmokeState.firstWorkerExited)
        timeoutMessageShown = [bool]($script:TimeoutSmokeState -and $script:TimeoutSmokeState.timeoutMessageShown)
        retryActionVisible = [bool]($script:TimeoutSmokeState -and $script:TimeoutSmokeState.retryActionVisible)
        retryPerformClick = $false
        recoveryWorkerPid = $script:TimeoutRecoveryWorkerPid
        recoveryWorkerExited = $false
        recoveryCompleted = $false
        advisorCleared = [bool](-not $script:AdvisorProcess)
        idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
        recoveryMessageShown = $false
        windowStayedOpenOnTimeout = [bool]($script:TimeoutSmokeState -and $script:TimeoutSmokeState.windowStayedOpenOnTimeout)
        windowStayedOpenAfterRecovery = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
        changedState = $false
        autoLaunched = $false
        message = $_.Exception.Message
      }
      $script:MainForm.Close()
    }
  })
}

if ($SmokeFailure) {
  $script:FailureRetryTimer = New-Object System.Windows.Forms.Timer
  $script:FailureRetryTimer.Interval = 50
  $script:FailureRetryTimer.Add_Tick({
    try {
      if (-not $script:FailureSmokeState.retryPerformClick) {
        $script:BtnAdvise.PerformClick()
        $script:FailureSmokeState.retryPerformClick = [bool]($script:FailureRecoveryWorkerPid -gt 0 -and $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '停止辨識')
        if (-not $script:FailureSmokeState.retryPerformClick) { throw '重新辨識按鈕未啟動第二個背景程序。' }
        $script:AdvisorTimer.Stop()
        $script:FailureRetryTimer.Interval = 150
        return
      }
      if (-not $script:AdvisorProcess -or -not $script:AdvisorProcess.HasExited) { return }
      Complete-PathAdvisor
      Finish-FailureSmokeRecovery
    } catch {
      $script:FailureRetryTimer.Stop()
      Stop-PathAdvisor
      $script:FailureSmokeResult = [pscustomobject]@{
        status = 'fail'
        winFormsMessageLoop = $true
        failureObserved = [bool]($script:FailureSmokeState -and $script:FailureSmokeState.failureObserved)
        firstWorkerPid = $script:FailureSmokeWorkerPid
        firstWorkerExited = [bool]($script:FailureSmokeState -and $script:FailureSmokeState.firstWorkerExited)
        failureMessageShown = [bool]($script:FailureSmokeState -and $script:FailureSmokeState.failureMessageShown)
        retryActionVisible = [bool]($script:FailureSmokeState -and $script:FailureSmokeState.retryActionVisible)
        retryPerformClick = $false
        recoveryWorkerPid = $script:FailureRecoveryWorkerPid
        recoveryWorkerExited = $false
        recoveryCompleted = $false
        advisorCleared = [bool](-not $script:AdvisorProcess)
        idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
        recoveryMessageShown = $false
        windowStayedOpenOnFailure = [bool]($script:FailureSmokeState -and $script:FailureSmokeState.windowStayedOpenOnFailure)
        windowStayedOpenAfterRecovery = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
        changedState = $false
        autoLaunched = $false
        message = $_.Exception.Message
      }
      $script:MainForm.Close()
    }
  })
}

if ($SmokeCancellation) {
  $script:CancellationSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:CancellationSmokeTimer.Interval = 250
  $script:CancellationSmokeTimer.Add_Tick({
    $script:CancellationSmokeTimer.Stop()
    try {
      $advisorPid = if ($script:AdvisorProcess) { $script:AdvisorProcess.Id } else { 0 }
      $runningActionVisible = $script:BtnAdvise.Text -eq '停止辨識'
      $windowVisibleBeforeCancel = [bool]$script:MainForm.Visible
      $script:BtnAdvise.PerformClick()
      $workerExited = $advisorPid -gt 0 -and -not (Get-Process -Id $advisorPid -ErrorAction SilentlyContinue)
      $script:CancellationSmokeResult = [pscustomobject]@{
        status = if ($runningActionVisible -and $windowVisibleBeforeCancel -and $workerExited -and -not $script:AdvisorProcess -and $script:BtnAdvise.Text -eq '唯讀辨識建議' -and $script:RecommendationText.Text -like '已停止唯讀辨識*') { 'pass' } else { 'fail' }
        winFormsMessageLoop = $true
        performClick = $true
        runningActionVisible = $runningActionVisible
        windowStayedOpen = [bool]($windowVisibleBeforeCancel -and $script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
        workerPid = $advisorPid
        workerExited = $workerExited
        advisorCleared = [bool](-not $script:AdvisorProcess)
        idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
        cancellationMessageShown = [bool]($script:RecommendationText.Text -like '已停止唯讀辨識*')
        changedState = $false
        autoLaunched = $false
      }
    } catch {
      $script:CancellationSmokeResult = [pscustomobject]@{
        status = 'fail'
        winFormsMessageLoop = $true
        performClick = $false
        message = $_.Exception.Message
        changedState = $false
        autoLaunched = $false
      }
    } finally {
      $script:MainForm.Close()
    }
  })
}

if ($SmokeLifecycle) {
  $script:LifecycleSmokeTimer = New-Object System.Windows.Forms.Timer
  $script:LifecycleSmokeTimer.Interval = 250
  $script:LifecycleSmokeTimer.Add_Tick({
    $script:LifecycleSmokeTimer.Stop()
    try {
      $firstPid = if ($script:AdvisorProcess) { $script:AdvisorProcess.Id } else { 0 }
      $firstRunning = $firstPid -gt 0 -and $script:BtnAdvise.Text -eq '停止辨識'
      $secondPath = Split-Path -Parent $script:ToolDirectory
      Set-SharedPathAndRecommend -SelectedPath $secondPath
      $firstExited = $firstPid -gt 0 -and -not (Get-Process -Id $firstPid -ErrorAction SilentlyContinue)
      $secondPid = if ($script:AdvisorProcess) { $script:AdvisorProcess.Id } else { 0 }
      $script:LifecycleSmokeState = [pscustomobject]@{
        phasePass = [bool]($firstRunning -and $firstExited -and $secondPid -gt 0 -and $secondPid -ne $firstPid -and $script:AdvisorPath -eq $secondPath)
        firstWorkerPid = $firstPid
        pathChangeStoppedWorker = $firstExited
        secondWorkerPid = $secondPid
        replacementWorkerRunning = [bool]($secondPid -gt 0 -and $script:BtnAdvise.Text -eq '停止辨識')
        pathChanged = [bool]($script:SharedPath.Text -eq $secondPath -and $script:AdvisorPath -eq $secondPath)
        windowStayedOpenAfterPathChange = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
      }
    } catch {
      $script:LifecycleSmokeState = [pscustomobject]@{
        phasePass = $false
        message = $_.Exception.Message
        firstWorkerPid = 0
        pathChangeStoppedWorker = $false
        secondWorkerPid = 0
        replacementWorkerRunning = $false
        pathChanged = $false
        windowStayedOpenAfterPathChange = $false
      }
    } finally {
      $script:MainForm.Close()
    }
  })
}

$script:StartupPathsHandled = $false
$script:MainForm.Add_Shown({
  if ($script:StartupPathsHandled) { return }
  $script:StartupPathsHandled = $true
  if ($SmokeViewport) {
    $script:ViewportSmokeTimer.Start()
    return
  }
  if ($script:StartupPaths.Count -eq 0) { return }
  try {
    if ($script:StartupPaths.Count -ne 1) { throw '啟動時一次只能帶入一個資料夾。' }
    Set-SharedPathAndRecommend -SelectedPath ([string]$script:StartupPaths[0])
    if ($SmokeCancellation) { $script:CancellationSmokeTimer.Start() }
    if ($SmokeLifecycle) { $script:LifecycleSmokeTimer.Start() }
  } catch {
    if ($dynamicSmokeModeCount -eq 1) {
      if ($SmokeLifecycle) {
        $script:LifecycleSmokeState = [pscustomobject]@{
          phasePass = $false
          message = $_.Exception.Message
          firstWorkerPid = 0
          pathChangeStoppedWorker = $false
          secondWorkerPid = 0
          replacementWorkerRunning = $false
          pathChanged = $false
          windowStayedOpenAfterPathChange = $false
        }
      }
      if ($SmokeTimeout) {
        $script:TimeoutSmokeResult = [pscustomobject]@{
          status = 'fail'
          winFormsMessageLoop = $true
          timeoutObserved = $false
          firstWorkerPid = $script:TimeoutSmokeWorkerPid
          firstWorkerExited = [bool]($script:TimeoutSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:TimeoutSmokeWorkerPid -ErrorAction SilentlyContinue))
          timeoutMessageShown = $false
          retryActionVisible = $false
          retryPerformClick = $false
          recoveryWorkerPid = $script:TimeoutRecoveryWorkerPid
          recoveryWorkerExited = $false
          recoveryCompleted = $false
          advisorCleared = [bool](-not $script:AdvisorProcess)
          idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
          recoveryMessageShown = $false
          windowStayedOpenOnTimeout = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
          windowStayedOpenAfterRecovery = $false
          changedState = $false
          autoLaunched = $false
          message = $_.Exception.Message
        }
      }
      if ($SmokeFailure) {
        $script:FailureSmokeResult = [pscustomobject]@{
          status = 'fail'
          winFormsMessageLoop = $true
          failureObserved = $false
          firstWorkerPid = $script:FailureSmokeWorkerPid
          firstWorkerExited = [bool]($script:FailureSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:FailureSmokeWorkerPid -ErrorAction SilentlyContinue))
          failureMessageShown = $false
          retryActionVisible = $false
          retryPerformClick = $false
          recoveryWorkerPid = $script:FailureRecoveryWorkerPid
          recoveryWorkerExited = $false
          recoveryCompleted = $false
          advisorCleared = [bool](-not $script:AdvisorProcess)
          idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
          recoveryMessageShown = $false
          windowStayedOpenOnFailure = [bool]($script:MainForm.Visible -and -not $script:MainForm.IsDisposed)
          windowStayedOpenAfterRecovery = $false
          changedState = $false
          autoLaunched = $false
          message = $_.Exception.Message
        }
      }
      $script:CancellationSmokeResult = [pscustomobject]@{
        status = 'fail'
        winFormsMessageLoop = $true
        performClick = $false
        message = $_.Exception.Message
        changedState = $false
        autoLaunched = $false
      }
      $script:MainForm.Close()
    } else {
      Show-LaunchError -ErrorRecord $_.Exception
    }
  }
})

[void]$script:MainForm.ShowDialog()
if ($SmokeViewport) {
  if (-not $script:ViewportSmokeResult) {
    $script:ViewportSmokeResult = [pscustomobject]@{
      status = 'fail'
      winFormsMessageLoop = $true
      autoScrollEnabled = [bool]$script:ScrollPanel.AutoScroll
      changedState = $false
      autoLaunched = $false
      message = '小視窗煙霧測試未產生結果。'
    }
  }
  $script:ViewportSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:ViewportSmokeResult.status -ne 'pass') { exit 3 }
}
if ($SmokeCancellation) {
  if (-not $script:CancellationSmokeResult) {
    $script:CancellationSmokeResult = [pscustomobject]@{
      status = 'fail'
      winFormsMessageLoop = $true
      performClick = $false
      message = '取消煙霧測試未產生結果。'
      changedState = $false
      autoLaunched = $false
    }
  }
  $script:CancellationSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:CancellationSmokeResult.status -ne 'pass') { exit 3 }
}
if ($SmokeLifecycle) {
  $state = $script:LifecycleSmokeState
  $secondPid = if ($state -and $state.PSObject.Properties.Name -contains 'secondWorkerPid') { [int]$state.secondWorkerPid } else { 0 }
  $secondExited = $secondPid -gt 0 -and -not (Get-Process -Id $secondPid -ErrorAction SilentlyContinue)
  $payload = [pscustomobject]@{
    status = if ($state -and $state.phasePass -and $script:LifecycleFormClosingObserved -and $secondExited -and -not $script:AdvisorProcess) { 'pass' } else { 'fail' }
    winFormsMessageLoop = $true
    pathChangeStoppedWorker = [bool]($state -and $state.pathChangeStoppedWorker)
    replacementWorkerRunning = [bool]($state -and $state.replacementWorkerRunning)
    pathChanged = [bool]($state -and $state.pathChanged)
    windowStayedOpenAfterPathChange = [bool]($state -and $state.windowStayedOpenAfterPathChange)
    formClosingObserved = $script:LifecycleFormClosingObserved
    formClosingStoppedWorker = $secondExited
    advisorCleared = [bool](-not $script:AdvisorProcess)
    changedState = $false
    autoLaunched = $false
    message = if ($state -and $state.PSObject.Properties.Name -contains 'message') { [string]$state.message } else { '' }
  }
  $payload | ConvertTo-Json -Depth 4 -Compress
  if ($payload.status -ne 'pass') { exit 3 }
}
if ($SmokeTimeout) {
  if (-not $script:TimeoutSmokeResult) {
    $script:TimeoutSmokeResult = [pscustomobject]@{
      status = 'fail'
      winFormsMessageLoop = $true
      timeoutObserved = $false
      firstWorkerPid = $script:TimeoutSmokeWorkerPid
      firstWorkerExited = [bool]($script:TimeoutSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:TimeoutSmokeWorkerPid -ErrorAction SilentlyContinue))
      timeoutMessageShown = $false
      retryActionVisible = $false
      retryPerformClick = $false
      recoveryWorkerPid = $script:TimeoutRecoveryWorkerPid
      recoveryWorkerExited = [bool]($script:TimeoutRecoveryWorkerPid -gt 0 -and -not (Get-Process -Id $script:TimeoutRecoveryWorkerPid -ErrorAction SilentlyContinue))
      recoveryCompleted = $false
      advisorCleared = [bool](-not $script:AdvisorProcess)
      idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
      recoveryMessageShown = $false
      windowStayedOpenOnTimeout = $false
      windowStayedOpenAfterRecovery = $false
      changedState = $false
      autoLaunched = $false
      message = '逾時煙霧測試未產生結果。'
    }
  }
  $script:TimeoutSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:TimeoutSmokeResult.status -ne 'pass') { exit 3 }
}
if ($SmokeFailure) {
  if (-not $script:FailureSmokeResult) {
    $script:FailureSmokeResult = [pscustomobject]@{
      status = 'fail'
      winFormsMessageLoop = $true
      failureObserved = $false
      firstWorkerPid = $script:FailureSmokeWorkerPid
      firstWorkerExited = [bool]($script:FailureSmokeWorkerPid -gt 0 -and -not (Get-Process -Id $script:FailureSmokeWorkerPid -ErrorAction SilentlyContinue))
      failureMessageShown = $false
      retryActionVisible = $false
      retryPerformClick = $false
      recoveryWorkerPid = $script:FailureRecoveryWorkerPid
      recoveryWorkerExited = [bool]($script:FailureRecoveryWorkerPid -gt 0 -and -not (Get-Process -Id $script:FailureRecoveryWorkerPid -ErrorAction SilentlyContinue))
      recoveryCompleted = $false
      advisorCleared = [bool](-not $script:AdvisorProcess)
      idleActionRestored = [bool]($script:BtnAdvise.Text -eq '唯讀辨識建議')
      recoveryMessageShown = $false
      windowStayedOpenOnFailure = $false
      windowStayedOpenAfterRecovery = $false
      changedState = $false
      autoLaunched = $false
      message = '失敗煙霧測試未產生結果。'
    }
  }
  $script:FailureSmokeResult | ConvertTo-Json -Depth 4 -Compress
  if ($script:FailureSmokeResult.status -ne 'pass') { exit 3 }
}
