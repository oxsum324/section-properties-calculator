[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [string]$SourceFile,
    [string]$EtabsDirectory = 'C:/Program Files/Computers and Structures/ETABS 22'
)
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop') {
    & "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @PSBoundParameters
    exit $LASTEXITCODE
}
if ($SourceFile) { $sourcePath=(Resolve-Path -LiteralPath $SourceFile).Path }
$target=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
# CreateDirectory alone succeeds on existing folders. New-Item without Force rejects them.
$null=New-Item -ItemType Directory -Path $target -ErrorAction Stop
$cli=Join-Path $PSScriptRoot 'exchange.cjs'
if ($SourceFile) {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $target 'source.json')
} else {
    & node $cli example $target
    if ($LASTEXITCODE -ne 0) { throw 'Could not load TEASPA example.' }
}
& node $cli prepare $target
if ($LASTEXITCODE -ne 0) { throw 'Source or table generation failed.' }
$source=Get-Content -Encoding utf8 -Raw -LiteralPath (Join-Path $target 'source.json') | ConvertFrom-Json
$dll=Join-Path $EtabsDirectory 'ETABSv1.dll'
[void][Reflection.Assembly]::LoadFrom($dll)
Add-Type -TypeDefinition (Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'Exchange.cs')) -ReferencedAssemblies @($dll,"$env:SystemRoot/Microsoft.NET/Framework64/v4.0.30319/netstandard.dll",'System.Core.dll')
$model=[TeaspaExchange]::Run((Join-Path $EtabsDirectory 'ETABS.exe'),$target,$source.widthCm,$source.depthCm,$source.clearCm)
$read=[ordered]@{
    schema='etabs-pm3-reopened/1'
    source=$source
    model=$model
    hinges=@(Import-Csv -Encoding utf8 -Delimiter ([char]9) -LiteralPath (Join-Path $target 'hinges-reopened.tsv'))
    ends=@(Import-Csv -Encoding utf8 -Delimiter ([char]9) -LiteralPath (Join-Path $target 'assignments-reopened.tsv'))
}
[IO.File]::WriteAllText((Join-Path $target 'readback.json'),($read | ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
& node $cli compare $target
if ($LASTEXITCODE -ne 0) { throw 'Reopened data differs; see comparison.json.' }
Write-Output $target
