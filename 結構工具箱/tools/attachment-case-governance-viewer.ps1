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
$script:WorkerPath = Join-Path $script:ToolDirectory 'attachment-case-governance-viewer-worker.js'

function Get-NodePath {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { $command = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $command) { throw '找不到 Node.js；請先安裝 Node.js 後再開啟案件附件治理檢視器。' }
  return $command.Source
}

function Invoke-GovernanceViewerWorker {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('smoke', 'case', 'portfolio')][string]$Action,
    [string]$InputDirectory = '',
    [bool]$OnlyActionable = $false,
    [string]$Priority = ''
  )

  if (-not (Test-Path -LiteralPath $script:WorkerPath -PathType Leaf)) {
    throw "找不到案件附件治理檢視器核心：$script:WorkerPath"
  }
  $arguments = @($script:WorkerPath, '--action', $Action)
  if ($InputDirectory.Trim()) { $arguments += @('--input', $InputDirectory.Trim()) }
  if ($OnlyActionable) { $arguments += '--only-actionable' }
  if ($Priority.Trim() -and $Priority.Trim() -ne '全部優先層級') { $arguments += @('--priority', $Priority.Trim()) }

  $raw = @(& (Get-NodePath) @arguments 2>&1)
  $exitCode = $LASTEXITCODE
  $json = ($raw | ForEach-Object { $_.ToString() }) -join "`n"
  try {
    $response = $json | ConvertFrom-Json
  } catch {
    throw "案件附件治理檢視器核心未回傳有效結果（exit=$exitCode）：$json"
  }
  $response | Add-Member -NotePropertyName workerExitCode -NotePropertyValue $exitCode -Force
  return $response
}

if ($Smoke) {
  $response = Invoke-GovernanceViewerWorker -Action smoke
  [pscustomobject]@{
    status = $response.status
    windowsFormsLoaded = $true
    workerPath = $script:WorkerPath
    workerExitCode = $response.workerExitCode
    readOnly = $response.readOnly
    message = $response.displayText
  } | ConvertTo-Json -Compress
  if ($response.status -ne 'ready' -or -not $response.readOnly) { exit 3 }
  exit 0
}

function New-FolderDialog {
  param([string]$Description, [string]$SelectedPath = '')
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Description
  $dialog.ShowNewFolderButton = $false
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

function Show-ViewerResponse {
  param($Response)
  $status = [string](Get-ResponseValue $Response 'status' 'error')
  $title = [string](Get-ResponseValue $Response 'title' '案件附件治理檢視器未取得結果')
  Set-StatusAppearance -Status $status -Title $title

  $counts = Get-ResponseValue $Response 'counts' $null
  $parts = @()
  if ($counts) {
    foreach ($property in $counts.PSObject.Properties) { $parts += "$($property.Name)=$($property.Value)" }
  }
  $fingerprint = [string](Get-ResponseValue $Response 'fingerprint')
  if ($fingerprint) { $parts += "fingerprint=$fingerprint" }
  $script:StatusMeta.Text = $parts -join ' ｜ '

  $script:ResultGrid.Rows.Clear()
  foreach ($record in @(Get-ResponseValue $Response 'records' @())) {
    [void]$script:ResultGrid.Rows.Add(
      [string](Get-ResponseValue $record 'item'),
      [string](Get-ResponseValue $record 'name'),
      [string](Get-ResponseValue $record 'status'),
      [string](Get-ResponseValue $record 'priority'),
      [string](Get-ResponseValue $record 'packageStatus'),
      [string](Get-ResponseValue $record 'chainStatus'),
      [string](Get-ResponseValue $record 'pending'),
      [string](Get-ResponseValue $record 'issues'),
      [string](Get-ResponseValue $record 'next')
    )
  }
  $script:DetailsBox.Text = [string](Get-ResponseValue $Response 'displayText')
  $script:BottomStatus.Text = "狀態：$status ｜ 唯讀：$([string](Get-ResponseValue $Response 'readOnly')) ｜ 核心退出碼：$([string](Get-ResponseValue $Response 'workerExitCode'))"
}

function Set-UiBusy {
  param([bool]$Busy)
  $script:MainForm.UseWaitCursor = $Busy
  $script:BtnInspect.Enabled = -not $Busy
  $script:BtnBrowse.Enabled = -not $Busy
  $script:RadioCase.Enabled = -not $Busy
  $script:RadioPortfolio.Enabled = -not $Busy
  $script:PathBox.Enabled = -not $Busy
  if (-not $Busy) { Update-ModeControls }
  [System.Windows.Forms.Application]::DoEvents()
}

function Show-OperationError {
  param([System.Exception]$ErrorRecord)
  Set-StatusAppearance -Status 'error' -Title '案件附件治理檢視器執行失敗'
  $script:StatusMeta.Text = ''
  $script:DetailsBox.Text = $ErrorRecord.Message
  $script:BottomStatus.Text = '狀態：error'
}

function Update-ModeControls {
  $isPortfolio = $script:RadioPortfolio.Checked
  $script:OnlyActionable.Enabled = $isPortfolio
  $script:PriorityBox.Enabled = $isPortfolio
  $script:PathLabel.Text = if ($isPortfolio) { '案件上層資料夾' } else { '案件根目錄' }
  $script:BtnInspect.Text = if ($isPortfolio) { '檢查多案件治理總覽' } else { '檢查單一案件治理' }
}

$script:MainForm = New-Object System.Windows.Forms.Form
$script:MainForm.Text = '案件附件治理檢視器'
$script:MainForm.StartPosition = 'CenterScreen'
$script:MainForm.Size = New-Object System.Drawing.Size(1120, 840)
$script:MainForm.MinimumSize = New-Object System.Drawing.Size(1020, 760)
$script:MainForm.BackColor = [System.Drawing.Color]::FromArgb(244, 247, 250)
$script:MainForm.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 10)

$header = New-Object System.Windows.Forms.Label
$header.Text = '案件附件治理檢視器'
$header.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 22, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(22, 16)
$header.AutoSize = $true
$script:MainForm.Controls.Add($header)

$subheader = New-Object System.Windows.Forms.Label
$subheader.Text = '唯讀檢視單一案件或多案件的正式附件包、升級歷程與可信基準鏈；本畫面不核可、不修改、也不寫入案件資料。'
$subheader.Location = New-Object System.Drawing.Point(25, 62)
$subheader.Size = New-Object System.Drawing.Size(1040, 30)
$subheader.TextAlign = 'MiddleLeft'
$subheader.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$script:MainForm.Controls.Add($subheader)

$scopeGroup = New-Object System.Windows.Forms.GroupBox
$scopeGroup.Text = '檢視範圍'
$scopeGroup.Location = New-Object System.Drawing.Point(22, 104)
$scopeGroup.Size = New-Object System.Drawing.Size(1060, 154)
$scopeGroup.Anchor = 'Top,Left,Right'
$script:MainForm.Controls.Add($scopeGroup)

$script:RadioCase = New-Object System.Windows.Forms.RadioButton
$script:RadioCase.Text = '單一案件根目錄'
$script:RadioCase.Location = New-Object System.Drawing.Point(24, 28)
$script:RadioCase.Size = New-Object System.Drawing.Size(170, 26)
$script:RadioCase.Checked = $true
$scopeGroup.Controls.Add($script:RadioCase)

$script:RadioPortfolio = New-Object System.Windows.Forms.RadioButton
$script:RadioPortfolio.Text = '多案件上層資料夾'
$script:RadioPortfolio.Location = New-Object System.Drawing.Point(210, 28)
$script:RadioPortfolio.Size = New-Object System.Drawing.Size(190, 26)
$scopeGroup.Controls.Add($script:RadioPortfolio)

$script:PathLabel = New-Object System.Windows.Forms.Label
$script:PathLabel.Text = '案件根目錄'
$script:PathLabel.Location = New-Object System.Drawing.Point(24, 68)
$script:PathLabel.Size = New-Object System.Drawing.Size(135, 24)
$scopeGroup.Controls.Add($script:PathLabel)

$script:PathBox = New-Object System.Windows.Forms.TextBox
$script:PathBox.Location = New-Object System.Drawing.Point(160, 64)
$script:PathBox.Size = New-Object System.Drawing.Size(750, 28)
$script:PathBox.Anchor = 'Top,Left,Right'
$scopeGroup.Controls.Add($script:PathBox)
if ($InitialPath.Trim()) { $script:PathBox.Text = $InitialPath.Trim() }

$script:BtnBrowse = New-Object System.Windows.Forms.Button
$script:BtnBrowse.Text = '選擇…'
$script:BtnBrowse.Location = New-Object System.Drawing.Point(925, 62)
$script:BtnBrowse.Size = New-Object System.Drawing.Size(110, 32)
$script:BtnBrowse.Anchor = 'Top,Right'
$scopeGroup.Controls.Add($script:BtnBrowse)

$script:BtnInspect = New-Object System.Windows.Forms.Button
$script:BtnInspect.Text = '檢查單一案件治理'
$script:BtnInspect.Location = New-Object System.Drawing.Point(160, 108)
$script:BtnInspect.Size = New-Object System.Drawing.Size(220, 34)
$scopeGroup.Controls.Add($script:BtnInspect)

$script:OnlyActionable = New-Object System.Windows.Forms.CheckBox
$script:OnlyActionable.Text = '只顯示待處理案件'
$script:OnlyActionable.Location = New-Object System.Drawing.Point(420, 111)
$script:OnlyActionable.Size = New-Object System.Drawing.Size(190, 28)
$scopeGroup.Controls.Add($script:OnlyActionable)

$priorityLabel = New-Object System.Windows.Forms.Label
$priorityLabel.Text = '顯示優先層級'
$priorityLabel.Location = New-Object System.Drawing.Point(630, 114)
$priorityLabel.Size = New-Object System.Drawing.Size(120, 24)
$scopeGroup.Controls.Add($priorityLabel)

$script:PriorityBox = New-Object System.Windows.Forms.ComboBox
$script:PriorityBox.DropDownStyle = 'DropDownList'
$script:PriorityBox.Location = New-Object System.Drawing.Point(750, 109)
$script:PriorityBox.Size = New-Object System.Drawing.Size(160, 30)
[void]$script:PriorityBox.Items.AddRange(@('全部優先層級', 'P0', 'P1', 'P2'))
$script:PriorityBox.SelectedIndex = 0
$scopeGroup.Controls.Add($script:PriorityBox)

$boundary = New-Object System.Windows.Forms.Label
$boundary.Text = '篩選只影響畫面顯示；整體狀態、退出碼與治理指紋仍涵蓋全部案件。'
$boundary.Location = New-Object System.Drawing.Point(420, 28)
$boundary.Size = New-Object System.Drawing.Size(610, 24)
$boundary.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$scopeGroup.Controls.Add($boundary)

$script:StatusPanel = New-Object System.Windows.Forms.Panel
$script:StatusPanel.Location = New-Object System.Drawing.Point(22, 272)
$script:StatusPanel.Size = New-Object System.Drawing.Size(1060, 70)
$script:StatusPanel.Anchor = 'Top,Left,Right'
$script:StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(237, 242, 247)
$script:MainForm.Controls.Add($script:StatusPanel)

$script:StatusTitle = New-Object System.Windows.Forms.Label
$script:StatusTitle.Text = '請先選擇案件根目錄或案件上層資料夾'
$script:StatusTitle.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 13, [System.Drawing.FontStyle]::Bold)
$script:StatusTitle.Location = New-Object System.Drawing.Point(16, 8)
$script:StatusTitle.Size = New-Object System.Drawing.Size(1020, 26)
$script:StatusPanel.Controls.Add($script:StatusTitle)

$script:StatusMeta = New-Object System.Windows.Forms.Label
$script:StatusMeta.Location = New-Object System.Drawing.Point(17, 39)
$script:StatusMeta.Size = New-Object System.Drawing.Size(1020, 22)
$script:StatusPanel.Controls.Add($script:StatusMeta)

$script:ResultGrid = New-Object System.Windows.Forms.DataGridView
$script:ResultGrid.Location = New-Object System.Drawing.Point(22, 356)
$script:ResultGrid.Size = New-Object System.Drawing.Size(1060, 270)
$script:ResultGrid.Anchor = 'Top,Bottom,Left,Right'
$script:ResultGrid.ReadOnly = $true
$script:ResultGrid.AllowUserToAddRows = $false
$script:ResultGrid.AllowUserToDeleteRows = $false
$script:ResultGrid.RowHeadersVisible = $false
$script:ResultGrid.AutoSizeColumnsMode = 'Fill'
$script:ResultGrid.SelectionMode = 'FullRowSelect'
foreach ($column in @(
  @('item', '項目', 8), @('name', '名稱', 20), @('status', '狀態', 8), @('priority', '優先', 6),
  @('packageStatus', '附件包', 9), @('chainStatus', '版本鏈', 9), @('pending', '待前進', 7),
  @('issues', '問題', 20), @('next', '下一步', 18)
)) {
  $dataColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
  $dataColumn.Name = $column[0]
  $dataColumn.HeaderText = $column[1]
  $dataColumn.FillWeight = $column[2]
  [void]$script:ResultGrid.Columns.Add($dataColumn)
}
$script:MainForm.Controls.Add($script:ResultGrid)

$script:DetailsBox = New-Object System.Windows.Forms.TextBox
$script:DetailsBox.Location = New-Object System.Drawing.Point(22, 640)
$script:DetailsBox.Size = New-Object System.Drawing.Size(1060, 120)
$script:DetailsBox.Anchor = 'Bottom,Left,Right'
$script:DetailsBox.Multiline = $true
$script:DetailsBox.ReadOnly = $true
$script:DetailsBox.ScrollBars = 'Vertical'
$script:DetailsBox.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 9)
$script:DetailsBox.Text = '檢查結果會顯示在這裡。ready 只表示可進入內部歸檔複核，不代表正式附件核可。'
$script:MainForm.Controls.Add($script:DetailsBox)

$statusStrip = New-Object System.Windows.Forms.StatusStrip
$script:BottomStatus = New-Object System.Windows.Forms.ToolStripStatusLabel
$script:BottomStatus.Text = '狀態：待命 ｜ 唯讀：true'
[void]$statusStrip.Items.Add($script:BottomStatus)
$script:MainForm.Controls.Add($statusStrip)

$script:RadioCase.Add_CheckedChanged({ Update-ModeControls })
$script:RadioPortfolio.Add_CheckedChanged({ Update-ModeControls })

$script:BtnBrowse.Add_Click({
  $description = if ($script:RadioPortfolio.Checked) { '選擇包含多個案件的上層資料夾' } else { '選擇包含附件治理資料的案件根目錄' }
  $selected = Select-Folder -Description $description -SelectedPath $script:PathBox.Text
  if ($selected) { $script:PathBox.Text = $selected }
})

$script:BtnInspect.Add_Click({
  Set-UiBusy $true
  try {
    $action = if ($script:RadioPortfolio.Checked) { 'portfolio' } else { 'case' }
    $priority = if ($script:RadioPortfolio.Checked) { [string]$script:PriorityBox.SelectedItem } else { '' }
    $response = Invoke-GovernanceViewerWorker `
      -Action $action `
      -InputDirectory $script:PathBox.Text `
      -OnlyActionable ($script:RadioPortfolio.Checked -and $script:OnlyActionable.Checked) `
      -Priority $priority
    Show-ViewerResponse $response
  } catch {
    Show-OperationError $_.Exception
  } finally {
    Set-UiBusy $false
  }
})

Update-ModeControls
[void]$script:MainForm.ShowDialog()
