[CmdletBinding()]
param(
  [string]$InitialPath = '',
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$AdditionalPath = @(),
  [switch]$Smoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:StartupPaths = @()
if ($InitialPath) { $script:StartupPaths += $InitialPath }
$script:StartupPaths += @($AdditionalPath)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:ToolDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:WorkerPath = Join-Path $script:ToolDirectory 'attachment-governance-hub-worker.js'
$script:Advice = $null
$script:AdvicePath = ''
$script:ToolButtons = @{}
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

function Invoke-PathAdvisor {
  $inputPath = $script:SharedPath.Text.Trim()
  if (-not $inputPath) { throw '請先選擇或輸入共用起始資料夾。' }
  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) { throw "找不到唯讀辨識核心：$script:WorkerPath" }
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = Get-NodePath
  $startInfo.Arguments = "`"$script:WorkerPath`" --action advise --input `"$inputPath`""
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
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $process.Dispose()
  if (-not $stdout.Trim()) { throw "唯讀辨識沒有回傳結果。$stderr" }
  $response = $stdout.Trim() | ConvertFrom-Json
  if ($exitCode -eq 3 -or $response.outcome -eq 'error') { throw [string]$response.message }
  return $response
}

function Reset-Recommendation {
  $script:Advice = $null
  $script:AdvicePath = ''
  if ($script:RecommendationText) {
    $script:RecommendationText.Text = '選擇或拖入單一資料夾後會自動辨識；手動輸入路徑時可按右側按鈕。'
    $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
  }
  foreach ($target in $script:ToolTargets) {
    $button = $script:ToolButtons[$target.Id]
    if ($button) {
      $button.Text = $target.Action
      $button.UseVisualStyleBackColor = $true
    }
  }
}

function Show-Recommendation {
  Reset-Recommendation
  $response = Invoke-PathAdvisor
  $script:Advice = $response
  $script:AdvicePath = $script:SharedPath.Text.Trim()
  if ($response.outcome -ne 'matched') {
    $script:RecommendationText.Text = "$($response.title)：$($response.reason)"
    $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(161, 98, 7)
    $script:BottomStatus.Text = '唯讀辨識完成：沒有足夠訊號，請手動選擇；未開啟或執行任何工具。'
    return
  }
  $script:RecommendationText.Text = "$($response.title)｜$($response.reason)"
  $script:RecommendationText.ForeColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
  $button = $script:ToolButtons[[string]$response.recommendedTool]
  if ($button) {
    $button.Text = '建議｜開啟並唯讀檢查'
    $button.UseVisualStyleBackColor = $false
    $button.BackColor = [System.Drawing.Color]::FromArgb(220, 252, 231)
  }
  $script:BottomStatus.Text = '唯讀辨識完成：只提供建議，尚未開啟、檢查、建立、升級或核可。'
}

function Start-GovernedTool {
  param($Target)
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
  $script:SharedPath.Text = $candidate.Trim()
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
  param([System.Exception]$ErrorRecord)
  $script:BottomStatus.Text = "啟動失敗：$($ErrorRecord.Message)"
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
  $script:MainForm.Controls.Add($panel)

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
$script:MainForm.MinimumSize = New-Object System.Drawing.Size(1120, 890)
$script:MainForm.Size = New-Object System.Drawing.Size(1120, 890)
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)

$header = New-Object System.Windows.Forms.Label
$header.Text = '案件附件工作台'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 21, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(24, 18)
$header.Size = New-Object System.Drawing.Size(1040, 45)
$script:MainForm.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '選擇或拖入一個資料夾後會自動提出唯讀建議；建議不會自動開啟工具、不改判狀態，也不代替正式核可。'
$subheader.Location = New-Object System.Drawing.Point(26, 66)
$subheader.Size = New-Object System.Drawing.Size(1040, 28)
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:MainForm.Controls.Add($subheader)

$pathPanel = New-Object System.Windows.Forms.Panel
$pathPanel.Location = New-Object System.Drawing.Point(22, 101)
$pathPanel.Size = New-Object System.Drawing.Size(1056, 100)
$pathPanel.Anchor = 'Top,Left,Right'
$pathPanel.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$pathPanel.BorderStyle = 'FixedSingle'
$pathPanel.AllowDrop = $true
$script:MainForm.Controls.Add($pathPanel)

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
  try { Show-Recommendation }
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
$script:MainForm.Controls.Add($guide)

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
$script:MainForm.Controls.Add($notice)

$availableCount = @($script:ToolTargets | Where-Object { (Get-TargetStatus $_).available }).Count
$script:BottomStatus = New-Object System.Windows.Forms.StatusStrip
$statusLabel = New-Object System.Windows.Forms.ToolStripStatusLabel
$statusLabel.Text = "工作台待命：$availableCount/$($script:ToolTargets.Count) 個治理工具可用"
$statusLabel.Spring = $true
$statusLabel.TextAlign = 'MiddleLeft'
[void]$script:BottomStatus.Items.Add($statusLabel)
$script:BottomStatus.SizingGrip = $false
$script:MainForm.Controls.Add($script:BottomStatus)
$script:BottomStatus = $statusLabel

$script:StartupPathsHandled = $false
$script:MainForm.Add_Shown({
  if ($script:StartupPathsHandled) { return }
  $script:StartupPathsHandled = $true
  if ($script:StartupPaths.Count -eq 0) { return }
  try {
    if ($script:StartupPaths.Count -ne 1) { throw '啟動時一次只能帶入一個資料夾。' }
    Set-SharedPathAndRecommend -SelectedPath ([string]$script:StartupPaths[0])
  } catch {
    Show-LaunchError -ErrorRecord $_.Exception
  }
})

[void]$script:MainForm.ShowDialog()
