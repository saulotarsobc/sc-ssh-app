#Requires -Version 5.1
<#
    Shared helpers for the release scripts.

    This file is NOT an entry point: the other scripts dot-source it
    (`. "$PSScriptRoot\common.ps1"`).
#>

Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Console output
# ---------------------------------------------------------------------------

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    $Message" -ForegroundColor DarkGray
}

function Write-Ok {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    ! $Message" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Console encoding
# ---------------------------------------------------------------------------

<#
    Makes PowerShell read the output of external programs as UTF-8.

    PowerShell decodes the stdout of external programs using
    [Console]::OutputEncoding. Since these scripts run with -NoProfile, that
    value is the console OEM code page rather than whatever the user profile
    sets. Git, Vite and electron-builder all write UTF-8, so without this the
    output arrives mangled on non-ASCII text.

    It is not only cosmetic: the changelog is built from `git log`, so garbled
    commit subjects would end up inside the GitHub release body.

    Returns the previous encoding for the caller to restore — the swap also
    changes the console code page, which is shared with the terminal.
#>
function Set-Utf8Console {
    $previous = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    }
    catch {
        Write-Warn "Could not switch the console to UTF-8: $($_.Exception.Message)"
    }
    return $previous
}

function Restore-ConsoleEncoding {
    param($Encoding)
    if ($null -eq $Encoding) { return }
    try { [Console]::OutputEncoding = $Encoding } catch { }
}

# ---------------------------------------------------------------------------
# Running external programs
# ---------------------------------------------------------------------------

<#
    Runs an external executable and handles the exit code.

    PowerShell does not throw when an external program fails — it only updates
    $LASTEXITCODE. Without this, a failing `git push` would go unnoticed and the
    script would keep publishing. stderr is redirected into stdout because git
    writes ordinary messages there (e.g. "To https://github.com/..."), which
    would turn into errors under $ErrorActionPreference = 'Stop'.
#>
function Invoke-Native {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$Silent,        # do not echo the output
        [switch]$AllowFailure   # return the exit code instead of throwing
    )

    $lines = New-Object 'System.Collections.Generic.List[string]'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $FilePath @Arguments 2>&1 | ForEach-Object {
            $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
            $lines.Add($line)
            if (-not $Silent) { Write-Host "    $line" -ForegroundColor DarkGray }
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $cmd = "$FilePath $($Arguments -join ' ')"
        throw "Command failed (exit $exitCode): $cmd`n$($lines -join "`n")"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Lines    = $lines.ToArray()
    }
}

function Invoke-Git {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Silent,
        [switch]$AllowFailure
    )
    return Invoke-Native -FilePath 'git' -Arguments $Arguments -Silent:$Silent -AllowFailure:$AllowFailure
}

function Assert-Command {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Hint
    )
    $found = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $found) {
        throw "'$Name' was not found on PATH. $Hint"
    }
}

# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

function Get-RepoRoot {
    # The scripts live in <root>/scripts, so the root is the parent directory.
    return (Resolve-Path ([System.IO.Path]::Combine($PSScriptRoot, '..'))).Path
}

function Get-PackageJson {
    param([string]$RepoRoot = (Get-RepoRoot))
    $path = [System.IO.Path]::Combine($RepoRoot, 'package.json')
    if (-not (Test-Path -LiteralPath $path)) {
        throw "package.json was not found in $RepoRoot"
    }
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

<#
    Extracts owner/repo from the `repository` field of package.json.

    The electron-builder configuration is generated
    (scripts/generate-electron-builder.ts -> electron-builder.json, which is
    git-ignored), so its `publish` block cannot be the source of truth here — it
    may not exist yet. The generator reads this very same field to build that
    block, so the script and the publisher cannot point at different repos.
#>
function Get-PublishTarget {
    param([Parameter(Mandatory)]$PackageJson)

    $repository = $null
    if ($PackageJson.PSObject.Properties.Name -contains 'repository') {
        $repository = $PackageJson.repository
    }

    $url = if ($repository -is [string]) { $repository }
    elseif ($repository -and $repository.PSObject.Properties.Name -contains 'url') { $repository.url }
    else { $null }

    if (-not $url) {
        throw "package.json has no 'repository' field — neither this script nor electron-builder would know where to publish."
    }

    # Matches https://github.com/owner/repo(.git), git+https://... and git@github.com:owner/repo.git
    if ($url -notmatch 'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$') {
        throw "Could not extract owner/repo from 'repository.url' ($url). Use a GitHub URL."
    }

    return [pscustomobject]@{
        Owner = $Matches[1]
        Repo  = $Matches[2]
    }
}

<#
    Resolves the GitHub token, in order of preference:
      1. GH_TOKEN / GITHUB_TOKEN environment variables
      2. local electron-builder.env or .env files (both git-ignored)
      3. the GitHub CLI login (`gh auth token`)

    Item 3 is what makes the script work with no extra setup on a machine that
    has already run `gh auth login`.
#>
function Resolve-GitHubToken {
    param([string]$RepoRoot = (Get-RepoRoot))

    foreach ($name in @('GH_TOKEN', 'GITHUB_TOKEN')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value -and $value.Trim()) {
            return [pscustomobject]@{ Token = $value.Trim(); Source = "$name environment variable" }
        }
    }

    foreach ($file in @('electron-builder.env', '.env')) {
        $path = [System.IO.Path]::Combine($RepoRoot, $file)
        if (-not (Test-Path -LiteralPath $path)) { continue }
        foreach ($line in (Get-Content -LiteralPath $path)) {
            if ($line -match '^\s*(?:export\s+)?GH_TOKEN\s*=\s*(.+?)\s*$') {
                # Strip single or double quotes around the value.
                $token = $Matches[1].Trim().Trim('"').Trim("'")
                if ($token) {
                    return [pscustomobject]@{ Token = $token; Source = $file }
                }
            }
        }
    }

    $gh = Get-Command 'gh' -ErrorAction SilentlyContinue
    if ($gh) {
        $result = Invoke-Native -FilePath 'gh' -Arguments @('auth', 'token') -Silent -AllowFailure
        if ($result.ExitCode -eq 0 -and $result.Lines.Count -gt 0) {
            $token = ($result.Lines[0]).Trim()
            if ($token) {
                return [pscustomobject]@{ Token = $token; Source = 'gh auth token' }
            }
        }
    }

    throw @"
No GitHub token found.

Fix it in one of these ways:
  * gh auth login                      (recommended — nothing else to configure)
  * `$env:GH_TOKEN = 'ghp_xxx'          (current session only)
  * create electron-builder.env with GH_TOKEN="ghp_xxx"

The token needs the 'repo' scope to create releases and upload assets.
"@
}

<#
    Compares the running Node version against .nvmrc (when present) or
    `engines.node`. It only warns — a mismatch usually works, but it explains
    builds that break on one machine and not on another.
#>
function Test-NodeVersion {
    param([string]$RepoRoot = (Get-RepoRoot))

    $actual = (Invoke-Native -FilePath 'node' -Arguments @('--version') -Silent).Lines[0].Trim()
    $actualMajor = [int](($actual -replace '^v', '').Split('.')[0])

    $nvmrc = [System.IO.Path]::Combine($RepoRoot, '.nvmrc')
    if (Test-Path -LiteralPath $nvmrc) {
        $expected = (Get-Content -LiteralPath $nvmrc -Raw).Trim()
        if ($expected) {
            $expectedMajor = [int](($expected -replace '^v', '').Split('.')[0])
            if ($expectedMajor -ne $actualMajor) {
                Write-Warn "Running Node $actual, but .nvmrc asks for $expected."
            }
            else {
                Write-Info "Node $actual (.nvmrc: $expected)"
            }
            return
        }
    }

    # Without .nvmrc the floor comes from `engines.node` (e.g. ">=24.18.0").
    $pkg = Get-PackageJson -RepoRoot $RepoRoot
    $engine = $null
    if ($pkg.PSObject.Properties.Name -contains 'engines' -and
        $pkg.engines.PSObject.Properties.Name -contains 'node') {
        $engine = $pkg.engines.node
    }
    if (-not $engine) { return }

    if ($engine -match '(\d+)') {
        $minimumMajor = [int]$Matches[1]
        if ($actualMajor -lt $minimumMajor) {
            Write-Warn "Running Node $actual, but engines.node asks for $engine."
            return
        }
    }
    Write-Info "Node $actual (engines.node: $engine)"
}

<#
    Name of the update manifest electron-builder produces for the platform this
    machine builds for.

    electron-updater fetches exactly this file from the latest release, so the
    post-publish check has to look for the right one: publishing from macOS
    never produces latest.yml, and finding one there would only mean an earlier
    Windows run left it behind — a false pass.
#>
function Get-UpdateManifestName {
    # $env:OS is set on Windows under both Windows PowerShell and pwsh, and
    # unset everywhere else. $IsWindows would be simpler but does not exist in
    # PowerShell 5.1.
    if ($env:OS -eq 'Windows_NT') { return 'latest.yml' }

    $uname = Invoke-Native -FilePath 'uname' -Arguments @('-s') -Silent -AllowFailure
    if ($uname.ExitCode -eq 0 -and $uname.Lines.Count -gt 0 -and $uname.Lines[0].Trim() -eq 'Darwin') {
        return 'latest-mac.yml'
    }
    return 'latest-linux.yml'
}

# Writes UTF-8 without a BOM: gh and GitHub expect UTF-8, and the BOM would show
# up as garbage at the start of the release body.
function Write-Utf8File {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}
