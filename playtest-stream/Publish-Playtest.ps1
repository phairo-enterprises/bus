<# Publish the two browser modules from this release into the running stream.
   Run with -CheckOnly to compare the release, disk, and local HTTP response.
   Once published, reload the Alienware host window and reconnect a viewer. #>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StreamDirectory,
    [switch]$CheckOnly,
    [ValidateRange(1,65535)][int]$HostPort = 4174
)
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $StreamDirectory).Path
$modules = 'host.js', 'viewer.js'
$client = [Net.WebClient]::new()
$client.Proxy = $null
$sha256 = [Security.Cryptography.SHA256]::Create()
$mutex = [Threading.Mutex]::new($false, "Local\HollowSoulPlaytestPublish-$HostPort")
$acquired = $false
$staged = @()
$installed = @()
$retainBackups = $false
function Digest([byte[]]$Bytes) {
    [BitConverter]::ToString($sha256.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()
}
function ServedDigest([string]$Name) {
    Digest ($client.DownloadData("http://127.0.0.1:$HostPort/$Name"))
}
try {
    try { $acquired = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (!$acquired) { throw 'Another playtest release is in progress.' }
    $release = foreach ($name in $modules) {
        $file = Join-Path $target $name
        $before = Digest ([IO.File]::ReadAllBytes($file))
        if ((ServedDigest $name) -ne $before) { throw "$name at the running origin differs from the selected folder." }
        $bytes = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))
        [pscustomobject]@{ Name=$name; File=$file; Bytes=$bytes; Before=$before; After=(Digest $bytes) }
    }
    if ($CheckOnly) {
        $release | Select-Object Name,@{n='Served';e={$_.Before}},@{n='Release';e={$_.After}},@{n='Current';e={$_.Before -eq $_.After}}
        return
    }
    foreach ($item in $release) {
        if ($item.Before -eq $item.After) { continue }
        $prefix = Join-Path $target ('.playtest-' + [Guid]::NewGuid().ToString('N'))
        $entry = [pscustomobject]@{ Item=$item; Temp="$prefix.tmp"; Backup="$prefix.bak" }
        $staged += $entry
        [IO.File]::WriteAllBytes($entry.Temp, $item.Bytes)
    }
    foreach ($entry in $staged) {
        if ((Digest ([IO.File]::ReadAllBytes($entry.Item.File))) -ne $entry.Item.Before) {
            throw "$($entry.Item.Name) changed during publication."
        }
        [IO.File]::Replace($entry.Temp, $entry.Item.File, $entry.Backup)
        $installed += $entry
    }
    foreach ($item in $release) {
        if ((ServedDigest $item.Name) -ne $item.After) { throw "HTTP verification failed for $($item.Name)." }
    }
    $release | Select-Object Name,@{n='VerifiedSHA256';e={$_.After}}
} catch {
    $failure = $_
    foreach ($entry in $installed) {
        try {
            if ((Digest ([IO.File]::ReadAllBytes($entry.Item.File))) -ne $entry.Item.After) {
                throw 'The installed file was modified again.'
            }
            [IO.File]::Replace($entry.Backup, $entry.Item.File, $entry.Temp)
        } catch {
            $retainBackups = $true
            Write-Warning "Restore $($entry.Item.Name) from $($entry.Backup). $($_.Exception.Message)"
        }
    }
    throw $failure
} finally {
    foreach ($entry in $staged) {
        if ([IO.File]::Exists($entry.Temp)) { [IO.File]::Delete($entry.Temp) }
        if (!$retainBackups -and [IO.File]::Exists($entry.Backup)) { [IO.File]::Delete($entry.Backup) }
    }
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    $sha256.Dispose()
    $client.Dispose()
}
