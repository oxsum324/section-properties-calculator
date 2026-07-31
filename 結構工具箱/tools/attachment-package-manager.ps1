[CmdletBinding()]
param(
  [switch]$Smoke,
  [string]$InitialPath = ''
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

  $raw = @(& (Get-NodePath) @arguments 2>&1)
  $exitCode = $LASTEXITCODE
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

$script:SourcePath = Add-FieldRow -Parent $sourceGroup -Label '附件來源資料夾' -Y 32
if ($InitialPath.Trim()) { $script:SourcePath.Text = $InitialPath.Trim() }
$script:BtnBrowseSource = New-Object System.Windows.Forms.Button
$script:BtnBrowseSource.Text = '選擇…'
$script:BtnBrowseSource.Location = New-Object System.Drawing.Point(870, 30)
$script:BtnBrowseSource.Size = New-Object System.Drawing.Size(105, 32)
$script:BtnBrowseSource.Anchor = 'Top,Right'
$sourceGroup.Controls.Add($script:BtnBrowseSource)

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
$outputHint.Text = '留白時，會在附件來源旁建立含時間戳記的新資料夾；不會覆寫既有資料夾。'
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
$script:SourcePath.Add_TextChanged($invalidateBuild)
$script:ProjectNo.Add_TextChanged($invalidateBuild)

$script:BtnBrowseSource.Add_Click({
  $selected = Select-Folder -Description '選擇包含計算書與來源 JSON 的附件資料夾' -SelectedPath $script:SourcePath.Text
  if ($selected) { $script:SourcePath.Text = $selected }
})

$script:BtnBrowseOutput.Add_Click({
  $selected = Select-Folder -Description '選擇正式附件包的輸出上層資料夾' -SelectedPath (Split-Path -Parent $script:OutputPath.Text -ErrorAction SilentlyContinue)
  if ($selected) {
    $sourceName = if ($script:SourcePath.Text.Trim()) { Split-Path $script:SourcePath.Text.Trim() -Leaf } else { '附件' }
    $token = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:OutputPath.Text = Join-Path $selected "$sourceName-正式附件包-$token"
  }
})

$script:BtnBrowsePackage.Add_Click({
  $selected = Select-Folder -Description '選擇要驗證的正式附件包資料夾' -SelectedPath $script:PackagePath.Text
  if ($selected) { $script:PackagePath.Text = $selected }
})

$script:BtnCheck.Add_Click({
  $script:LastReadyInput = ''
  $script:LastReadyProjectNo = ''
  Set-UiBusy $true
  try {
    $response = Invoke-AttachmentWorker -Action check -InputDirectory $script:SourcePath.Text -ProjectNo $script:ProjectNo.Text
    Show-WorkerResponse $response
    if ($response.status -eq 'ready' -and $response.canBuild) {
      $script:LastReadyInput = $script:SourcePath.Text.Trim()
      $script:LastReadyProjectNo = $script:ProjectNo.Text.Trim()
      $script:BtnBuild.Enabled = $true
    }
  } catch {
    Show-OperationError $_.Exception
  } finally {
    Set-UiBusy $false
    if ($script:LastReadyInput -eq $script:SourcePath.Text.Trim() -and $script:LastReadyProjectNo -eq $script:ProjectNo.Text.Trim()) {
      $script:BtnBuild.Enabled = $true
    }
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
  Set-UiBusy $true
  try {
    $response = Invoke-AttachmentWorker -Action verify -InputDirectory $script:PackagePath.Text
    Show-WorkerResponse $response
  } catch {
    Show-OperationError $_.Exception
  } finally {
    Set-UiBusy $false
  }
})

$script:BtnOpenOutput.Add_Click({
  if ($script:LastOutputDirectory -and (Test-Path -LiteralPath $script:LastOutputDirectory -PathType Container)) {
    Start-Process -FilePath explorer.exe -ArgumentList @($script:LastOutputDirectory)
  }
})

[void]$script:MainForm.ShowDialog()
