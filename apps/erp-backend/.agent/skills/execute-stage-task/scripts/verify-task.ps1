#Requires -Version 5.1
<#
.SYNOPSIS
    Deterministic build, Wave 0, migration-sync, test, and API boot-check verification harness.
.DESCRIPTION
    Run from apps/erp-backend/:
      # Tier 1 Fast Verification (Implementer inner loop):
      powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 `
          -FastFilter "FullyQualifiedName~Sales"

      # Tier 2 Full Verification (Independent Reviewer / Final Audit):
      powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 `
          -Full -BootCheck
#>

param(
    [string]$FastFilter = '',
    [switch]$UnitTestsOnly,
    [switch]$Full,
    [switch]$CheckMigrations,
    [switch]$BootCheck,
    [int]$BootPort = 5097,
    [string]$OwnedFilesRegex = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Invoke-DotNetSafe {
    param([string[]]$DotNetArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & dotnet @DotNetArgs 2>&1 | Out-String
        return @{ Output = $out; ExitCode = $LASTEXITCODE }
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

$failed = $false
function Record-Failure {
    param([string]$Message)
    Write-Output "[FAIL] $Message"
    $script:failed = $true
}

Write-Output "=== PHARMACYERP BACKEND VERIFICATION HARNESS ==="
Write-Output "Mode: $(if ($Full) { 'FULL (Tier 2)' } elseif ($FastFilter) { "FAST (Filter: $FastFilter)" } else { 'BUILD + FULL TESTS' })"

# -------------------------------------------------------------------------
# 1. Wave 0 & Scope Diff Check (scoped to apps/erp-backend/ via '-- .')
# -------------------------------------------------------------------------
Write-Output ""
Write-Output "--- [1/5] Wave 0 & Diff Hygiene Check ---"
$changedFiles = @(
    @(Invoke-GitSafe -GitArgs @('diff', '--name-only', '--', '.')) +
    @(Invoke-GitSafe -GitArgs @('diff', '--cached', '--name-only', '--', '.')) +
    @(Invoke-GitSafe -GitArgs @('ls-files', '--others', '--exclude-standard', '--', '.'))
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique
$changedFiles = @($changedFiles)

Write-Output "Changed/Untracked backend files: $($changedFiles.Count)"
$changedFiles | ForEach-Object { Write-Output "  $_" }

$wave0Forbidden = @(
    'src/PharmacyERP.Api/Program.cs',
    'src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs',
    '_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md'
)
foreach ($forbidden in $wave0Forbidden) {
    if ($changedFiles | Where-Object { $_ -like "*$forbidden" }) {
        Record-Failure "Wave 0 immutable file modified: $forbidden"
    }
}

if (-not [string]::IsNullOrWhiteSpace($OwnedFilesRegex)) {
    $outOfOwnership = @($changedFiles | Where-Object { $_ -notmatch $OwnedFilesRegex })
    if ($outOfOwnership.Count -gt 0) {
        Write-Output "[WARN] Files modified outside expected OwnedFilesRegex ($OwnedFilesRegex):"
        $outOfOwnership | ForEach-Object { Write-Output "  $_" }
    }
}

# -------------------------------------------------------------------------
# 2. Strict Zero-Warning Build
# -------------------------------------------------------------------------
Write-Output ""
Write-Output "--- [2/5] Zero-Warning Build (dotnet build PharmacyERP.sln --no-restore) ---"
$buildRes = Invoke-DotNetSafe -DotNetArgs @('build', 'PharmacyERP.sln', '--no-restore', '-m:1', '--disable-build-servers', '-p:EnableSourceControlManagerQueries=false', '-p:UseSharedCompilation=false')
$buildOutput = $buildRes.Output
$buildExit = $buildRes.ExitCode
Write-Output $buildOutput.Trim()

if ($buildExit -ne 0) {
    Record-Failure "dotnet build exited with code $buildExit."
}
elseif ($buildOutput -notmatch '0 Warning\(s\)') {
    Record-Failure "Build produced compiler warnings (Zero-Warning Policy requires '0 Warning(s)')."
}
else {
    Write-Output "[PASS] Build succeeded with 0 Error(s), 0 Warning(s)."
}

# -------------------------------------------------------------------------
# 3. Optional / Auto EF Core Pending Model Changes Check
# -------------------------------------------------------------------------
$efModelTouched = @($changedFiles | Where-Object {
    $_ -match 'src/PharmacyERP\.Domain/Entities/' -or
    $_ -match 'src/PharmacyERP\.Infrastructure/Persistence/'
}).Count -gt 0

Write-Output ""
Write-Output "--- [3/5] EF Core Model <-> Migrations Sync Check ---"
if ($CheckMigrations -or ($Full -and $efModelTouched)) {
    $efToolCheck = Invoke-DotNetSafe -DotNetArgs @('ef', '--version')
    if ($efToolCheck.ExitCode -eq 0) {
        $pendingRes = Invoke-DotNetSafe -DotNetArgs @(
            'ef', 'migrations', 'has-pending-model-changes',
            '--project', 'src/PharmacyERP.Infrastructure/PharmacyERP.Infrastructure.csproj',
            '--startup-project', 'src/PharmacyERP.Api/PharmacyERP.Api.csproj',
            '--no-build'
        )
        if ($pendingRes.ExitCode -ne 0) {
            Write-Output $pendingRes.Output.Trim()
            Record-Failure "EF Core detected pending model changes not covered by a migration."
        }
        else {
            Write-Output "[PASS] EF Core model is 100% synchronized with committed migrations."
        }
    }
    else {
        Write-Output "[INFO] dotnet-ef CLI not available in PATH; verify PharmacyDbContextModelSnapshot.cs manually."
    }
}
else {
    Write-Output "[SKIP] No Domain/Persistence model changes detected (pass -CheckMigrations to force)."
}

# -------------------------------------------------------------------------
# 4. Automated Test Execution (0 Failed, 0 Skipped)
# -------------------------------------------------------------------------
Write-Output ""
Write-Output "--- [4/5] Automated Tests ---"
if ($script:failed) {
    Write-Output "[SKIP] Skipping tests because build failed."
}
else {
    $testProjects = @(
        'tests/PharmacyERP.UnitTests/PharmacyERP.UnitTests.csproj'
    )
    if ($Full -or -not $UnitTestsOnly) {
        $testProjects += 'tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj'
    }

    $totalPassed = 0
    $totalSkipped = 0
    $anyProjectFailed = $false

    foreach ($proj in $testProjects) {
        $testArgs = @(
            'test', $proj,
            '--no-build',
            '-m:1',
            '--disable-build-servers',
            '--verbosity', 'minimal'
        )
        if (-not $Full -and -not [string]::IsNullOrWhiteSpace($FastFilter)) {
            $testArgs += @('--filter', $FastFilter)
        }

        Write-Output "Running: dotnet $($testArgs -join ' ')"
        $testRes = Invoke-DotNetSafe -DotNetArgs $testArgs
        $testOutput = $testRes.Output
        $testExit = $testRes.ExitCode
        Write-Output $testOutput.Trim()

        # When filtering across both projects, a project with 0 matching tests is OK if another project matches
        $noMatches = ($testOutput -match 'No test matches the given testcase filter')
        if ($testExit -ne 0 -and -not ($noMatches -and -not $Full -and -not [string]::IsNullOrWhiteSpace($FastFilter))) {
            Record-Failure "dotnet test failed for $proj (exit code $testExit)."
            $anyProjectFailed = $true
        }

        foreach ($m in [regex]::Matches($testOutput, 'Skipped:\s*(\d+)')) {
            $totalSkipped += [int]$m.Groups[1].Value
        }
        foreach ($m in [regex]::Matches($testOutput, 'Passed:\s*(\d+)')) {
            $totalPassed += [int]$m.Groups[1].Value
        }
    }

    if ($totalSkipped -gt 0) {
        Record-Failure "Detected $totalSkipped skipped test(s). Policy requires 0 Skipped (check ERP_IT_POSTGRES / PostgreSQL availability)."
    }

    if ($totalPassed -eq 0) {
        Record-Failure "Test run executed 0 passing tests (check FastFilter '$FastFilter')."
    }
    elseif (-not $anyProjectFailed -and $totalSkipped -eq 0) {
        Write-Output "[PASS] Tests passed ($totalPassed Passed, 0 Failed, 0 Skipped)."
    }
}

# -------------------------------------------------------------------------
# 5. Live API Boot-Check (Guaranteed Teardown via try/finally)
# -------------------------------------------------------------------------
Write-Output ""
Write-Output "--- [5/5] Live API Boot-Check ---"
if ($BootCheck -and -not $script:failed) {
    $baseUrl = "http://127.0.0.1:$BootPort"
    $stdoutLog = Join-Path ([System.IO.Path]::GetTempPath()) "pharmacyerp-boot-out-$PID.log"
    $stderrLog = Join-Path ([System.IO.Path]::GetTempPath()) "pharmacyerp-boot-err-$PID.log"
    $apiProc = $null

    $prevAspNetEnv = $env:ASPNETCORE_ENVIRONMENT
    $env:ASPNETCORE_ENVIRONMENT = 'Development'

    try {
        $apiProc = Start-Process -FilePath 'dotnet' `
            -ArgumentList @(
                'run',
                '--project', 'src/PharmacyERP.Api/PharmacyERP.Api.csproj',
                '--no-build',
                '--no-launch-profile',
                '--urls', $baseUrl
            ) `
            -WorkingDirectory (Get-Location).Path `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog `
            -PassThru `
            -NoNewWindow

        $jwksReady = $false
        $deadline = (Get-Date).AddSeconds(25)
        while ((Get-Date) -lt $deadline) {
            if ($apiProc.HasExited) {
                break
            }
            try {
                $resp = Invoke-WebRequest -Uri "$baseUrl/.well-known/jwks.json" -UseBasicParsing -TimeoutSec 3
                if ($resp.StatusCode -eq 200) {
                    $jwksReady = $true
                    break
                }
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        }

        if (-not $jwksReady) {
            $errText = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { '' }
            $outText = if (Test-Path $stdoutLog) { Get-Content $stdoutLog -Raw } else { '' }
            Record-Failure "API failed to answer GET /.well-known/jwks.json on $baseUrl within 25s. StdOut: $outText StdErr: $errText"
        }
        else {
            Write-Output "[PASS] GET /.well-known/jwks.json -> 200 OK"
            try {
                $swaggerResp = Invoke-WebRequest -Uri "$baseUrl/swagger/v1/swagger.json" -UseBasicParsing -TimeoutSec 5
                if ($swaggerResp.StatusCode -eq 200) {
                    Write-Output "[PASS] GET /swagger/v1/swagger.json -> 200 OK ($($swaggerResp.Content.Length) bytes)"
                }
                else {
                    Record-Failure "GET /swagger/v1/swagger.json returned HTTP $($swaggerResp.StatusCode)."
                }
            }
            catch {
                Record-Failure "GET /swagger/v1/swagger.json failed: $($_.Exception.Message)"
            }
        }
    }
    finally {
        if ($null -ne $apiProc -and -not $apiProc.HasExited) {
            try {
                Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue
                $apiProc.WaitForExit(5000) | Out-Null
            }
            catch { }
        }
        if ($null -eq $prevAspNetEnv) {
            Remove-Item Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
        }
        else {
            $env:ASPNETCORE_ENVIRONMENT = $prevAspNetEnv
        }
        Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
    }
}
else {
    Write-Output "[SKIP] Boot-check not requested (pass -BootCheck when API/DI/middleware/migrations change)."
}

Write-Output ""
if ($script:failed) {
    Write-Output "=== VERIFICATION RESULT: FAILED ==="
    exit 1
}

Write-Output "=== VERIFICATION RESULT: PASSED ==="
exit 0
