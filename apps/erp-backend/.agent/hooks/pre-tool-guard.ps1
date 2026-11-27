#Requires -Version 5.1
<#
.SYNOPSIS
    Deterministic PreToolUse safety guardrail for apps/erp-backend/.
.DESCRIPTION
    Reads Antigravity PreToolUse JSON payload from stdin and returns camelCase JSON:
      {"decision":"allow"} or {"decision":"deny","reason":"..."}
    Enforces:
      1. Wave 0 immutable root files (Program.cs, PharmacyDbContext.cs, ERP-Backend-Blueprint-v1.1.md).
      2. Strict monorepo write containment (apps/erp-backend/, repo-root contracts/, or Antigravity artifactDirectoryPath).
      3. Secret file protection (.env, *.pem, *.key, *.pfx, appsettings.Secrets.json).
      4. Forbidden destructive/remote shell commands (git push, reset --hard, clean -f, DROP DATABASE, rm -rf, global installs).
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Decision {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('allow', 'deny', 'ask', 'force_ask')][string]$Decision,
        [string]$Reason = ''
    )

    if ([string]::IsNullOrWhiteSpace($Reason)) {
        $obj = @{ decision = $Decision }
    }
    else {
        $obj = @{ decision = $Decision; reason = $Reason }
    }
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    exit 0
}

function Normalize-FullPath {
    param([string]$InputPath, [string]$BaseDir)
    if ([string]::IsNullOrWhiteSpace($InputPath)) { return $null }
    try {
        if ([System.IO.Path]::IsPathRooted($InputPath)) {
            $full = [System.IO.Path]::GetFullPath($InputPath)
        }
        elseif (-not [string]::IsNullOrWhiteSpace($BaseDir)) {
            $full = [System.IO.Path]::GetFullPath((Join-Path $BaseDir $InputPath))
        }
        else {
            $full = [System.IO.Path]::GetFullPath($InputPath)
        }
        return $full.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
    }
    catch {
        return $InputPath.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
    }
}

try {
    $rawInput = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($rawInput)) {
        Write-Decision -Decision 'allow'
    }

    $payload = $rawInput | ConvertFrom-Json
    $toolCall = $payload.toolCall
    if ($null -eq $toolCall) {
        Write-Decision -Decision 'allow'
    }

    $toolName = [string]$toolCall.name
    $argsObj = $toolCall.args

    # Resolve backend root (parent of .agent/) and repo root (two levels above apps/erp-backend/)
    $agentDir = Split-Path -Parent $PSScriptRoot
    $backendRoot = Normalize-FullPath -InputPath (Split-Path -Parent $agentDir) -BaseDir ''
    $appsDir = Split-Path -Parent (Split-Path -Parent $agentDir)
    $repoRoot = Normalize-FullPath -InputPath (Split-Path -Parent $appsDir) -BaseDir ''
    $sharedContractsRoot = "$repoRoot/contracts"

    $artifactRoot = $null
    if ($payload.PSObject.Properties.Name -contains 'artifactDirectoryPath' -and -not [string]::IsNullOrWhiteSpace([string]$payload.artifactDirectoryPath)) {
        $artifactRoot = Normalize-FullPath -InputPath ([string]$payload.artifactDirectoryPath) -BaseDir ''
    }

    $cwd = if ($payload.PSObject.Properties.Name -contains 'cwd') { [string]$payload.cwd } else { (Split-Path -Parent $agentDir) }

    # -------------------------------------------------------------------------
    # 1. File Write / Edit Protection
    # -------------------------------------------------------------------------
    $writeTools = @(
        'write_file',
        'edit_file',
        'write_to_file',
        'replace_file_content',
        'multi_replace_file_content'
    )

    if ($writeTools -contains $toolName -and $null -ne $argsObj) {
        $targetPathRaw = $null
        foreach ($propName in @('Path', 'TargetFile', 'AbsolutePath', 'path', 'target_file', 'file_path')) {
            if ($argsObj.PSObject.Properties.Name -contains $propName) {
                $val = [string]$argsObj.$propName
                if (-not [string]::IsNullOrWhiteSpace($val)) {
                    $targetPathRaw = $val
                    break
                }
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($targetPathRaw)) {
            $normTarget = Normalize-FullPath -InputPath $targetPathRaw -BaseDir $cwd
            $fileName = [System.IO.Path]::GetFileName($normTarget)

            # 1a. Frozen / Wave 0 immutable files
            if ($fileName -eq 'erp-backend-blueprint-v1.1.md') {
                Write-Decision -Decision 'deny' -Reason 'Blocked by backend-safety-guard: ERP-Backend-Blueprint-v1.1.md is frozen reference-only and must never be edited.'
            }

            if ($normTarget.EndsWith('/src/pharmacyerp.api/program.cs')) {
                Write-Decision -Decision 'deny' -Reason 'Blocked by backend-safety-guard (Wave 0): src/PharmacyERP.Api/Program.cs must remain untouched. Register services in DependencyInjection.cs (or modular feature DI) and middleware in MiddlewareExtensions.cs.'
            }

            if ($normTarget.EndsWith('/src/pharmacyerp.infrastructure/persistence/database/pharmacydbcontext.cs')) {
                Write-Decision -Decision 'deny' -Reason 'Blocked by backend-safety-guard (Wave 0): PharmacyDbContext.cs must remain untouched. Add DbSet<T> properties in a module partial class (e.g. PharmacyDbContext.Sales.cs).'
            }

            # 1b. Secret / credential files
            if ($fileName -match '^\.env(\.|$)' -or $fileName -match '\.(pem|key|pfx|p12)$' -or $fileName -eq 'appsettings.secrets.json') {
                Write-Decision -Decision 'deny' -Reason "Blocked by backend-safety-guard: Direct modification of secret/env file '$fileName' is forbidden."
            }

            # 1c. Strict workspace containment
            $inBackend = ($normTarget -eq $backendRoot -or $normTarget.StartsWith("$backendRoot/"))
            $inSharedContracts = ($normTarget -eq $sharedContractsRoot -or $normTarget.StartsWith("$sharedContractsRoot/"))
            $inArtifacts = ($null -ne $artifactRoot -and ($normTarget -eq $artifactRoot -or $normTarget.StartsWith("$artifactRoot/")))

            if (-not ($inBackend -or $inSharedContracts -or $inArtifacts)) {
                Write-Decision -Decision 'deny' -Reason "Blocked by backend-safety-guard: Target path '$targetPathRaw' is outside apps/erp-backend/ and shared contracts/."
            }
        }
    }

    # -------------------------------------------------------------------------
    # 2. Shell Command Protection
    # -------------------------------------------------------------------------
    if ($toolName -eq 'run_command' -and $null -ne $argsObj) {
        $cmdLine = ''
        foreach ($propName in @('CommandLine', 'commandLine', 'command', 'Command')) {
            if ($argsObj.PSObject.Properties.Name -contains $propName) {
                $cmdLine = [string]$argsObj.$propName
                break
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($cmdLine)) {
            $blockedPatterns = @(
                @{ Pattern = '(?i)\bgit\s+push\b'; Message = 'git push is forbidden for AI agents. The developer must review git diff and push manually.' },
                @{ Pattern = '(?i)\bgit\s+reset\s+--hard\b'; Message = 'git reset --hard is forbidden.' },
                @{ Pattern = '(?i)\bgit\s+clean\s+-[a-z]*f'; Message = 'git clean -f/-fd/-fdx is forbidden.' },
                @{ Pattern = '(?i)\bgit\s+checkout\s+--\s+\.'; Message = 'git checkout -- . is forbidden.' },
                @{ Pattern = '(?i)\bgit\s+branch\s+-D\b'; Message = 'git branch -D (force delete) is forbidden.' },
                @{ Pattern = '(?i)\brm\s+-[a-z]*r[a-z]*f\b|\brm\s+-[a-z]*f[a-z]*r\b'; Message = 'Recursive force deletion (rm -rf) is forbidden.' },
                @{ Pattern = '(?i)\bRemove-Item\b(?=.*-Recurse)(?=.*-Force)'; Message = 'Recursive force deletion (Remove-Item -Recurse -Force) is forbidden.' },
                @{ Pattern = '(?i)\b(rmdir|rd)\s+/s\b|\bdel\s+/f\s+/s\b'; Message = 'Recursive deletion (rmdir /s or del /f /s) is forbidden.' },
                @{ Pattern = '(?i)\b(DROP\s+DATABASE|DROP\s+SCHEMA|TRUNCATE\s+TABLE)\b'; Message = 'Destructive SQL (DROP DATABASE/SCHEMA, TRUNCATE TABLE) is forbidden against persistent databases.' },
                @{ Pattern = '(?i)\b(winget|choco|scoop)\s+install\b|\bnpm\s+install\s+.*-g\b|\bdotnet\s+tool\s+install\s+.*-g\b'; Message = 'Global OS or tool installation is forbidden.' }
            )

            foreach ($rule in $blockedPatterns) {
                if ($cmdLine -match $rule.Pattern) {
                    Write-Decision -Decision 'deny' -Reason "Blocked by backend-safety-guard: $($rule.Message)"
                }
            }
        }
    }

    Write-Decision -Decision 'allow'
}
catch {
    # Fail closed on unexpected internal script errors only for destructive safety? No — report clearly and ask user.
    Write-Decision -Decision 'ask' -Reason "backend-safety-guard encountered a parsing error and requests confirmation: $($_.Exception.Message)"
}
