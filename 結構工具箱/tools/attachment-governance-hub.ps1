[CmdletBinding()]
param(
  [switch]$Smoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:ToolDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
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
    status = if ($available -eq $entries.Count) { 'ready' } else { 'blocked' }
    windowsFormsLoaded = $true
    readOnlyHub = $true
    available = $available
    total = $entries.Count
    entries = $entries
    message = "案件附件工作台入口檢查：$available/$($entries.Count) 可用"
  } | ConvertTo-Json -Depth 4 -Compress
  if ($available -ne $entries.Count) { exit 3 }
  exit 0
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
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = 'powershell.exe'
  $startInfo.Arguments = $arguments
  $startInfo.WorkingDirectory = $script:ToolDirectory
  $startInfo.UseShellExecute = $true
  [void][System.Diagnostics.Process]::Start($startInfo)
  $handoff = if ($initialPath) { '已帶入共用起始資料夾，尚未自動檢查。' } else { '未指定起始資料夾。' }
  $script:BottomStatus.Text = "已開啟：$($Target.Name)；$handoff"
}

function Select-SharedFolder {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = '選擇要帶入附件工具的共同起始資料夾'
  $dialog.ShowNewFolderButton = $false
  if ($script:SharedPath.Text.Trim() -and (Test-Path -LiteralPath $script:SharedPath.Text.Trim() -PathType Container)) {
    $dialog.SelectedPath = $script:SharedPath.Text.Trim()
  }
  try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $script:SharedPath.Text = $dialog.SelectedPath
      $script:BottomStatus.Text = '已選擇共用起始資料夾；開啟工具後仍須由你執行該工具的檢查。'
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

  $availability = Get-TargetStatus $Target
  if (-not $availability.available) {
    $button.Enabled = $false
    $button.Text = '啟動器缺失'
  }
}

$script:MainForm = New-Object System.Windows.Forms.Form
$script:MainForm.Text = '案件附件工作台'
$script:MainForm.StartPosition = 'CenterScreen'
$script:MainForm.MinimumSize = New-Object System.Drawing.Size(1120, 820)
$script:MainForm.Size = New-Object System.Drawing.Size(1120, 820)
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)

$header = New-Object System.Windows.Forms.Label
$header.Text = '案件附件工作台'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 21, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(24, 18)
$header.Size = New-Object System.Drawing.Size(1040, 45)
$script:MainForm.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '先依目的選擇工具；工作台只負責安全分流，不讀取案件、不改判狀態，也不代替正式核可。'
$subheader.Location = New-Object System.Drawing.Point(26, 66)
$subheader.Size = New-Object System.Drawing.Size(1040, 28)
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:MainForm.Controls.Add($subheader)

$pathPanel = New-Object System.Windows.Forms.Panel
$pathPanel.Location = New-Object System.Drawing.Point(22, 101)
$pathPanel.Size = New-Object System.Drawing.Size(1056, 60)
$pathPanel.Anchor = 'Top,Left,Right'
$pathPanel.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$pathPanel.BorderStyle = 'FixedSingle'
$script:MainForm.Controls.Add($pathPanel)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = '共用起始資料夾（選填）'
$pathLabel.Location = New-Object System.Drawing.Point(16, 18)
$pathLabel.Size = New-Object System.Drawing.Size(180, 26)
$pathPanel.Controls.Add($pathLabel)

$script:SharedPath = New-Object System.Windows.Forms.TextBox
$script:SharedPath.Location = New-Object System.Drawing.Point(200, 14)
$script:SharedPath.Size = New-Object System.Drawing.Size(700, 30)
$script:SharedPath.Anchor = 'Top,Left,Right'
$pathPanel.Controls.Add($script:SharedPath)

$browseShared = New-Object System.Windows.Forms.Button
$browseShared.Text = '選擇一次…'
$browseShared.Location = New-Object System.Drawing.Point(915, 12)
$browseShared.Size = New-Object System.Drawing.Size(120, 34)
$browseShared.Anchor = 'Top,Right'
$browseShared.Add_Click({ Select-SharedFolder })
$pathPanel.Controls.Add($browseShared)

$guide = New-Object System.Windows.Forms.Panel
$guide.Location = New-Object System.Drawing.Point(22, 171)
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

Add-ToolCard -Target $script:ToolTargets[0] -Top 232 -Number '01'
Add-ToolCard -Target $script:ToolTargets[1] -Top 382 -Number '02'
Add-ToolCard -Target $script:ToolTargets[2] -Top 532 -Number '03'

$notice = New-Object System.Windows.Forms.Label
$notice.Text = '重要：工程結果、附件完整性、治理 ready 與「正式附件核可」是不同層次；只有計算書內明確核可才是正式附件。'
$notice.Location = New-Object System.Drawing.Point(26, 686)
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

[void]$script:MainForm.ShowDialog()
