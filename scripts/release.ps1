#Requires -Version 5.1
<#
.SYNOPSIS
    Publishes a new version to GitHub Releases from the local machine.

.DESCRIPTION
    In order: environment checks, optional version bump, type check and lint,
    tag creation/update, changelog, GitHub Release, and build + asset upload
    through electron-builder.

    Every step is idempotent: running it again with the same version does not
    duplicate the tag or the release, and the assets are replaced.

    electron-builder only builds for the platform it runs on. Publishing from
    Windows uploads the NSIS installer and latest.yml; to add the macOS and
    Linux artifacts, run this same script on those machines — the release
    already exists by then, so the assets are appended to it.

.PARAMETER Version
    Explicit version, e.g. 1.2.0. A leading "v" is accepted.

.PARAMETER Bump
    Bumps the package.json version: major, minor or patch.
    Without -Version or -Bump, publishes whatever is already in package.json.

.PARAMETER SkipChecks
    Skips the type check and lint. Only use it when you know why.

.PARAMETER SkipVerify
    Skips the final check that downloads the published update manifest
    without authentication.

.PARAMETER DryRun
    Prints everything that would happen without creating a tag, a release, or
    publishing anything.

.PARAMETER Force
    Allows publishing with uncommitted changes and moving a tag that already
    points at a different commit.

.EXAMPLE
    npm run release          # publishes the version in package.json
    npm run release:dry      # simulates everything, changes nothing
    npm run release:notes    # prints just the changelog that would be used

    # To pass parameters, call the script directly — npm does not forward
    # single-dash flags:
    pwsh ./scripts/release.ps1 -Bump patch
    pwsh ./scripts/release.ps1 -Version 1.2.0 -Force
#>
[CmdletBinding()]
param(
    [string]$Version,
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump,
    [switch]$SkipChecks,
    [switch]$SkipVerify,
    [switch]$DryRun,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. ([System.IO.Path]::Combine($PSScriptRoot, 'common.ps1'))

$repoRoot = Get-RepoRoot
$previousEncoding = Set-Utf8Console
Push-Location $repoRoot

try {
    if ($DryRun) {
        Write-Host ""
        Write-Host "  DRY-RUN MODE — nothing will be created or published." -ForegroundColor Yellow
    }

    if ($Version -and $Bump) {
        throw 'Use -Version or -Bump, not both.'
    }

    # =======================================================================
    # 1. Environment
    # =======================================================================
    Write-Step '1/8  Checking the environment'

    Assert-Command -Name 'git'  -Hint 'Install Git: https://git-scm.com/downloads'
    Assert-Command -Name 'node' -Hint 'Install Node.js: https://nodejs.org'
    Assert-Command -Name 'npm'  -Hint 'npm ships with Node.js.'
    Assert-Command -Name 'gh'   -Hint 'Install the GitHub CLI: https://cli.github.com'

    Test-NodeVersion -RepoRoot $repoRoot

    $branch = (Invoke-Git -Arguments @('rev-parse', '--abbrev-ref', 'HEAD') -Silent).Lines[0].Trim()
    Write-Info "Current branch: $branch"

    # Publishing from a dirty tree means shipping an installer that matches no
    # commit — the tag would point at code different from what was packaged.
    $dirty = @((Invoke-Git -Arguments @('status', '--porcelain') -Silent).Lines | Where-Object { $_.Trim() })
    if ($dirty.Count -gt 0) {
        if ($Force -or $DryRun) {
            Write-Warn "$($dirty.Count) uncommitted change(s) — continuing anyway."
        }
        else {
            throw "There are uncommitted changes. Commit them before publishing (or use -Force)."
        }
    }
    else {
        Write-Ok 'Working tree is clean.'
    }

    $tokenInfo = Resolve-GitHubToken -RepoRoot $repoRoot
    Write-Ok "GitHub token resolved from: $($tokenInfo.Source)"

    # electron-builder reads GH_TOKEN from the environment, and so does gh.
    # Setting it here avoids having to export it before every release.
    $env:GH_TOKEN = $tokenInfo.Token

    $target = Get-PublishTarget -PackageJson (Get-PackageJson -RepoRoot $repoRoot)
    Write-Info "Publishing to: $($target.Owner)/$($target.Repo)"

    # =======================================================================
    # 2. Version
    # =======================================================================
    Write-Step '2/8  Resolving the version'

    $packageJsonPath = [System.IO.Path]::Combine($repoRoot, 'package.json')
    $packageJsonRaw = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8
    $currentVersion = ($packageJsonRaw | ConvertFrom-Json).version

    if ($Version) {
        $newVersion = $Version.TrimStart('v')
        if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
            throw "Invalid version: '$Version'. Use the X.Y.Z format."
        }
    }
    elseif ($Bump) {
        if ($currentVersion -notmatch '^(\d+)\.(\d+)\.(\d+)') {
            throw "Current version '$currentVersion' is not semver — pass -Version explicitly."
        }
        $major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]
        switch ($Bump) {
            'major' { $newVersion = "$($major + 1).0.0" }
            'minor' { $newVersion = "$major.$($minor + 1).0" }
            'patch' { $newVersion = "$major.$minor.$($patch + 1)" }
        }
    }
    else {
        $newVersion = $currentVersion
    }

    $tag = "v$newVersion"

    if ($newVersion -ne $currentVersion) {
        if ($DryRun) {
            Write-Info "[dry-run] package.json: $currentVersion -> $newVersion"
        }
        else {
            # Regex replacement instead of ConvertTo-Json: the round-trip would
            # reorder the keys and rewrite the whole file's formatting.
            $updated = [regex]::Replace(
                $packageJsonRaw,
                '("version"\s*:\s*")' + [regex]::Escape($currentVersion) + '(")',
                '${1}' + $newVersion + '${2}',
                [System.Text.RegularExpressions.RegexOptions]::None,
                [timespan]::FromSeconds(5)
            )
            if ($updated -eq $packageJsonRaw) {
                throw "Could not update the version in package.json (pattern `"version`": `"$currentVersion`" not found)."
            }
            Write-Utf8File -Path $packageJsonPath -Content $updated

            Invoke-Git -Arguments @('add', '--', 'package.json') | Out-Null
            Invoke-Git -Arguments @('commit', '-m', "chore: release $newVersion") | Out-Null
            Write-Ok "package.json: $currentVersion -> $newVersion (bump commit created)."
        }
    }

    Write-Ok "Publishing version $newVersion (tag $tag)"

    # =======================================================================
    # 3. Checks
    # =======================================================================
    Write-Step '3/8  Running the checks'

    # There is no test suite in this boilerplate, so the type check and the
    # linter are what stands between a typo and a published installer.
    if ($SkipChecks) {
        Write-Warn 'Skipped by -SkipChecks.'
    }
    elseif ($DryRun) {
        Write-Info '[dry-run] npx tsc --noEmit && npm run lint'
    }
    else {
        Invoke-Native -FilePath 'npx' -Arguments @('tsc', '--noEmit') | Out-Null
        Invoke-Native -FilePath 'npm' -Arguments @('run', 'lint') | Out-Null
        Write-Ok 'Type check and lint passed.'
    }

    # =======================================================================
    # 4. Pending commits
    # =======================================================================
    Write-Step '4/8  Syncing the branch with the remote'

    $upstream = Invoke-Git -Arguments @('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') -Silent -AllowFailure
    if ($upstream.ExitCode -ne 0) {
        Write-Warn "Branch '$branch' has no upstream configured; only the tag will be pushed."
    }
    else {
        $ahead = [int]((Invoke-Git -Arguments @('rev-list', '--count', '@{u}..HEAD') -Silent).Lines[0].Trim())
        if ($ahead -gt 0) {
            if ($DryRun) {
                Write-Info "[dry-run] git push origin $branch  ($ahead commit(s) ahead)"
            }
            else {
                Write-Info "$ahead commit(s) ahead of the remote; pushing..."
                Invoke-Git -Arguments @('push', 'origin', $branch) | Out-Null
                Write-Ok 'Branch synced.'
            }
        }
        else {
            Write-Ok 'Branch is already in sync.'
        }
    }

    # =======================================================================
    # 5. Tag
    # =======================================================================
    Write-Step "5/8  Preparing tag $tag"

    $head = (Invoke-Git -Arguments @('rev-parse', 'HEAD') -Silent).Lines[0].Trim()
    $tagExists = (Invoke-Git -Arguments @('rev-parse', '-q', '--verify', "refs/tags/$tag") -Silent -AllowFailure).ExitCode -eq 0

    if ($tagExists) {
        $tagCommit = (Invoke-Git -Arguments @('rev-list', '-n', '1', $tag) -Silent).Lines[0].Trim()
        if ($tagCommit -eq $head) {
            Write-Ok "Tag $tag already exists and points at this commit."
        }
        elseif ($Force -or $DryRun) {
            Write-Warn "Tag $tag points at another commit and will be moved to $($head.Substring(0,7))."
            if (-not $DryRun) {
                Invoke-Git -Arguments @('tag', '-f', '-a', $tag, '-m', $tag) | Out-Null
                Invoke-Git -Arguments @('push', '--force', 'origin', "refs/tags/$tag") | Out-Null
            }
        }
        else {
            throw "Tag $tag already exists pointing at another commit ($($tagCommit.Substring(0,7))). Use -Force to move it, or bump the version with -Bump."
        }
    }
    else {
        if ($DryRun) {
            Write-Info "[dry-run] git tag -a $tag && git push origin refs/tags/$tag"
        }
        else {
            Invoke-Git -Arguments @('tag', '-a', $tag, '-m', $tag) | Out-Null
            Write-Ok "Tag $tag created."
        }
    }

    # The tag may exist locally but not on the remote (e.g. created by an
    # earlier run that failed later on).
    if (-not $DryRun) {
        Invoke-Git -Arguments @('push', 'origin', "refs/tags/$tag") -AllowFailure | Out-Null
        Write-Ok "Tag $tag is on the remote."
    }

    # =======================================================================
    # 6. Changelog
    # =======================================================================
    Write-Step '6/8  Building the changelog'

    # out/ is git-ignored, so the file does not pollute the repository.
    $notesFile = [System.IO.Path]::Combine($repoRoot, 'out', 'release-notes.md')
    & ([System.IO.Path]::Combine($PSScriptRoot, 'changelog.ps1')) -Tag $tag -OutFile $notesFile

    Write-Host ''
    Write-Host (Get-Content -LiteralPath $notesFile -Raw -Encoding UTF8)

    # =======================================================================
    # 7. GitHub Release
    # =======================================================================
    Write-Step "7/8  Creating release $tag"

    $exists = (Invoke-Native -FilePath 'gh' -Arguments @('release', 'view', $tag, '--repo', "$($target.Owner)/$($target.Repo)") -Silent -AllowFailure).ExitCode -eq 0

    if ($exists) {
        Write-Ok "Release $tag already exists — its current body was preserved."
    }
    elseif ($DryRun) {
        Write-Info "[dry-run] gh release create $tag --notes-file out/release-notes.md --generate-notes"
    }
    else {
        # --generate-notes appends GitHub's automatic notes (PRs, new
        # contributors and the "Full Changelog" link) below our changelog: the
        # API prepends the supplied body to the generated text.
        # --verify-tag aborts if the tag never reached the remote, which would
        # otherwise create the release on some arbitrary commit of the default
        # branch.
        Invoke-Native -FilePath 'gh' -Arguments @(
            'release', 'create', $tag,
            '--repo', "$($target.Owner)/$($target.Repo)",
            '--title', $tag,
            '--notes-file', $notesFile,
            '--generate-notes',
            '--verify-tag'
        ) | Out-Null
        Write-Ok "Release $tag created."
    }

    # =======================================================================
    # 8. Build and asset upload
    # =======================================================================
    Write-Step '8/8  Building and publishing the assets'

    if ($DryRun) {
        Write-Info '[dry-run] npm run release:publish'
    }
    else {
        # EP_GH_IGNORE_TIME is essential: without it electron-builder refuses to
        # upload assets to a release published more than 2 hours ago and exits
        # successfully, only logging a warning — re-running the script would
        # fail silently. It is also what makes appending the macOS and Linux
        # artifacts to an existing release work at all.
        $env:EP_GH_IGNORE_TIME = 'true'
        try {
            Invoke-Native -FilePath 'npm' -Arguments @('run', 'release:publish') | Out-Null
        }
        finally {
            Remove-Item Env:\EP_GH_IGNORE_TIME -ErrorAction SilentlyContinue
        }
        Write-Ok 'Assets uploaded.'
    }

    # =======================================================================
    # Final verification
    # =======================================================================
    if (-not $DryRun -and -not $SkipVerify) {
        Write-Step 'Verifying the auto-update chain'

        # This is exactly what electron-updater does on the user's machine: it
        # downloads the manifest WITHOUT authentication. If the release is a
        # draft or the repository is private, this 404s and the update never
        # reaches anyone.
        $manifest = Get-UpdateManifestName
        $url = "https://github.com/$($target.Owner)/$($target.Repo)/releases/latest/download/$manifest"
        $ok = $false
        foreach ($attempt in 1..3) {
            try {
                $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30

                # Release assets are served as application/octet-stream, so
                # .Content comes back as byte[]. Running -match over an array
                # filters its elements instead of matching the pattern, and
                # $Matches is never populated — which is how the version ends
                # up empty.
                $yaml = if ($response.Content -is [byte[]]) {
                    [System.Text.Encoding]::UTF8.GetString($response.Content)
                }
                else {
                    [string]$response.Content
                }

                $published = ''
                if ($yaml -match '(?m)^version:\s*(.+)$') {
                    $published = $Matches[1].Trim()
                }
                if ($published -eq $newVersion) {
                    Write-Ok "$manifest is reachable and points at $published."
                }
                else {
                    Write-Warn "$manifest is reachable but reports version '$published' (expected: $newVersion)."
                }
                $ok = $true
                break
            }
            catch {
                if ($attempt -lt 3) {
                    Write-Info "Attempt $attempt failed; GitHub can take a few seconds. Retrying..."
                    Start-Sleep -Seconds 5
                }
            }
        }
        if (-not $ok) {
            Write-Warn "Could not download $url without authentication."
            Write-Warn 'Auto-update depends on it: check that the release is published (not a draft) and the repository is public.'
        }
    }

    Write-Host ''
    if ($DryRun) {
        Write-Host "  Dry-run finished. Nothing was changed." -ForegroundColor Yellow
    }
    else {
        Write-Host "  Version $newVersion published." -ForegroundColor Green
        Write-Host "  https://github.com/$($target.Owner)/$($target.Repo)/releases/tag/$tag" -ForegroundColor Green
        Write-Host "  Run this script on macOS/Linux to append those installers to the same release." -ForegroundColor DarkGray
    }
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    exit 1
}
finally {
    Pop-Location
    Restore-ConsoleEncoding -Encoding $previousEncoding
}
