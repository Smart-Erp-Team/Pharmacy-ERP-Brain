#Requires -Version 5.1
<#
.SYNOPSIS
    Phase 0 deterministic preflight check and surgical task extractor for Stage 2/3 backend tasks.
.DESCRIPTION
    Run from apps/erp-backend/:
      powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\check-preflight.ps1 `
          -TaskFile docs/stage2-tasks/el-hosseiny.md -TaskId EH-02

    Performs:
      1. Current Git branch check (warns/fails if on 'main' or 'stage2-dev' unless -AllowBaseBranch).
      2. Scoped Git status check (git status --short -- .) so monorepo siblings are excluded.
      3. Wave 0 immutable file integrity check (Program.cs, PharmacyDbContext.cs, ERP-Backend-Blueprint-v1.1.md).
      4. Extracts ONLY the document header table + target Task section to avoid loading 100KB+ task files into context.
#>

param(
    [Parameter(Mandatory = $false)][string]$TaskFile,
    [Parameter(Mandatory = $false)][string]$TaskId,
    [switch]$AllowBaseBranch,
    [switch]$ExtractOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-GitSafe {
    param([string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = & git @GitArgs 2>$null
        return @($lines | Where-Object { $_ -is [string] -and -not [string]::IsNullOrWhiteSpace($_) })
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

$backendRoot = (Get-Location).Path
$hasBlockingFailure = $false

if (-not $ExtractOnly) {
    Write-Output "=== BACKEND PREFLIGHT CHECK ==="
    Write-Output "WorkingDirectory: $backendRoot"

    # 1. Git branch check
    $branchLines = @(Invoke-GitSafe -GitArgs @('branch', '--show-current'))
    $branch = if ($branchLines.Count -gt 0) { $branchLines[0].Trim() } else { "(detached or unavailable)" }
    Write-Output "CurrentBranch: $branch"

    $isOnboardingTask = ($TaskId -match '-01$')
    if ($branch -eq 'main') {
        Write-Output "[BLOCK] Current branch is 'main'. Stage 2/3 work must NEVER run on 'main'."
        $hasBlockingFailure = $true
    }
    elseif ($branch -eq 'stage2-dev' -and -not $AllowBaseBranch -and -not $isOnboardingTask) {
        Write-Output "[WARN] Current branch is 'stage2-dev'. Expected a feature branch (e.g. stage2/<dev>/<task-id>-<slug>). Create or switch to a feature branch before editing code."
    }
    else {
        Write-Output "[OK] Branch check passed."
    }

    # 2. Scoped Git status (only inside apps/erp-backend)
    $dirtyFiles = @(Invoke-GitSafe -GitArgs @('status', '--short', '--', '.'))
    Write-Output "DirtyBackendFilesCount: $($dirtyFiles.Count)"
    if ($dirtyFiles.Count -gt 0) {
        Write-Output "[WARN] Working tree inside apps/erp-backend/ is not clean:"
        $dirtyFiles | Select-Object -First 20 | ForEach-Object { Write-Output "  $_" }
    }
    else {
        Write-Output "[OK] Backend working tree is clean."
    }

    # 3. Wave 0 immutable files check
    $protectedPaths = @(
        'src/PharmacyERP.Api/Program.cs',
        'src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs',
        '_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md'
    )
    $modifiedFiles = @(Invoke-GitSafe -GitArgs @('diff', '--name-only', '--', '.')) + @(Invoke-GitSafe -GitArgs @('diff', '--cached', '--name-only', '--', '.'))
    $wave0Violations = @()
    foreach ($rel in $protectedPaths) {
        if ($modifiedFiles | Where-Object { $_ -like "*$rel" }) {
            $wave0Violations += $rel
        }
    }

    if ($wave0Violations.Count -gt 0) {
        Write-Output "[BLOCK] Wave 0 immutable files have local modifications:"
        $wave0Violations | ForEach-Object { Write-Output "  $_" }
        $hasBlockingFailure = $true
    }
    else {
        Write-Output "[OK] Wave 0 immutable files untouched."
    }
}

# 4. Surgical task extraction
if (-not [string]::IsNullOrWhiteSpace($TaskFile)) {
    if (-not (Test-Path -LiteralPath $TaskFile)) {
        Write-Output "[BLOCK] Task file not found: $TaskFile"
        exit 2
    }

    $lines = Get-Content -LiteralPath $TaskFile -Encoding UTF8
    $firstTaskIdx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^##\s+Task\s+') {
            $firstTaskIdx = $i
            break
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($TaskId)) {
        $escapedId = [Regex]::Escape($TaskId)
        $targetStart = -1
        $targetEnd = $lines.Count - 1

        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^##\s+Task\s+`"?``?$escapedId``?`"?\b") {
                $targetStart = $i
                break
            }
        }

        if ($targetStart -lt 0) {
            Write-Output "[BLOCK] Task '$TaskId' not found in $TaskFile"
            exit 2
        }

        for ($j = $targetStart + 1; $j -lt $lines.Count; $j++) {
            if ($lines[$j] -match '^##\s+Task\s+') {
                $targetEnd = $j - 1
                break
            }
        }

        Write-Output ""
        Write-Output "=== DOCUMENT HEADER ($TaskFile, lines 1-$firstTaskIdx) ==="
        if ($firstTaskIdx -gt 0) {
            $lines[0..($firstTaskIdx - 1)] | ForEach-Object { Write-Output $_ }
        }

        Write-Output ""
        Write-Output "=== EXTRACTED TASK SPEC: $TaskId ($TaskFile, lines $($targetStart + 1)-$($targetEnd + 1)) ==="
        $lines[$targetStart..$targetEnd] | ForEach-Object { Write-Output $_ }
    }
    else {
        Write-Output ""
        Write-Output "=== AVAILABLE TASKS IN $TaskFile ==="
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^##\s+Task\s+') {
                Write-Output "Line $($i + 1): $($lines[$i])"
            }
        }
    }
}

if ($hasBlockingFailure) {
    exit 1
}
exit 0
