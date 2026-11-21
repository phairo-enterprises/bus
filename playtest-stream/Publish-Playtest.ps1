<# Publish host.js and viewer.js to the existing Alienware stream.
   From a release folder, run with -StreamDirectory PATH for a one-time publish,
   or add -CheckOnly for a comparison. To start the watcher and restore it on
   future sign-ins, run once on the Windows computer serving the game:
       .\Publish-Playtest.ps1 -StreamDirectory PATH -InstallWatcher
   -Watch runs the same watcher in the foreground, without installing a task.
   On the first upgrade, reload the old host page once when the game is idle.
   Later viewer connections select the current host module. Reload the viewer
   page to pick up its own changes. Gameplay code uses its own release process.
#>
[CmdletBinding(DefaultParameterSetName='Local')]
param(
    [Parameter(Mandatory)][string]$StreamDirectory,
    [Parameter(ParameterSetName='Local')][switch]$CheckOnly,
    [Parameter(Mandatory, ParameterSetName='Watch')][switch]$Watch,
    [Parameter(Mandatory, ParameterSetName='Install')][switch]$InstallWatcher,
    [ValidateRange(1,65535)][int]$HostPort = 4174
)
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $StreamDirectory).Path
$modules = 'host.js', 'viewer.js'
$repository = 'https://api.github.com/repos/phairo-enterprises/bus'
$branch = 'hollow-soul-playtest'

function Digest([byte[]]$Bytes) {
    [BitConverter]::ToString($sha256.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()
}
function ServedDigest([string]$Name) {
    Digest ($client.DownloadData("http://127.0.0.1:$HostPort/$Name"))
}
function Get-GitBlobId([byte[]]$Bytes) {
    $prefix = [Text.Encoding]::ASCII.GetBytes("blob $($Bytes.Length)`0")
    $hash = [Security.Cryptography.SHA1]::Create()
    try {
        [void]$hash.TransformBlock($prefix, 0, $prefix.Length, $prefix, 0)
        [void]$hash.TransformFinalBlock($Bytes, 0, $Bytes.Length)
        return [BitConverter]::ToString($hash.Hash).Replace('-','').ToLowerInvariant()
    } finally { $hash.Dispose() }
}
function Get-ReleaseMetadata([string]$Uri) {
    Invoke-RestMethod -Uri $Uri -Headers @{Accept='application/vnd.github+json'} -UserAgent 'Hollow-Soul-Playtest-Publisher' -Method Get -TimeoutSec 25
}
function Get-BranchHead {
    $metadata = Get-ReleaseMetadata "$repository/git/ref/heads/$branch"
    if ($metadata.ref -cne "refs/heads/$branch" -or $metadata.object.type -cne 'commit' -or $metadata.object.sha -cnotmatch '^[0-9a-f]{40}$') {
        throw 'The release branch did not resolve to a commit.'
    }
    return $metadata.object.sha
}
function Get-ReleaseModules([string]$Commit) {
    $bytesByName = @{}
    foreach ($name in $modules) {
        $path = "playtest-stream/$name"
        $metadata = Get-ReleaseMetadata "$repository/contents/${path}?ref=$Commit"
        if ($metadata.type -cne 'file' -or $metadata.path -cne $path -or $metadata.encoding -cne 'base64' -or $metadata.sha -cnotmatch '^[0-9a-f]{40}$') {
            throw "Missing file metadata for $path at $Commit."
        }
        [byte[]]$bytes = [Convert]::FromBase64String($metadata.content)
        if ($bytes.Length -eq 0 -or $bytes.Length -ne $metadata.size -or (Get-GitBlobId $bytes) -cne $metadata.sha) {
            throw "Git blob verification failed for $path at $Commit."
        }
        $bytesByName[$name] = $bytes
    }
    return $bytesByName
}
function Publish-Modules([hashtable]$ReleaseBytes) {
    $mutex = [Threading.Mutex]::new($false, "Local\HollowSoulPlaytestPublish-$HostPort")
    $acquired = $false
    $staged = @()
    $installed = @()
    $retainBackups = $false
    try {
        try { $acquired = $mutex.WaitOne(0) }
        catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (!$acquired) { throw 'Another playtest release is in progress.' }
        $release = foreach ($name in $modules) {
            $file = Join-Path $target $name
            $before = Digest ([IO.File]::ReadAllBytes($file))
            if ((ServedDigest $name) -ne $before) { throw "$name at the running origin differs from the selected folder." }
            $bytes = $ReleaseBytes[$name]
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
            if ($item.Name -eq 'host.js' -and [Text.Encoding]::UTF8.GetString($item.Bytes).StartsWith('// Hollow Soul stream transport v1')) {
                $releasePath = 'host.js?hs-transport=' + $item.After
                if ((ServedDigest $releasePath) -ne $item.After) { throw 'The origin did not serve the versioned host module.' }
            }
        }
        $release | Select-Object Name,@{n='VerifiedSHA256';e={$_.After}},@{n='Updated';e={$_.Before -ne $_.After}}
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
    }
}

function Install-PlaytestWatcher {
    if ($env:OS -ne 'Windows_NT') { throw 'Install the watcher on the Windows stream host.' }
    foreach ($module in $modules) {
        $fileHash = Digest ([IO.File]::ReadAllBytes((Join-Path $target $module)))
        if ((ServedDigest $module) -ne $fileHash) {
            throw "The running origin on port $HostPort and $target disagree on $module."
        }
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $taskName = "Hollow Soul playtest publisher $HostPort $($identity.User.Value)"
    $privateDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "Phairo\HollowSoul\publisher-$HostPort"
    $program = Join-Path $privateDirectory 'Publish-Playtest.ps1'
    if ($program.StartsWith(($target.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The watcher installation directory must be outside the served folder.'
    }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "{0}" -StreamDirectory "{1}" -HostPort {2} -Watch' -f $program,$target.TrimEnd('\'),$HostPort
    $task = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
    if ($task -and ($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine $powershell -or
            $task.Actions[0].Arguments -ine $arguments -or $task.Principal.RunLevel -ne 'Limited' -or
            ($task.Principal.UserId -notin @($identity.Name, $identity.User.Value)))) {
        throw "An existing task named $taskName has a different configuration."
    }
    [void][IO.Directory]::CreateDirectory($privateDirectory)
    $sourcePath = $PSCommandPath
    $trustedBytes = [IO.File]::ReadAllBytes($sourcePath)
    if (![IO.File]::Exists($program) -or (Digest ([IO.File]::ReadAllBytes($program))) -ne (Digest $trustedBytes)) {
        $temp = Join-Path $privateDirectory ([Guid]::NewGuid().ToString('N') + '.tmp')
        $backup = "$temp.bak"
        try {
            [IO.File]::WriteAllBytes($temp, $trustedBytes)
            if ([IO.File]::Exists($program)) { [IO.File]::Replace($temp, $program, $backup) }
            else { [IO.File]::Move($temp, $program) }
        } finally {
            if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
            if ([IO.File]::Exists($backup)) { [IO.File]::Delete($backup) }
        }
    }
    if (!$task) {
        $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $privateDirectory
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
        $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        $task = Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Principal $principal -Settings $settings
    } elseif ($task.State -eq 'Disabled') {
        $task = Enable-ScheduledTask -TaskName $taskName -TaskPath '\'
    }
    if ($task.State -in @('Running','Queued')) {
        Write-Output "The current user's publisher is already active. Task: $taskName"
        return
    }
    $existingWatcher = $null
    try { $existingWatcher = [Threading.Mutex]::OpenExisting("Local\HollowSoulPlaytestWatch-$HostPort") }
    catch [Threading.WaitHandleCannotBeOpenedException] { }
    if ($existingWatcher) {
        $existingWatcher.Dispose()
        Write-Output "An existing watcher is active. The current user's logon task is ready: $taskName"
        return
    }
    Start-ScheduledTask -TaskName $taskName -TaskPath '\'
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        try { $started = [Threading.Mutex]::OpenExisting("Local\HollowSoulPlaytestWatch-$HostPort") }
        catch [Threading.WaitHandleCannotBeOpenedException] { continue }
        $started.Dispose()
        Write-Output "Publisher started. Future sign-ins will start task: $taskName"
        return
    }
    $info = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
    throw "Logon task registered, but the watcher did not start within 10 seconds. Last task result: $($info.LastTaskResult)."
}

$client = [Net.WebClient]::new()
$client.Proxy = $null
$client.CachePolicy = [Net.Cache.RequestCachePolicy]::new([Net.Cache.RequestCacheLevel]::BypassCache)
$sha256 = [Security.Cryptography.SHA256]::Create()
$watchLock = $null
$watchAcquired = $false
try {
    if ($InstallWatcher) {
        Install-PlaytestWatcher
        return
    }
    if (!$Watch) {
        $localBytes = @{}
        foreach ($name in $modules) {
            $localBytes[$name] = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))
        }
        Publish-Modules $localBytes
        return
    }
    $watchLock = [Threading.Mutex]::new($false, "Local\HollowSoulPlaytestWatch-$HostPort")
    try { $watchAcquired = $watchLock.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $watchAcquired = $true }
    if (!$watchAcquired) { throw 'The playtest release watcher is already running.' }

    $cachedHead = $null
    $appliedHead = $null
    $releaseBytes = $null
    while ($true) {
        $delaySeconds = 120
        try {
            $head = Get-BranchHead
            if ($head -cne $cachedHead) {
                $releaseBytes = Get-ReleaseModules $head
                $cachedHead = $head
            }
            $published = @(Publish-Modules $releaseBytes)
            if ($head -cne $appliedHead -or ($published | Where-Object Updated)) {
                Write-Output "Verified origin stream modules from $branch at $head."
                $published
            }
            $appliedHead = $head
        } catch {
            Write-Warning $_.Exception.Message
            $delaySeconds = 300
        }
        Start-Sleep -Seconds $delaySeconds
    }
} finally {
    if ($watchAcquired) { $watchLock.ReleaseMutex() }
    if ($watchLock) { $watchLock.Dispose() }
    $sha256.Dispose()
    $client.Dispose()
}
