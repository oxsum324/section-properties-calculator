param(
  [ValidateSet("Interactive", "Preview", "Install", "Cancel")]
  [string]$Mode = "Interactive",
  [string]$TaskName = "GSC多案件外部歸檔生命週期每日監測",
  [string]$SourceRoot,
  [string]$StateDirectory,
  [ValidatePattern("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")]
  [string]$DailyAt = "09:00",
  [ValidateRange(0, 366)]
  [int]$UpcomingDays = 30,
  [ValidateRange(1, 12)]
  [int]$MaxDepth = 12,
  [ValidateRange(1, 8784)]
  [int]$MaxAgeHours = 36,
  [string]$OpenSslPath,
  [string]$DashboardStatusPath,
  [string]$DashboardHistoryPath,
  [string]$DashboardTaskStatusPath,
  [ValidatePattern("^GMI-[0-9A-F]{20}$")]
  [string]$ConfirmedConfigurationFingerprint,
  [switch]$NoAlert
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manager = Join-Path $root "manage_receiver_governance_archive_lifecycle_monitor_task.ps1"
$powershellExecutable = (Get-Command powershell.exe -CommandType Application -ErrorAction Stop).Source
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:PYTHONUTF8 = "1"

function Write-OnboardingJson($Payload) {
  [Console]::Out.WriteLine(($Payload | ConvertTo-Json -Depth 8))
}

function New-CancelledResult([bool]$SourceScanExecuted = $false) {
  return [ordered]@{
    schemaVersion = 1
    kind = "governance-external-archive-lifecycle-monitor-onboarding-result"
    outcome = "cancelled"
    taskInstalled = $false
    sourceScanExecuted = $SourceScanExecuted
    monitorStateWritten = $false
    boundary = [ordered]@{
      localOnly = $true
      formalCalculationAttachment = $false
      pagesPublication = $false
    }
  }
}

function Get-ManagerArguments([string]$ManagerMode, [string]$Fingerprint) {
  $arguments = @(
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", $manager,
    "-Mode", $ManagerMode,
    "-TaskName", $TaskName,
    "-SourceRoot", $SourceRoot,
    "-StateDirectory", $StateDirectory,
    "-DailyAt", $DailyAt,
    "-UpcomingDays", "$UpcomingDays",
    "-MaxDepth", "$MaxDepth",
    "-MaxAgeHours", "$MaxAgeHours"
  )
  if ($OpenSslPath) { $arguments += @("-OpenSslPath", $OpenSslPath) }
  if ($DashboardStatusPath) { $arguments += @("-DashboardStatusPath", $DashboardStatusPath) }
  if ($DashboardHistoryPath) { $arguments += @("-DashboardHistoryPath", $DashboardHistoryPath) }
  if ($DashboardTaskStatusPath) { $arguments += @("-DashboardTaskStatusPath", $DashboardTaskStatusPath) }
  if ($Fingerprint) { $arguments += @("-ConfirmedConfigurationFingerprint", $Fingerprint) }
  if ($NoAlert) { $arguments += "-NoAlert" }
  return $arguments
}

function Invoke-Manager([string]$ManagerMode, [string]$Fingerprint) {
  $arguments = Get-ManagerArguments $ManagerMode $Fingerprint
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $lines = @(& $powershellExecutable @arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $text = ($lines | ForEach-Object { "$_" }) -join [Environment]::NewLine
  if ($exitCode -ne 0) { throw "The lifecycle monitor task $ManagerMode operation failed. $text" }
  try { return $text | ConvertFrom-Json } catch { throw "The lifecycle monitor task $ManagerMode operation returned unreadable JSON." }
}

function Resolve-OpenSslForScan {
  if ($OpenSslPath) {
    if (-not (Test-Path -LiteralPath $OpenSslPath -PathType Leaf)) { throw "OpenSslPath must be an existing file." }
    return [IO.Path]::GetFullPath($OpenSslPath)
  }
  $command = Get-Command openssl -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidate = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files\Git\mingw64\bin\openssl.exe") |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $candidate) { throw "OpenSSL was not found. Install Git for Windows or provide -OpenSslPath." }
  return $candidate
}

function Invoke-ReadOnlyPortfolioScan {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) { throw "Python was not found. Install the excavation backend requirements first." }
  $scanArguments = @(
    "-m", "backend.receiver_governance_archive_lifecycle_portfolio",
    "--openssl", (Resolve-OpenSslForScan),
    "scan",
    "--source-root", $SourceRoot,
    "--upcoming-days", "$UpcomingDays",
    "--max-depth", "$MaxDepth"
  )
  Push-Location $root
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $lines = @(& $python.Source @scanArguments 2>&1)
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  } finally {
    Pop-Location
  }
  $text = ($lines | ForEach-Object { "$_" }) -join [Environment]::NewLine
  if ($exitCode -notin @(0, 2, 3)) { throw "The read-only GSC source scan failed. $text" }
  try { return $text | ConvertFrom-Json } catch { throw "The read-only GSC source scan returned unreadable JSON." }
}

function Get-OnboardingPreview {
  if (-not $SourceRoot -or -not $StateDirectory) { throw "Preview requires SourceRoot and StateDirectory." }
  $taskPreview = Invoke-Manager "Preview" $null
  $scan = Invoke-ReadOnlyPortfolioScan
  return [ordered]@{
    schemaVersion = 1
    kind = "governance-external-archive-lifecycle-monitor-onboarding-preview"
    outcome = "preview-ready"
    configurationFingerprint = [string]$taskPreview.configurationFingerprint
    confirmationRequired = $true
    taskInstalled = $false
    previewSideEffects = [ordered]@{
      readOnlySourceScanExecuted = $true
      monitorStateWritten = $false
      taskRegistered = $false
    }
    schedule = [ordered]@{
      dailyAt = $DailyAt
      alertsEnabled = -not [bool]$NoAlert
      upcomingDays = $UpcomingDays
      maxDepth = $MaxDepth
      maxAgeHours = $MaxAgeHours
    }
    scan = [ordered]@{
      portfolioStatus = [string]$scan.summary.portfolioStatus
      attentionStatus = [string]$scan.summary.attentionStatus
      sourceStableDuringScan = [bool]$scan.source.sourceStableDuringScan
      scannedDirectoryCount = [int]$scan.discovery.scannedDirectoryCount
      candidatePackageCount = [int]$scan.discovery.candidatePackageCount
      validPackageCount = [int]$scan.discovery.validPackageCount
      invalidPackageCount = [int]$scan.discovery.invalidPackageCount
      chainCount = [int]$scan.summary.chainCount
      upcomingCount = [int]$scan.summary.upcomingCount
      reviewDueCount = [int]$scan.summary.reviewDueCount
      blockedCount = [int]$scan.summary.blockedCount
      errorIssueCount = [int]$scan.summary.errorIssueCount
    }
    boundary = [ordered]@{
      localOnly = $true
      containsPaths = $false
      containsCaseIdentifiers = $false
      sourceScanReadOnly = $true
      formalCalculationAttachment = $false
      pagesPublication = $false
    }
  }
}

function Invoke-ConfirmedInstall($Preview, [string]$Fingerprint) {
  if (-not $Fingerprint -or -not [string]::Equals($Fingerprint, [string]$Preview.configurationFingerprint, [StringComparison]::Ordinal)) {
    throw "Install requires explicit confirmation of the exact onboarding preview fingerprint. No task was registered."
  }
  return Invoke-Manager "Install" $Fingerprint
}

function Select-Folder([string]$Description, [bool]$AllowCreate) {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $AllowCreate
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
  return $dialog.SelectedPath
}

function Confirm-InteractiveInstall($Preview) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "GSC 生命週期監測案件導入"
  $form.StartPosition = "CenterScreen"
  $form.Width = 760
  $form.Height = 610
  $form.MinimizeBox = $false
  $form.MaximizeBox = $false
  $form.FormBorderStyle = "FixedDialog"

  $heading = New-Object System.Windows.Forms.Label
  $heading.Text = "先核對導入草稿，再決定是否建立每日排程"
  $heading.Left = 20
  $heading.Top = 18
  $heading.Width = 700
  $heading.Height = 34
  $heading.Font = New-Object System.Drawing.Font($heading.Font.FontFamily, 14, [System.Drawing.FontStyle]::Bold)
  $form.Controls.Add($heading)

  $summary = New-Object System.Windows.Forms.TextBox
  $summary.Left = 20
  $summary.Top = 62
  $summary.Width = 700
  $summary.Height = 390
  $summary.Multiline = $true
  $summary.ReadOnly = $true
  $summary.ScrollBars = "Vertical"
  $summary.Font = New-Object System.Drawing.Font("Microsoft JhengHei UI", 10)
  $alertText = if ($NoAlert) { "關閉" } else { "啟用（僅狀態改變或失敗）" }
  $summary.Text = @"
案件 GSC 來源：$SourceRoot
本機監測狀態：$StateDirectory
每日執行時間：$DailyAt
桌面提醒：$alertText

唯讀預掃結果
  狀態：$($Preview.scan.attentionStatus)
  GSC 候選包：$($Preview.scan.candidatePackageCount)
  有效包：$($Preview.scan.validPackageCount)
  無效包：$($Preview.scan.invalidPackageCount)
  生命週期鏈：$($Preview.scan.chainCount)
  即將到期：$($Preview.scan.upcomingCount)
  應重驗：$($Preview.scan.reviewDueCount)
  阻擋：$($Preview.scan.blockedCount)
  掃描問題：$($Preview.scan.errorIssueCount)

預覽沒有寫入監測狀態，也沒有建立工作排程。
確認後才會再完整掃描一次、建立本機 GSM 狀態，並註冊目前 Windows 使用者的有限權限每日排程。
這些資料只供內部治理，不會進入計算書、正式附件或公開 Pages。

設定指紋：$($Preview.configurationFingerprint)
"@
  $form.Controls.Add($summary)

  $confirm = New-Object System.Windows.Forms.CheckBox
  $confirm.Left = 20
  $confirm.Top = 470
  $confirm.Width = 700
  $confirm.Height = 44
  $confirm.Text = "我已核對來源、狀態資料夾與排程設定，確認以這一份設定建立每日監測。"
  $form.Controls.Add($confirm)

  $install = New-Object System.Windows.Forms.Button
  $install.Text = "核可並安裝"
  $install.Left = 500
  $install.Top = 525
  $install.Width = 105
  $install.Height = 32
  $install.Enabled = $false
  $install.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Controls.Add($install)

  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = "取消，不建立"
  $cancel.Left = 615
  $cancel.Top = 525
  $cancel.Width = 105
  $cancel.Height = 32
  $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.Add($cancel)
  $form.CancelButton = $cancel
  $confirm.Add_CheckedChanged({ $install.Enabled = $confirm.Checked })

  return $form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK -and $confirm.Checked
}

if ($Mode -eq "Cancel") {
  Write-OnboardingJson (New-CancelledResult)
  exit 0
}

if ($Mode -eq "Preview") {
  Write-OnboardingJson (Get-OnboardingPreview)
  exit 0
}

if ($Mode -eq "Install") {
  $preview = Get-OnboardingPreview
  Write-OnboardingJson (Invoke-ConfirmedInstall $preview $ConfirmedConfigurationFingerprint)
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$SourceRoot = Select-Folder "選擇包含案件 GSC 證據包的實體根目錄（這一步不會建立排程）" $false
if (-not $SourceRoot) {
  Write-OnboardingJson (New-CancelledResult)
  exit 0
}
$StateDirectory = Select-Folder "選擇與案件樹及工具程式庫完全分離的本機 GSM 狀態資料夾" $true
if (-not $StateDirectory) {
  Write-OnboardingJson (New-CancelledResult)
  exit 0
}
$preview = Get-OnboardingPreview
if (-not (Confirm-InteractiveInstall $preview)) {
  Write-OnboardingJson (New-CancelledResult $true)
  exit 0
}
$installed = Invoke-ConfirmedInstall $preview $preview.configurationFingerprint
[System.Windows.Forms.MessageBox]::Show(
  "每日監測已依核對過的設定完成安裝。請使用「檢查多案件外部歸檔生命週期監測排程」確認最新狀態。",
  "GSC 生命週期監測案件導入",
  [System.Windows.Forms.MessageBoxButtons]::OK,
  [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null
Write-OnboardingJson $installed
exit 0
