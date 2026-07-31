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
$script:WorkerPath = Join-Path $script:ToolDirectory 'attachment-package-upgrade-assistant-worker.js'
$script:LastCheckedInput = ''
$script:LastCheckedProjectNo = ''
$script:LastExecuteAction = ''
$script:LastOutputDirectory = ''

function Get-NodePath {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { $command = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $command) { throw '找不到 Node.js；請先安裝 Node.js 後再開啟舊版附件升級助手。' }
  return $command.Source
}

function Invoke-UpgradeAssistantWorker {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('smoke', 'inspect', 'execute')][string]$Action,
    [string]$InputDirectory = '',
    [string]$ProjectNo = ''
  )
  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) {
    throw "找不到舊版附件升級助手核心：$script:WorkerPath"
  }
  $arguments = @($script:WorkerPath, '--action', $Action)
  if ($InputDirectory.Trim()) { $arguments += @('--input', $InputDirectory.Trim()) }
  if ($ProjectNo.Trim()) { $arguments += @('--project-no', $ProjectNo.Trim()) }

  $raw = @(& (Get-NodePath) @arguments 2>&1)
  $exitCode = $LASTEXITCODE
  $json = ($raw | ForEach-Object { $_.ToString() }) -join "`n"
  try {
    $response = $json | ConvertFrom-Json
  } catch {
    throw "舊版附件升級助手核心未回傳有效結果（exit=$exitCode）：$json"
  }
  $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
  return $response
}

if ($Smoke) {
  $response = Invoke-UpgradeAssistantWorker -Action smoke
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

function Select-Folder {
  param([string]$Description, [string]$SelectedPath = '')
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $false
  if ($SelectedPath -and (Test-Path -LiteralPath $SelectedPath -PathType Container)) { $dialog.SelectedPath = $SelectedPath }
  try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }
    return ''
  } finally {
    $dialog.Dispose()
  }
}

function Get-ResponseValue {
  param($Object, [string]$Name, $Fallback = '')
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) { return $Object.$Name }
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

function Clear-ExecutionGrant {
  $script:LastCheckedInput = ''
  $script:LastCheckedProjectNo = ''
  $script:LastExecuteAction = ''
  $script:LastOutputDirectory = ''
  if ($script:ConfirmAction) { $script:ConfirmAction.Checked = $false }
  if ($script:BtnExecute) {
    $script:BtnExecute.Enabled = $false
    $script:BtnExecute.Text = '2. 尚未取得可執行動作'
  }
  if ($script:BtnOpenOutput) { $script:BtnOpenOutput.Enabled = $false }
}

function Update-ExecuteAvailability {
  $sameInput = $script:LastCheckedInput -and $script:LastCheckedInput -eq $script:InputPath.Text.Trim()
  $sameProject = $script:LastCheckedProjectNo -eq $script:ProjectNo.Text.Trim()
  $script:BtnExecute.Enabled = [bool]($script:ConfirmAction.Checked -and $script:LastExecuteAction -and $sameInput -and $sameProject)
}

function Show-AssistantResponse {
  param($Response)
  $status = [string](Get-ResponseValue $Response 'status' 'error')
  $title = [string](Get-ResponseValue $Response 'title' '舊版附件升級助手未取得結果')
  Set-StatusAppearance -Status $status -Title $title

  $parts = @()
  $stage = [string](Get-ResponseValue $Response 'stage')
  if ($stage) { $parts += "stage=$stage" }
  $counts = Get-ResponseValue $Response 'counts' $null
  if ($counts) { foreach ($property in $counts.PSObject.Properties) { $parts += "$($property.Name)=$($property.Value)" } }
  $fingerprint = [string](Get-ResponseValue $Response 'fingerprint')
  if ($fingerprint) { $parts += "fingerprint=$fingerprint" }
  $script:StatusMeta.Text = $parts -join ' ｜ '

  $script:ResultGrid.Rows.Clear()
  foreach ($record in @(Get-ResponseValue $Response 'records' @())) {
    [void]$script:ResultGrid.Rows.Add(
      [string](Get-ResponseValue $record 'sequence'),
      [string](Get-ResponseValue $record 'attachment'),
      [string](Get-ResponseValue $record 'tool'),
      [string](Get-ResponseValue $record 'version'),
      [string](Get-ResponseValue $record 'sourceState'),
      [string](Get-ResponseValue $record 'newFormal'),
      [string](Get-ResponseValue $record 'newSource'),
      [string](Get-ResponseValue $record 'status'),
      [string](Get-ResponseValue $record 'issues')
    )
  }
  $script:DetailsBox.Text = [string](Get-ResponseValue $Response 'displayText')
  $script:BottomStatus.Text = "狀態：$status ｜ 核心退出碼：$([string](Get-ResponseValue $Response 'workerExitCode'))"
}

function Set-UiBusy {
  param([bool]$Busy)
  $script:MainForm.UseWaitCursor = $Busy
  $script:BtnInspect.Enabled = -not $Busy
  $script:BtnBrowse.Enabled = -not $Busy
  $script:InputPath.Enabled = -not $Busy
  $script:ProjectNo.Enabled = -not $Busy
  $script:ConfirmAction.Enabled = -not $Busy
  if ($Busy) { $script:BtnExecute.Enabled = $false }
  else { Update-ExecuteAvailability }
  [System.Windows.Forms.Application]::DoEvents()
}

function Show-OperationError {
  param([System.Exception]$ErrorRecord)
  Clear-ExecutionGrant
  Set-StatusAppearance -Status 'error' -Title '舊版附件升級助手執行失敗'
  $script:StatusMeta.Text = ''
  $script:DetailsBox.Text = $ErrorRecord.Message
  $script:BottomStatus.Text = '狀態：error'
}

$script:MainForm = New-Object System.Windows.Forms.Form
$script:MainForm.Text = '舊版附件升級助手'
$script:MainForm.StartPosition = 'CenterScreen'
$script:MainForm.Size = New-Object System.Drawing.Size(1120, 860)
$script:MainForm.MinimumSize = New-Object System.Drawing.Size(1020, 780)
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(244, 247, 250)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)

$header = New-Object System.Windows.Forms.Label
$header.Text = '舊版附件升級助手'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 22, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(22, 16)
$header.AutoSize = $true
$script:MainForm.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '先唯讀檢查，再明確新建升級工作區或 v3 正式附件包；舊包不覆寫，核可資訊不沿用，檢查本身不留下歷程收據。'
$subheader.Location = New-Object System.Drawing.Point(25, 62)
$subheader.Size = New-Object System.Drawing.Size(1040, 30)
$subheader.TextAlign = 'MiddleLeft'
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:MainForm.Controls.Add($subheader)

$inputGroup = New-Object System.Windows.Forms.GroupBox
$inputGroup.Text = '兩步式安全升級'
$inputGroup.Location = New-Object System.Drawing.Point(22, 104)
$inputGroup.Size = New-Object System.Drawing.Size(1060, 190)
$inputGroup.Anchor = 'Top,Left,Right'
$script:MainForm.Controls.Add($inputGroup)

$inputLabel = New-Object System.Windows.Forms.Label
$inputLabel.Text = '正式附件包／升級工作區'
$inputLabel.Location = New-Object System.Drawing.Point(20, 34)
$inputLabel.Size = New-Object System.Drawing.Size(185, 24)
$inputGroup.Controls.Add($inputLabel)

$script:InputPath = New-Object System.Windows.Forms.TextBox
$script:InputPath.Location = New-Object System.Drawing.Point(205, 30)
$script:InputPath.Size = New-Object System.Drawing.Size(705, 28)
$script:InputPath.Anchor = 'Top,Left,Right'
$inputGroup.Controls.Add($script:InputPath)

$script:BtnBrowse = New-Object System.Windows.Forms.Button
$script:BtnBrowse.Text = '選擇…'
$script:BtnBrowse.Location = New-Object System.Drawing.Point(925, 28)
$script:BtnBrowse.Size = New-Object System.Drawing.Size(110, 32)
$script:BtnBrowse.Anchor = 'Top,Right'
$inputGroup.Controls.Add($script:BtnBrowse)

$projectLabel = New-Object System.Windows.Forms.Label
$projectLabel.Text = '計畫編號（選填）'
$projectLabel.Location = New-Object System.Drawing.Point(20, 76)
$projectLabel.Size = New-Object System.Drawing.Size(160, 24)
$inputGroup.Controls.Add($projectLabel)

$script:ProjectNo = New-Object System.Windows.Forms.TextBox
$script:ProjectNo.Location = New-Object System.Drawing.Point(205, 72)
$script:ProjectNo.Size = New-Object System.Drawing.Size(300, 28)
$inputGroup.Controls.Add($script:ProjectNo)

$script:BtnInspect = New-Object System.Windows.Forms.Button
$script:BtnInspect.Text = '1. 唯讀檢查目前階段'
$script:BtnInspect.Location = New-Object System.Drawing.Point(205, 118)
$script:BtnInspect.Size = New-Object System.Drawing.Size(210, 36)
$inputGroup.Controls.Add($script:BtnInspect)

$script:ConfirmAction = New-Object System.Windows.Forms.CheckBox
$script:ConfirmAction.Text = '我確認只新建產物，不改寫舊包；不代表正式核可'
$script:ConfirmAction.Location = New-Object System.Drawing.Point(440, 121)
$script:ConfirmAction.Size = New-Object System.Drawing.Size(595, 30)
$inputGroup.Controls.Add($script:ConfirmAction)

$script:BtnExecute = New-Object System.Windows.Forms.Button
$script:BtnExecute.Text = '2. 尚未取得可執行動作'
$script:BtnExecute.Location = New-Object System.Drawing.Point(205, 156)
$script:BtnExecute.Size = New-Object System.Drawing.Size(260, 30)
$script:BtnExecute.Enabled = $false
$inputGroup.Controls.Add($script:BtnExecute)

$script:BtnOpenOutput = New-Object System.Windows.Forms.Button
$script:BtnOpenOutput.Text = '開啟本次新建資料夾'
$script:BtnOpenOutput.Location = New-Object System.Drawing.Point(480, 156)
$script:BtnOpenOutput.Size = New-Object System.Drawing.Size(210, 30)
$script:BtnOpenOutput.Enabled = $false
$inputGroup.Controls.Add($script:BtnOpenOutput)

$boundary = New-Object System.Windows.Forms.Label
$boundary.Text = '使用安全預設位置；不覆寫同名資料夾；歷程不放入正式附件包。'
$boundary.Location = New-Object System.Drawing.Point(520, 76)
$boundary.Size = New-Object System.Drawing.Size(515, 42)
$boundary.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$inputGroup.Controls.Add($boundary)

$script:StatusPanel = New-Object System.Windows.Forms.Panel
$script:StatusPanel.Location = New-Object System.Drawing.Point(22, 308)
$script:StatusPanel.Size = New-Object System.Drawing.Size(1060, 70)
$script:StatusPanel.Anchor = 'Top,Left,Right'
$script:StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(237, 242, 247)
$script:MainForm.Controls.Add($script:StatusPanel)

$script:StatusTitle = New-Object System.Windows.Forms.Label
$script:StatusTitle.Text = '請先選擇正式附件包、升級工作區或 01_新組包來源'
$script:StatusTitle.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 13, [System.Drawing.FontStyle]::Bold)
$script:StatusTitle.Location = New-Object System.Drawing.Point(16, 8)
$script:StatusTitle.Size = New-Object System.Drawing.Size(1020, 26)
$script:StatusPanel.Controls.Add($script:StatusTitle)

$script:StatusMeta = New-Object System.Windows.Forms.Label
$script:StatusMeta.Location = New-Object System.Drawing.Point(17, 39)
$script:StatusMeta.Size = New-Object System.Drawing.Size(1020, 22)
$script:StatusPanel.Controls.Add($script:StatusMeta)

$script:ResultGrid = New-Object System.Windows.Forms.DataGridView
$script:ResultGrid.Location = New-Object System.Drawing.Point(22, 392)
$script:ResultGrid.Size = New-Object System.Drawing.Size(1060, 255)
$script:ResultGrid.Anchor = 'Top,Bottom,Left,Right'
$script:ResultGrid.ReadOnly = $true
$script:ResultGrid.AllowUserToAddRows = $false
$script:ResultGrid.AllowUserToDeleteRows = $false
$script:ResultGrid.RowHeadersVisible = $false
$script:ResultGrid.AutoSizeColumnsMode = 'Fill'
$script:ResultGrid.SelectionMode = 'FullRowSelect'
foreach ($column in @(
  @('sequence', '序', 5), @('attachment', '舊附件', 20), @('tool', '產出工具', 13), @('version', '舊版本', 8),
  @('sourceState', '來源狀態', 12), @('newFormal', '新計算書', 16), @('newSource', '新來源', 16),
  @('status', '完成狀態', 10), @('issues', '問題', 15)
)) {
  $dataColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
  $dataColumn.Name = $column[0]
  $dataColumn.HeaderText = $column[1]
  $dataColumn.FillWeight = $column[2]
  [void]$script:ResultGrid.Columns.Add($dataColumn)
}
$script:MainForm.Controls.Add($script:ResultGrid)

$script:DetailsBox = New-Object System.Windows.Forms.TextBox
$script:DetailsBox.Location = New-Object System.Drawing.Point(22, 661)
$script:DetailsBox.Size = New-Object System.Drawing.Size(1060, 120)
$script:DetailsBox.Anchor = 'Bottom,Left,Right'
$script:DetailsBox.Multiline = $true
$script:DetailsBox.ReadOnly = $true
$script:DetailsBox.ScrollBars = 'Vertical'
$script:DetailsBox.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 9)
$script:DetailsBox.Text = '唯讀檢查完成後，只有完整舊包或完成度 ready 的工作區才會提供新建動作。'
$script:MainForm.Controls.Add($script:DetailsBox)

$statusStrip = New-Object System.Windows.Forms.StatusStrip
$script:BottomStatus = New-Object System.Windows.Forms.ToolStripStatusLabel
$script:BottomStatus.Text = '狀態：待命'
[void]$statusStrip.Items.Add($script:BottomStatus)
$script:MainForm.Controls.Add($statusStrip)

$invalidate = {
  Clear-ExecutionGrant
}
$script:InputPath.Add_TextChanged($invalidate)
$script:ProjectNo.Add_TextChanged($invalidate)
$script:ConfirmAction.Add_CheckedChanged({ Update-ExecuteAvailability })

$script:BtnBrowse.Add_Click({
  $selected = Select-Folder -Description '選擇正式附件包、升級工作區或 01_新組包來源' -SelectedPath $script:InputPath.Text
  if ($selected) { $script:InputPath.Text = $selected }
})

$script:BtnInspect.Add_Click({
  Clear-ExecutionGrant
  Set-UiBusy $true
  try {
    $response = Invoke-UpgradeAssistantWorker -Action inspect -InputDirectory $script:InputPath.Text -ProjectNo $script:ProjectNo.Text
    Show-AssistantResponse $response
    if ($response.canExecute -and $response.executeAction) {
      $script:LastCheckedInput = $script:InputPath.Text.Trim()
      $script:LastCheckedProjectNo = $script:ProjectNo.Text.Trim()
      $script:LastExecuteAction = [string]$response.executeAction
      $script:BtnExecute.Text = "2. $([string]$response.executeLabel)"
    }
  } catch {
    Show-OperationError $_.Exception
  } finally {
    Set-UiBusy $false
  }
})

$script:BtnExecute.Add_Click({
  if (-not $script:ConfirmAction.Checked -or -not $script:LastExecuteAction) { return }
  Set-UiBusy $true
  try {
    $response = Invoke-UpgradeAssistantWorker -Action execute -InputDirectory $script:InputPath.Text -ProjectNo $script:ProjectNo.Text
    Show-AssistantResponse $response
    Clear-ExecutionGrant
    if ($response.changedState -and $response.outputDir -and (Test-Path -LiteralPath $response.outputDir -PathType Container)) {
      $script:LastOutputDirectory = [string]$response.outputDir
      $script:BtnOpenOutput.Enabled = $true
    }
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
