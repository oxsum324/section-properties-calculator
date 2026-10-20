# Private Windows PowerShell 5.1 process ownership; never stop a process by name.
if (-not ('StructuralTools.ProcessOwnership.Job' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace StructuralTools.ProcessOwnership {
  internal sealed class JobHandle : SafeHandleZeroOrMinusOneIsInvalid {
    internal JobHandle(IntPtr value) : base(true) { SetHandle(value); }
    protected override bool ReleaseHandle() { return Native.CloseHandle(handle); }
  }
  internal static class Native {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] internal static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool SetInformationJobObject(JobHandle job, int info, IntPtr data, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool QueryInformationJobObject(JobHandle job, int info, IntPtr data, uint length, out uint returned);
    [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool AssignProcessToJobObject(JobHandle job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool IsProcessInJob(IntPtr process, JobHandle job, out bool belongs);
    [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool TerminateJobObject(JobHandle job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool CloseHandle(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] internal struct BasicLimit {
      internal long ProcessTime, JobTime; internal uint Flags;
      internal UIntPtr MinWorkingSet, MaxWorkingSet; internal uint ActiveProcesses;
      internal UIntPtr Affinity; internal uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] internal struct IoCounters {
      internal ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] internal struct ExtendedLimit {
      internal BasicLimit Basic; internal IoCounters Io;
      internal UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
  }
  public sealed class Identity {
    public int Id; public string Name; public string StartTimeUtc;
  }
  public sealed class Job : IDisposable {
    private JobHandle handle;
    public Job() {
      handle = new JobHandle(Native.CreateJobObject(IntPtr.Zero, null));
      if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
      var limits = new Native.ExtendedLimit();
      limits.Basic.Flags = 0x00002000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
      int size = Marshal.SizeOf(typeof(Native.ExtendedLimit));
      IntPtr data = Marshal.AllocHGlobal(size);
      try {
        Marshal.StructureToPtr(limits, data, false);
        if (!Native.SetInformationJobObject(handle, 9, data, (uint)size)) {
          int code = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(code);
        }
      } finally { Marshal.FreeHGlobal(data); }
    }
    public void Assign(Process process) {
      if (!Native.AssignProcessToJobObject(handle, process.Handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public int[] ProcessIds() {
      for (int size=8192; size<=16777216; size*=2) {
        IntPtr data=Marshal.AllocHGlobal(size);
        try {
          uint returned;
          if (!Native.QueryInformationJobObject(handle, 3, data, (uint)size, out returned)) {
            int code=Marshal.GetLastWin32Error(); if(code==234) continue; throw new Win32Exception(code);
          }
          int count=Marshal.ReadInt32(data, 4); var result=new int[count];
          for(int i=0;i<count;i++) result[i]=checked((int)(IntPtr.Size==8 ? Marshal.ReadInt64(data,8+i*8) : Marshal.ReadInt32(data,8+i*4)));
          return result;
        } finally { Marshal.FreeHGlobal(data); }
      }
      throw new InvalidOperationException("Owned job process list exceeds supported size.");
    }
    public Identity[] Snapshot() {
      var result=new List<Identity>();
      foreach(int id in ProcessIds()) {
        try {
          using(Process process=Process.GetProcessById(id)) {
            bool belongs;
            if(Native.IsProcessInJob(process.Handle,handle,out belongs) && belongs)
              result.Add(new Identity {Id=id,Name=process.ProcessName,StartTimeUtc=process.StartTime.ToUniversalTime().ToString("o")});
          }
        } catch(ArgumentException) { } catch(InvalidOperationException) { }
      }
      return result.ToArray();
    }
    public void Terminate() {
      if(!Native.TerminateJobObject(handle,1)) throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public void Dispose() { if(handle!=null) handle.Dispose(); }
  }
}
'@
}

function New-OwnedProcessContext {
  param([Parameter(Mandatory=$true)][string]$LogPath)
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($LogPath))
  return [pscustomobject]@{ LogPath=$LogPath; Jobs=[Collections.Generic.List[object]]::new() }
}

function Write-OwnedProcessRecord {
  param($Context, [string]$Action, [string]$CheckKey, $Identity, [string]$Reason)
  # Deliberately closed schema: no command line, executable path, or user profile.
  $record=[ordered]@{ action=$Action; name=[string]$Identity.Name; pid=[int]$Identity.Id;
    startTimeUtc=$Identity.StartTimeUtc; checkKey=$CheckKey; reason=$Reason }
  [IO.File]::AppendAllText($Context.LogPath,($record|ConvertTo-Json -Compress)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}

function Get-OwnedProcessGateBootstrap {
  return @'
$ownershipGateName=[Environment]::GetEnvironmentVariable('STRUCTURAL_TOOLS_OWNERSHIP_GATE','Process')
if ([string]::IsNullOrWhiteSpace($ownershipGateName)) { throw 'Missing process ownership gate.' }
$ownershipGate=[Threading.EventWaitHandle]::OpenExisting($ownershipGateName)
try { if (-not $ownershipGate.WaitOne(30000)) { throw 'Process ownership assignment timed out.' } }
finally { $ownershipGate.Dispose() }
[Environment]::SetEnvironmentVariable('STRUCTURAL_TOOLS_OWNERSHIP_GATE',$null,'Process')
'@
}

function Start-OwnedProcess {
  param([Parameter(Mandatory=$true)]$Context, [Parameter(Mandatory=$true)][string]$CheckKey,
    [Parameter(Mandatory=$true)][Diagnostics.ProcessStartInfo]$StartInfo)
  $job=[StructuralTools.ProcessOwnership.Job]::new()
  $gateName='LocalStructuralToolsOwnership-'+[guid]::NewGuid().ToString('N')
  $gate=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,$gateName)
  $StartInfo.EnvironmentVariables['STRUCTURAL_TOOLS_OWNERSHIP_GATE']=$gateName
  $process=[Diagnostics.Process]::new(); $process.StartInfo=$StartInfo
  $released=$false; $entry=$null
  try {
    if(-not $process.Start()) { throw 'Owned process failed to start.' }
    # The generated script is blocked at its gate until Windows assigns ownership.
    $job.Assign($process)
    $entry=[pscustomobject]@{ Job=$job; Gate=$gate; CheckKey=$CheckKey; RootPid=$process.Id }
    $Context.Jobs.Add($entry)
    foreach($identity in $job.Snapshot()) { Write-OwnedProcessRecord $Context 'started' $CheckKey $identity 'assigned-before-execution' }
    [void]$gate.Set()
    $released=$true
    return $process
  } catch {
    # Only our just-created process HANDLE, still blocked at the gate, can be stopped here.
    $identity=$null
    try {
      $identity=[pscustomobject]@{Id=$process.Id;Name=$process.ProcessName;StartTimeUtc=$process.StartTime.ToUniversalTime().ToString('o')}
      Write-OwnedProcessRecord $Context 'terminating' $CheckKey $identity 'launch-not-completed'
    } catch {}
    try { if(-not $process.HasExited) { $process.Kill(); [void]$process.WaitForExit(5000) } } catch {}
    try {
      if($null -ne $identity -and $process.HasExited) { Write-OwnedProcessRecord $Context 'stopped' $CheckKey $identity 'launch-not-completed' }
    } catch {}
    if($null -ne $entry) { [void]$Context.Jobs.Remove($entry) }
    $job.Dispose(); $process.Dispose(); throw
  } finally { if(-not $released) { $gate.Dispose() } }
}

function Clear-OwnedProcessJobs {
  param([Parameter(Mandatory=$true)]$Context, [string]$CheckKey='unowned', [switch]$Startup)
  try {
  $ownedIds=[Collections.Generic.HashSet[int]]::new()
  foreach($entry in $Context.Jobs.ToArray()) {
    foreach($identity in $entry.Job.Snapshot()) { [void]$ownedIds.Add($identity.Id) }
  }
  # Names are used ONLY to explain why unrelated peers are skipped, never to select kills.
  foreach($peer in @(Get-Process -Name node,chrome,msedge -ErrorAction SilentlyContinue)) {
    if($ownedIds.Contains($peer.Id)) { continue }
    $stamp=$null;try { $stamp=$peer.StartTime.ToUniversalTime().ToString('o') } catch {}
    $identity=[pscustomobject]@{Id=$peer.Id;Name=$peer.ProcessName;StartTimeUtc=$stamp}
    Write-OwnedProcessRecord $Context 'skipped' 'unowned' $identity 'not-in-owned-job'
  }
  if($Startup) {
    # KILL_ON_JOB_CLOSE handles prior-run leftovers, including abrupt owner termination.
    # No named or timestamp-based startup kill, no prior PID ledger to trust.
    return
  }
  foreach($entry in $Context.Jobs.ToArray()) {
    try {
      $identities=@($entry.Job.Snapshot())
      foreach($identity in $identities) { Write-OwnedProcessRecord $Context 'terminating' $entry.CheckKey $identity 'owned-job-cleanup' }
      $entry.Job.Terminate()
      $deadline=[DateTime]::UtcNow.AddSeconds(5)
      while($entry.Job.ProcessIds().Length -gt 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }
      if($entry.Job.ProcessIds().Length -gt 0) { throw 'Owned processes did not terminate.' }
      foreach($identity in $identities) { Write-OwnedProcessRecord $Context 'stopped' $entry.CheckKey $identity 'owned-job-cleanup' }
    } finally { $entry.Job.Dispose(); $entry.Gate.Dispose(); [void]$Context.Jobs.Remove($entry) }
  }
  } finally {
    # Inventory or log I/O must never prevent closing the owned kernel handles.
    if(-not $Startup) {
      foreach($entry in $Context.Jobs.ToArray()) {
        try { $entry.Job.Dispose() }
        finally { $entry.Gate.Dispose(); [void]$Context.Jobs.Remove($entry) }
      }
    }
  }
}

function Complete-OwnedProcessCheck {
  param($Context, [int]$RootPid)
  # Close only this check's job on normal completion, leaving unrelated jobs intact.
  $checkContext=[pscustomobject]@{LogPath=$Context.LogPath;Jobs=[Collections.Generic.List[object]]::new()}
  foreach($entry in $Context.Jobs.ToArray()) {
    if($entry.RootPid -eq $RootPid) { $checkContext.Jobs.Add($entry); [void]$Context.Jobs.Remove($entry) }
  }
  Clear-OwnedProcessJobs -Context $checkContext
}
