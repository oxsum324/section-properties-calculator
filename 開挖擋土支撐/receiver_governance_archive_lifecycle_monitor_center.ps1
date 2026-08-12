param(
  [ValidateSet("Interactive", "Snapshot", "Smoke")]
  [string]$Mode = "Interactive",
  [string]$TaskNameFilter,
  [string]$SmokeOutputPath
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manager = Join-Path $root "manage_receiver_governance_archive_lifecycle_monitor_task.ps1"
$onboarding = Join-Path $root "onboard_receiver_governance_archive_lifecycle_monitor.ps1"
$monitorScript = [IO.Path]::GetFullPath((Join-Path $root "receiver_governance_archive_lifecycle_monitor.ps1"))
$powershellExecutable = (Get-Command powershell.exe -CommandType Application -ErrorAction Stop).Source
$taskDescription = "Read-only complete GSC lifecycle portfolio revalidation. Local governance only; not an engineering approval or formal attachment."
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

function Get-QuotedArgument([string]$Arguments, [string]$Name) {
  $match = [regex]::Match($Arguments, '(?i)(?:^|\s)-' + [regex]::Escape($Name) + '\s+"(?<value>[^"]+)"(?:\s|$)')
  if ($match.Success) { return $match.Groups['value'].Value }
  return $null
}

function Get-IntegerArgument([string]$Arguments, [string]$Name, [int]$Default) {
  $match = [regex]::Match($Arguments, '(?i)(?:^|\s)-' + [regex]::Escape($Name) + '\s+(?<value>[0-9]+)(?:\s|$)')
  if ($match.Success) { return [int]$match.Groups['value'].Value }
  return $Default
}

function Test-SwitchArgument([string]$Arguments, [string]$Name) {
  return [regex]::IsMatch($Arguments, '(?i)(?:^|\s)-' + [regex]::Escape($Name) + '(?:\s|$)')
}

function Get-DailyAt($Task) {
  if (-not $Task -or @($Task.Triggers).Count -ne 1) { return $null }
  try {
    $start = [datetimeoffset]::Parse([string]@($Task.Triggers)[0].StartBoundary)
    return $start.ToString("HH:mm")
  } catch {
    return $null
  }
}

function Invoke-ManagerStatus {
  param(
    [string]$TaskName,
    [string]$StateDirectory,
    [int]$MaxAgeHours,
    [string]$DashboardStatusPath,
    [string]$DashboardHistoryPath,
    [string]$DashboardTaskStatusPath
  )
  $arguments = @(
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", $manager,
    "-Mode", "Status",
    "-TaskName", $TaskName,
    "-MaxAgeHours", "$MaxAgeHours",
    "-NoDashboardWrite"
  )
  if ($StateDirectory) { $arguments += @("-StateDirectory", $StateDirectory) }
  if ($DashboardStatusPath) { $arguments += @("-DashboardStatusPath", $DashboardStatusPath) }
  if ($DashboardHistoryPath) { $arguments += @("-DashboardHistoryPath", $DashboardHistoryPath) }
  if ($DashboardTaskStatusPath) { $arguments += @("-DashboardTaskStatusPath", $DashboardTaskStatusPath) }
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $lines = @(& $powershellExecutable @arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $text = ($lines | ForEach-Object { "$_" }) -join [Environment]::NewLine
  try { $result = $text | ConvertFrom-Json } catch { $result = $null }
  return [pscustomobject]@{ ExitCode = $exitCode; Result = $result; Raw = $text }
}

function Get-HealthCode($Status, [bool]$CandidateActionMatches, [string[]]$ParseIssues) {
  if ($ParseIssues.Count -gt 0 -or -not $CandidateActionMatches -or -not $Status -or -not $Status.configurationMatchesCurrentTool) { return "configuration-drift" }
  if (-not $Status.enabled) { return "task-disabled" }
  if ($null -ne $Status.lastTaskResult -and [int]$Status.lastTaskResult -notin @(0, 2, 3)) { return "last-run-failed" }
  if (-not $Status.monitorStateResult) { return "monitor-state-unavailable" }
  if ($Status.monitorStateResult.freshnessStatus -eq "stale") { return "monitor-state-stale" }
  if ($Status.monitorStateResult.attentionStatus -in @("upcoming", "review-due", "blocked")) { return [string]$Status.monitorStateResult.attentionStatus }
  return "healthy"
}

function Get-TaskItem($Task) {
  $issues = [System.Collections.Generic.List[string]]::new()
  $actions = @($Task.Actions)
  $arguments = if ($actions.Count -eq 1) { [string]$actions[0].Arguments } else { "" }
  if ($actions.Count -ne 1) { $issues.Add("action-count-invalid") }
  $sourceRoot = Get-QuotedArgument $arguments "SourceRoot"
  $stateDirectory = Get-QuotedArgument $arguments "StateDirectory"
  $configuredTaskName = Get-QuotedArgument $arguments "TaskName"
  $dashboardStatusPath = Get-QuotedArgument $arguments "DashboardStatusPath"
  $dashboardHistoryPath = Get-QuotedArgument $arguments "DashboardHistoryPath"
  $dashboardTaskStatusPath = Get-QuotedArgument $arguments "DashboardTaskStatusPath"
  $openSslPath = Get-QuotedArgument $arguments "OpenSslPath"
  $upcomingDays = Get-IntegerArgument $arguments "UpcomingDays" 30
  $maxDepth = Get-IntegerArgument $arguments "MaxDepth" 12
  $maxAgeHours = Get-IntegerArgument $arguments "DashboardStatusMaxAgeHours" 36
  $dailyAt = Get-DailyAt $Task
  if (-not $sourceRoot) { $issues.Add("source-root-missing") }
  if (-not $stateDirectory) { $issues.Add("state-directory-missing") }
  if (-not $dailyAt) { $issues.Add("daily-trigger-invalid") }
  if ($configuredTaskName -ne [string]$Task.TaskName) { $issues.Add("task-name-mismatch") }
  $candidateActionMatches = $false
  if ($actions.Count -eq 1) {
    try {
      $candidateActionMatches = `
        [IO.Path]::GetFullPath([string]$actions[0].Execute) -eq [IO.Path]::GetFullPath($powershellExecutable) -and `
        [IO.Path]::GetFullPath((Get-QuotedArgument $arguments "File")) -eq $monitorScript -and `
        [regex]::IsMatch($arguments, '(?i)(?:^|\s)-Mode\s+Run(?:\s|$)')
    } catch {
      $candidateActionMatches = $false
    }
  }
  $statusCall = Invoke-ManagerStatus `
    -TaskName ([string]$Task.TaskName) `
    -StateDirectory $stateDirectory `
    -MaxAgeHours $maxAgeHours `
    -DashboardStatusPath $dashboardStatusPath `
    -DashboardHistoryPath $dashboardHistoryPath `
    -DashboardTaskStatusPath $dashboardTaskStatusPath
  $status = $statusCall.Result
  $healthCode = Get-HealthCode $status $candidateActionMatches @($issues)
  return [ordered]@{
    taskName = [string]$Task.TaskName
    healthCode = $healthCode
    taskState = if ($status) { [string]$status.state } else { [string]$Task.State }
    enabled = if ($status) { [bool]$status.enabled } else { [string]$Task.State -ne "Disabled" }
    configurationMatchesCurrentTool = if ($status) { [bool]$status.configurationMatchesCurrentTool } else { $false }
    sourceRoot = $sourceRoot
    stateDirectory = $stateDirectory
    dailyAt = $dailyAt
    upcomingDays = $upcomingDays
    maxDepth = $maxDepth
    maxAgeHours = $maxAgeHours
    alertsEnabled = -not (Test-SwitchArgument $arguments "NoAlert")
    openSslPath = $openSslPath
    dashboardStatusPath = $dashboardStatusPath
    dashboardHistoryPath = $dashboardHistoryPath
    dashboardTaskStatusPath = $dashboardTaskStatusPath
    lastRunTime = if ($status) { $status.lastRunTime } else { $null }
    lastTaskResult = if ($status) { $status.lastTaskResult } else { $null }
    nextRunTime = if ($status) { $status.nextRunTime } else { $null }
    missedRunCount = if ($status) { $status.missedRunCount } else { $null }
    monitorFreshness = if ($status -and $status.monitorStateResult) { [string]$status.monitorStateResult.freshnessStatus } else { "unavailable" }
    attentionStatus = if ($status -and $status.monitorStateResult) { [string]$status.monitorStateResult.attentionStatus } else { "unavailable" }
    eventCount = if ($status -and $status.monitorStateResult) { [int]$status.monitorStateResult.eventCount } else { $null }
    parseIssues = @($issues)
    statusExitCode = [int]$statusCall.ExitCode
  }
}

function Get-CenterSnapshot {
  $tasks = @(
    Get-ScheduledTask -ErrorAction Stop | Where-Object {
      [string]$_.Description -eq $taskDescription -and
      [string]$_.TaskPath -eq "\" -and
      (-not $TaskNameFilter -or [string]$_.TaskName -like $TaskNameFilter)
    } | Sort-Object TaskName
  )
  $items = @($tasks | ForEach-Object { Get-TaskItem $_ })
  $attentionCodes = @("upcoming", "review-due", "blocked")
  $problemCodes = @("configuration-drift", "task-disabled", "last-run-failed", "monitor-state-unavailable", "monitor-state-stale")
  return [ordered]@{
    schemaVersion = 1
    kind = "governance-external-archive-lifecycle-monitor-management-center-snapshot"
    checkedAt = [datetimeoffset]::Now.ToString("o")
    taskCount = $items.Count
    healthyCount = @($items | Where-Object { $_.healthCode -eq "healthy" }).Count
    attentionCount = @($items | Where-Object { $_.healthCode -in $attentionCodes }).Count
    problemCount = @($items | Where-Object { $_.healthCode -in $problemCodes }).Count
    items = $items
    boundary = [ordered]@{
      localOnly = $true
      containsPaths = $true
      containsTaskNames = $true
      containsCaseIdentifiers = $true
      taskInventoryReadOnly = $true
      sourceScanExecuted = $false
      statusStateVerificationReadOnly = $true
      formalCalculationAttachment = $false
      pagesPublication = $false
      persistedByDefault = $false
    }
  }
}

function Get-SmokeSnapshot {
  $now = [datetimeoffset]::Now
  return [ordered]@{
    schemaVersion = 1
    kind = "governance-external-archive-lifecycle-monitor-management-center-snapshot"
    checkedAt = $now.ToString("o")
    taskCount = 3
    healthyCount = 1
    attentionCount = 1
    problemCount = 1
    items = @(
      [ordered]@{ taskName="案件群 A 每日監測";healthCode="healthy";taskState="Ready";enabled=$true;configurationMatchesCurrentTool=$true;sourceRoot="D:\受控案件\案件群-A";stateDirectory="E:\GSM\案件群-A";dailyAt="09:00";upcomingDays=30;maxDepth=12;maxAgeHours=36;alertsEnabled=$true;openSslPath="C:\Program Files\Git\usr\bin\openssl.exe";dashboardStatusPath="C:\local\status-a.json";dashboardHistoryPath="C:\local\history-a.json";dashboardTaskStatusPath="C:\local\task-a.json";lastRunTime=$now.AddHours(-2).ToString("o");lastTaskResult=0;nextRunTime=$now.AddHours(22).ToString("o");missedRunCount=0;monitorFreshness="fresh";attentionStatus="current";eventCount=8;parseIssues=@();statusExitCode=0 },
      [ordered]@{ taskName="案件群 B 每日監測";healthCode="review-due";taskState="Ready";enabled=$true;configurationMatchesCurrentTool=$true;sourceRoot="D:\受控案件\案件群-B";stateDirectory="E:\GSM\案件群-B";dailyAt="09:30";upcomingDays=30;maxDepth=12;maxAgeHours=36;alertsEnabled=$true;openSslPath="";dashboardStatusPath="C:\local\status-b.json";dashboardHistoryPath="C:\local\history-b.json";dashboardTaskStatusPath="C:\local\task-b.json";lastRunTime=$now.AddHours(-3).ToString("o");lastTaskResult=2;nextRunTime=$now.AddHours(21).ToString("o");missedRunCount=0;monitorFreshness="fresh";attentionStatus="review-due";eventCount=4;parseIssues=@();statusExitCode=0 },
      [ordered]@{ taskName="案件群 C 每日監測";healthCode="configuration-drift";taskState="Ready";enabled=$true;configurationMatchesCurrentTool=$false;sourceRoot="D:\受控案件\案件群-C";stateDirectory="E:\GSM\案件群-C";dailyAt="10:00";upcomingDays=30;maxDepth=12;maxAgeHours=36;alertsEnabled=$false;openSslPath="";dashboardStatusPath="C:\local\status-c.json";dashboardHistoryPath="C:\local\history-c.json";dashboardTaskStatusPath="C:\local\task-c.json";lastRunTime=$now.AddDays(-2).ToString("o");lastTaskResult=1;nextRunTime=$now.AddHours(20).ToString("o");missedRunCount=1;monitorFreshness="stale";attentionStatus="unavailable";eventCount=$null;parseIssues=@("task-name-mismatch");statusExitCode=3 }
    )
    boundary = [ordered]@{localOnly=$true;containsPaths=$true;containsTaskNames=$true;containsCaseIdentifiers=$true;taskInventoryReadOnly=$true;sourceScanExecuted=$false;statusStateVerificationReadOnly=$true;formalCalculationAttachment=$false;pagesPublication=$false;persistedByDefault=$false}
  }
}

function Get-HealthLabel([string]$Code) {
  $labels = @{
    "healthy"="正常";"upcoming"="即將到期";"review-due"="應重驗";"blocked"="阻擋";
    "configuration-drift"="設定漂移";"task-disabled"="排程停用";"last-run-failed"="最近執行失敗";
    "monitor-state-unavailable"="狀態無法驗證";"monitor-state-stale"="狀態過期"
  }
  if ($labels.ContainsKey($Code)) { return $labels[$Code] }
  return $Code
}

function Format-DateTimeValue($Value) {
  if (-not $Value) { return "—" }
  try { return ([datetimeoffset]::Parse([string]$Value)).ToLocalTime().ToString("yyyy/MM/dd HH:mm") } catch { return [string]$Value }
}

function New-RemovalConfirmation([string]$TaskName, [string]$StateDirectory) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "移除每日監測排程"
  $form.StartPosition = "CenterParent"
  $form.Width = 600
  $form.Height = 260
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $label = New-Object System.Windows.Forms.Label
  $label.Left=18;$label.Top=18;$label.Width=545;$label.Height=95
  $label.Text = "即將移除排程：$TaskName`r`n`r`nGSM 狀態與事件不會刪除：$StateDirectory"
  $form.Controls.Add($label)
  $check = New-Object System.Windows.Forms.CheckBox
  $check.Left=18;$check.Top=120;$check.Width=545;$check.Height=35
  $check.Text="我確認只移除這個 Windows 排程，保留既有監測證據。"
  $form.Controls.Add($check)
  $remove=New-Object System.Windows.Forms.Button
  $remove.Left=360;$remove.Top=170;$remove.Width=95;$remove.Height=32;$remove.Text="確認移除";$remove.Enabled=$false;$remove.DialogResult=[System.Windows.Forms.DialogResult]::OK
  $form.Controls.Add($remove)
  $cancel=New-Object System.Windows.Forms.Button
  $cancel.Left=465;$cancel.Top=170;$cancel.Width=95;$cancel.Height=32;$cancel.Text="取消";$cancel.DialogResult=[System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.Add($cancel);$form.CancelButton=$cancel
  $check.Add_CheckedChanged({$remove.Enabled=$check.Checked})
  return $form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK -and $check.Checked
}

function Invoke-OnboardingForItem($Item) {
  $arguments = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $onboarding, "-Mode", "Interactive",
    "-TaskName", [string]$Item.taskName,
    "-SourceRoot", [string]$Item.sourceRoot,
    "-StateDirectory", [string]$Item.stateDirectory,
    "-DailyAt", [string]$Item.dailyAt,
    "-UpcomingDays", [string]$Item.upcomingDays,
    "-MaxDepth", [string]$Item.maxDepth,
    "-MaxAgeHours", [string]$Item.maxAgeHours
  )
  foreach ($entry in @(
    @("OpenSslPath",$Item.openSslPath),@("DashboardStatusPath",$Item.dashboardStatusPath),
    @("DashboardHistoryPath",$Item.dashboardHistoryPath),@("DashboardTaskStatusPath",$Item.dashboardTaskStatusPath)
  )) { if ($entry[1]) { $arguments += @("-$($entry[0])",[string]$entry[1]) } }
  if (-not $Item.alertsEnabled) { $arguments += "-NoAlert" }
  & $powershellExecutable @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "案件導入／更新未完成。" }
}

function New-CenterForm($InitialSnapshot, [bool]$ReadOnly = $false, [scriptblock]$SnapshotProvider = $null) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "GSC 多案件生命週期監控管理中心"
  $form.StartPosition = "CenterScreen"
  $form.Width = 1120
  $form.Height = 720
  $form.MinimumSize = New-Object System.Drawing.Size(960,620)

  $title = New-Object System.Windows.Forms.Label
  $title.Left=18;$title.Top=15;$title.Width=850;$title.Height=32;$title.Text="GSC 多案件生命週期監控管理中心"
  $title.Font=New-Object System.Drawing.Font("Microsoft JhengHei UI",16,[System.Drawing.FontStyle]::Bold)
  $form.Controls.Add($title)
  $boundary = New-Object System.Windows.Forms.Label
  $boundary.Left=20;$boundary.Top=51;$boundary.Width=1040;$boundary.Height=34
  $boundary.Text="僅限本機維運｜完整路徑不寫入儀表板摘要、計算書、正式附件或公開 Pages"
  $boundary.ForeColor=[System.Drawing.Color]::FromArgb(70,86,105)
  $form.Controls.Add($boundary)

  $cards=@()
  foreach($spec in @(@("全部","#E8F1FB"),@("正常","#E8F6EE"),@("待關注","#FFF4DA"),@("維運問題","#FDEAEA"))){
    $panel=New-Object System.Windows.Forms.Panel;$panel.Width=245;$panel.Height=72;$panel.Top=88;$panel.Left=20+($cards.Count*258);$panel.BackColor=[System.Drawing.ColorTranslator]::FromHtml($spec[1]);$panel.BorderStyle="FixedSingle"
    $label=New-Object System.Windows.Forms.Label;$label.Left=14;$label.Top=9;$label.Width=210;$label.Height=22;$label.Text=$spec[0];$panel.Controls.Add($label)
    $value=New-Object System.Windows.Forms.Label;$value.Left=14;$value.Top=31;$value.Width=210;$value.Height=30;$value.Font=New-Object System.Drawing.Font("Microsoft JhengHei UI",15,[System.Drawing.FontStyle]::Bold);$panel.Controls.Add($value)
    $form.Controls.Add($panel);$cards+=,$value
  }

  $grid=New-Object System.Windows.Forms.DataGridView
  $grid.Left=20;$grid.Top=177;$grid.Width=1040;$grid.Height=280;$grid.ReadOnly=$true;$grid.AllowUserToAddRows=$false;$grid.AllowUserToDeleteRows=$false;$grid.MultiSelect=$false;$grid.SelectionMode="FullRowSelect";$grid.AutoGenerateColumns=$false;$grid.RowHeadersVisible=$false;$grid.BackgroundColor=[System.Drawing.Color]::White
  foreach($column in @(@("taskName","排程名稱",300),@("healthLabel","狀態",115),@("taskState","排程",80),@("dailyAt","每日",65),@("lastRunDisplay","最近執行",145),@("nextRunDisplay","下次執行",145),@("monitorFreshness","新鮮度",80),@("missedRunCount","漏跑",60))){$c=New-Object System.Windows.Forms.DataGridViewTextBoxColumn;$c.Name=$column[0];$c.HeaderText=$column[1];$c.DataPropertyName=$column[0];$c.Width=$column[2];$grid.Columns.Add($c)|Out-Null}
  $form.Controls.Add($grid)

  $detail=New-Object System.Windows.Forms.TextBox
  $detail.Left=20;$detail.Top=470;$detail.Width=1040;$detail.Height=120;$detail.Multiline=$true;$detail.ReadOnly=$true;$detail.ScrollBars="Vertical";$detail.Font=New-Object System.Drawing.Font("Microsoft JhengHei UI",9.5)
  $form.Controls.Add($detail)

  $status=New-Object System.Windows.Forms.Label
  $status.Left=20;$status.Top=600;$status.Width=620;$status.Height=32;$status.Text="就緒"
  $form.Controls.Add($status)
  $buttons=@{}
  foreach($spec in @(@("refresh","重新整理",650),@("add","新增監控",750),@("update","重新預覽／更新",850),@("remove","移除排程",990))){$b=New-Object System.Windows.Forms.Button;$b.Text=$spec[1];$b.Left=$spec[2];$b.Top=598;$b.Width=if($spec[0]-eq"update"){130}else{90};$b.Height=34;$form.Controls.Add($b);$buttons[$spec[0]]=$b}
  if($ReadOnly){$buttons.add.Enabled=$false;$buttons.update.Enabled=$false;$buttons.remove.Enabled=$false}

  $centerState=[pscustomobject]@{Items=@()}
  $updateDetails = {
    if($grid.SelectedRows.Count-ne1){$detail.Text="請選擇一個監控設定。";$buttons.update.Enabled=$false;$buttons.remove.Enabled=$false;return}
    $item=$centerState.Items[$grid.SelectedRows[0].Index]
    $detail.Text="來源：$($item.sourceRoot)`r`n狀態資料：$($item.stateDirectory)`r`n設定：每日 $($item.dailyAt)；提醒 $($item.upcomingDays) 日；深度 $($item.maxDepth)；新鮮度 $($item.maxAgeHours) 小時；桌面提醒 $(if($item.alertsEnabled){'啟用'}else{'關閉'})`r`n結果：$(Get-HealthLabel $item.healthCode)；注意狀態 $($item.attentionStatus)；事件 $($item.eventCount)；設定一致 $($item.configurationMatchesCurrentTool)"
    if(-not$ReadOnly){$buttons.update.Enabled=[bool]($item.sourceRoot-and$item.stateDirectory-and$item.dailyAt);$buttons.remove.Enabled=$true}
  }.GetNewClosure()
  $setSnapshot = {
    param($snapshot)
    $cards[0].Text=[string]$snapshot.taskCount;$cards[1].Text=[string]$snapshot.healthyCount;$cards[2].Text=[string]$snapshot.attentionCount;$cards[3].Text=[string]$snapshot.problemCount
    $centerState.Items=@($snapshot.items)
    $rows=@($centerState.Items|ForEach-Object{[pscustomobject]@{taskName=$_.taskName;healthLabel=Get-HealthLabel $_.healthCode;taskState=$_.taskState;dailyAt=$_.dailyAt;lastRunDisplay=Format-DateTimeValue $_.lastRunTime;nextRunDisplay=Format-DateTimeValue $_.nextRunTime;monitorFreshness=$_.monitorFreshness;missedRunCount=$_.missedRunCount}})
    $grid.DataSource=[System.Collections.ArrayList]$rows
    if($grid.Rows.Count-gt0){$grid.Rows[0].Selected=$true};& $updateDetails
    $status.Text="已於 $([datetimeoffset]::Parse($snapshot.checkedAt).ToLocalTime().ToString('yyyy/MM/dd HH:mm:ss')) 檢查 $($snapshot.taskCount) 個監控排程。"
  }.GetNewClosure()
  & $setSnapshot $InitialSnapshot
  $grid.Add_SelectionChanged({& $updateDetails}.GetNewClosure())
  $buttons.refresh.Add_Click({try{$status.Text="正在重新檢查…";$form.Refresh();$nextSnapshot=if($SnapshotProvider){& $SnapshotProvider}else{Get-CenterSnapshot};& $setSnapshot $nextSnapshot}catch{[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,"重新整理失敗",0,16)|Out-Null}}.GetNewClosure())
  if(-not$ReadOnly){
    $buttons.add.Add_Click({try{& $powershellExecutable -NoProfile -ExecutionPolicy Bypass -File $onboarding -Mode Interactive|Out-Null;& $setSnapshot (Get-CenterSnapshot)}catch{[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,"新增未完成",0,16)|Out-Null}}.GetNewClosure())
    $buttons.update.Add_Click({if($grid.SelectedRows.Count-eq1){try{Invoke-OnboardingForItem $centerState.Items[$grid.SelectedRows[0].Index];& $setSnapshot (Get-CenterSnapshot)}catch{[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,"更新未完成",0,16)|Out-Null}}}.GetNewClosure())
    $buttons.remove.Add_Click({if($grid.SelectedRows.Count-eq1){$item=$centerState.Items[$grid.SelectedRows[0].Index];if(New-RemovalConfirmation $item.taskName $item.stateDirectory){try{& $powershellExecutable -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $manager -Mode Remove -TaskName $item.taskName -NoDashboardWrite|Out-Null;if($LASTEXITCODE-ne0){throw'排程移除失敗。'};& $setSnapshot (Get-CenterSnapshot)}catch{[System.Windows.Forms.MessageBox]::Show($_.Exception.Message,"移除失敗",0,16)|Out-Null}}}}.GetNewClosure())
  }
  return [pscustomobject]@{Form=$form;Grid=$grid;Detail=$detail;Buttons=$buttons;Cards=$cards}
}

if($Mode-eq"Snapshot"){
  (Get-CenterSnapshot)|ConvertTo-Json -Depth 8
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if($Mode-eq"Smoke"){
  if(-not$SmokeOutputPath){throw"Smoke requires SmokeOutputPath."}
  $allowedRoot=[IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $root) "output\playwright")).TrimEnd('\')+'\'
  $target=[IO.Path]::GetFullPath($SmokeOutputPath)
  if(-not$target.StartsWith($allowedRoot,[StringComparison]::OrdinalIgnoreCase)){throw"SmokeOutputPath must be inside output/playwright."}
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null
  $ui=New-CenterForm (Get-SmokeSnapshot) $true {Get-SmokeSnapshot}
  $ui.Form.ShowInTaskbar=$false;$ui.Form.StartPosition="Manual";$ui.Form.Location=New-Object System.Drawing.Point(-2000,-2000)
  $ui.Form.Show();[System.Windows.Forms.Application]::DoEvents();$ui.Buttons.refresh.PerformClick();[System.Windows.Forms.Application]::DoEvents();$ui.Form.PerformLayout()
  if($ui.Cards[0].Text-ne"3"-or$ui.Detail.Text-notlike"*D:\受控案件\案件群-A*"){throw "Smoke refresh event did not preserve the fake management snapshot. card=$($ui.Cards[0].Text); detail=$($ui.Detail.Text)"}
  $bitmap=New-Object System.Drawing.Bitmap($ui.Form.ClientSize.Width,$ui.Form.ClientSize.Height)
  $ui.Form.DrawToBitmap($bitmap,(New-Object System.Drawing.Rectangle(0,0,$bitmap.Width,$bitmap.Height)))
  $bitmap.Save($target,[System.Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose();$ui.Form.Close();$ui.Form.Dispose()
  [ordered]@{status="ok";outputPath=$target;taskCount=3;refreshEventVerified=$true;actionsEnabled=$false}|ConvertTo-Json
  exit 0
}

$ui=New-CenterForm (Get-CenterSnapshot) $false
[void]$ui.Form.ShowDialog()
exit 0
