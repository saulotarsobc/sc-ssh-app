#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Markdown changelog from the commits since the previous version.

.DESCRIPTION
    Groups commits by the conventional types used in this project
    (.github/commit.md). Commits that do not follow the convention land under
    "Other changes" — nothing is dropped silently, except the version bump
    commit created by release.ps1, whose subject is just the version.

    Without -OutFile the Markdown is printed to the screen, which is how you
    review the notes before publishing (`npm run release:notes`).

.PARAMETER Tag
    The tag being published. Defaults to "v" + the package.json version.

.PARAMETER From
    Starting tag of the range. Defaults to the highest existing tag other
    than -Tag.

.PARAMETER OutFile
    Path to write the Markdown to. Without it, writes to standard output.

.EXAMPLE
    ./scripts/changelog.ps1
    ./scripts/changelog.ps1 -From v1.0.12 -OutFile out/release-notes.md
#>
[CmdletBinding()]
param(
    [string]$Tag,
    [string]$From,
    [string]$OutFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. ([System.IO.Path]::Combine($PSScriptRoot, 'common.ps1'))

$repoRoot = Get-RepoRoot
$previousEncoding = Set-Utf8Console
Push-Location $repoRoot
try {
    if (-not $Tag) {
        $Tag = 'v' + (Get-PackageJson -RepoRoot $repoRoot).version
    }

    # ---------------------------------------------------------------------
    # Commit range
    # ---------------------------------------------------------------------
    if (-not $From) {
        # The highest tag by version order that is not the one being published.
        # `-v:refname` sorts semantically (v1.10.0 > v1.9.0), which plain
        # alphabetical order would get wrong.
        $tags = @(
            (Invoke-Git -Arguments @('tag', '--list', 'v*', '--sort=-v:refname') -Silent).Lines |
                Where-Object { $_ -and $_.Trim() -ne $Tag }
        )
        if ($tags.Count -gt 0) { $From = $tags[0].Trim() }
    }

    if ($From) {
        $range = "$From..HEAD"
        Write-Host "    Commits from $From to $Tag" -ForegroundColor DarkGray
    }
    else {
        $range = 'HEAD'
        Write-Host "    First release: using the whole history" -ForegroundColor DarkGray
    }

    # ---------------------------------------------------------------------
    # Collecting the commits
    # ---------------------------------------------------------------------
    # 0x1f separates fields and 0x1e separates records: the commit body is
    # multiline and would break any line-based parsing. Git expands %x1f/%x1e
    # itself, so no PowerShell escaping is involved.
    $format = '%s%x1f%h%x1f%b%x1e'
    $raw = ((Invoke-Git -Arguments @('log', '--no-merges', '--reverse', "--format=$format", $range) -Silent).Lines) -join "`n"

    # The bump commit is release noise, not a change. Covers both the
    # `npm version` format (bare number) and the one release.ps1 creates.
    $bumpPattern = '^(?:v?\d+\.\d+\.\d+|chore(?:\([^)]*\))?:\s*release\s+v?\d+\.\d+\.\d+)$'

    $commits = @()
    foreach ($record in ($raw -split [char]0x1e)) {
        $record = $record.Trim("`r", "`n", ' ')
        if (-not $record) { continue }

        $fields = $record -split [char]0x1f
        if ($fields.Count -lt 2) { continue }

        $subject = $fields[0].Trim()
        if (-not $subject -or $subject -match $bumpPattern) { continue }

        $type = 'other'
        $scope = ''
        $description = $subject
        $breaking = $false

        # Matches "type:", "type(scope):" and "type!:" (breaking change).
        if ($subject -match '^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<desc>.+)$') {
            $type = $Matches['type'].ToLowerInvariant()
            $scope = if ($Matches['scope']) { $Matches['scope'] } else { '' }
            $description = $Matches['desc'].Trim()
            $breaking = [bool]$Matches['bang']
        }

        $body = if ($fields.Count -ge 3) { $fields[2] } else { '' }
        if ($body -match 'BREAKING[ -]CHANGE') { $breaking = $true }

        $commits += [pscustomobject]@{
            Subject     = $subject
            Hash        = $fields[1].Trim()
            Type        = $type
            Scope       = $scope
            Description = $description
            Breaking    = $breaking
        }
    }

    # ---------------------------------------------------------------------
    # Grouping
    # ---------------------------------------------------------------------
    $sections = @(
        [pscustomobject]@{ Title = '✨ Features';      Types = @('feat') }
        [pscustomobject]@{ Title = '🐛 Bug fixes';     Types = @('fix') }
        [pscustomobject]@{ Title = '♻️ Improvements';  Types = @('perf', 'refactor') }
        [pscustomobject]@{ Title = '📚 Documentation'; Types = @('docs') }
        [pscustomobject]@{ Title = '🧹 Maintenance';   Types = @('test', 'chore', 'build', 'ci', 'style', 'revert') }
    )

    function Format-CommitLine {
        param([Parameter(Mandatory)][pscustomobject]$Commit)
        $prefix = if ($Commit.Scope) { "**$($Commit.Scope):** " } else { '' }
        return "- $prefix$($Commit.Description) (``$($Commit.Hash)``)"
    }

    $blocks = @()

    # Goes first: it is what tells the user whether they can update without
    # thinking about it.
    $breakingCommits = @($commits | Where-Object { $_.Breaking })
    if ($breakingCommits.Count -gt 0) {
        $items = @($breakingCommits | ForEach-Object { Format-CommitLine $_ })
        $blocks += "### ⚠️ Breaking changes`n`n" + ($items -join "`n")
    }

    $knownTypes = @($sections | ForEach-Object { $_.Types } | Sort-Object -Unique)

    foreach ($section in $sections) {
        $items = @(
            $commits |
                Where-Object { $section.Types -contains $_.Type } |
                ForEach-Object { Format-CommitLine $_ }
        )
        if ($items.Count -gt 0) {
            $blocks += "### $($section.Title)`n`n" + ($items -join "`n")
        }
    }

    # A conventional type outside the table (e.g. "wip") would fall through the
    # cracks — here it shows up next to the commits with no prefix at all,
    # instead of disappearing.
    $others = @(
        $commits |
            Where-Object { $knownTypes -notcontains $_.Type } |
            ForEach-Object { Format-CommitLine $_ }
    )
    if ($others.Count -gt 0) {
        $blocks += "### 📦 Other changes`n`n" + ($others -join "`n")
    }

    if ($blocks.Count -gt 0) {
        $markdown = ($blocks -join "`n`n") + "`n"
    }
    else {
        $markdown = "_No new commits since the previous version._`n"
    }

    # ---------------------------------------------------------------------
    # Output
    # ---------------------------------------------------------------------
    if ($OutFile) {
        $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($repoRoot, $OutFile))
        $dir = [System.IO.Path]::GetDirectoryName($full)
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        Write-Utf8File -Path $full -Content $markdown
        Write-Host "    Changelog written to $full" -ForegroundColor DarkGray
    }
    else {
        Write-Output $markdown
    }
}
finally {
    Pop-Location
    Restore-ConsoleEncoding -Encoding $previousEncoding
}
