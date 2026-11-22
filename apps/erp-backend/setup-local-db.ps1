$ErrorActionPreference = "Stop"

Write-Host "=== PharmacyERP Local Database & Security Setup ===" -ForegroundColor Cyan

# 1. Verify psql is available in PATH
if (-not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
    Write-Error "psql tool was not found in PATH. Ensure PostgreSQL bin folder is added to Environment Variables."
    exit 1
}

# 2. Prompt for local postgres superuser password securely
$securePwd = Read-Host "Enter your local PostgreSQL (postgres) user password" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
$postgresPwd = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

$pgHost = "localhost"
$pgPort = "5432"
$dbName = "erp_db"
$migratorPwd = "DevMigratorPass123!"
$appPwd = "DevAppPass123!"

$infraProj = "src/PharmacyERP.Infrastructure/PharmacyERP.Infrastructure.csproj"
$apiProj = "src/PharmacyERP.Api/PharmacyERP.Api.csproj"
$sqlScript = "src/PharmacyERP.Infrastructure/Persistence/Security/provision_db_roles.sql"

$env:PGPASSWORD = $postgresPwd

try {
    # 3. Create erp_db database if it does not exist
    Write-Host "`n[1/5] Checking/Creating database '$dbName'..." -ForegroundColor Yellow
    $dbExists = psql -h $pgHost -p $pgPort -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'"
    if ($dbExists -ne "1") {
        psql -h $pgHost -p $pgPort -U postgres -c "CREATE DATABASE $dbName;" | Out-Null
        Write-Host "Database '$dbName' created." -ForegroundColor Green
    }
    else {
        Write-Host "Database '$dbName' already exists." -ForegroundColor Gray
    }

    # 4. Provision least-privilege roles (erp_migrator & erp_app)
    Write-Host "`n[2/5] Provisioning least-privilege roles (erp_migrator and erp_app)..." -ForegroundColor Yellow
    psql -h $pgHost -p $pgPort -U postgres -d $dbName `
        -v migrator_password="$migratorPwd" `
        -v app_password="$appPwd" `
        -f $sqlScript
    if ($LASTEXITCODE -ne 0) { throw "Failed to execute provision_db_roles.sql" }

    # 5. Auto-install dotnet-ef if missing, then apply EF Core Migrations & RLS policies
    Write-Host "`n[3/5] Applying EF Core Migrations and RLS policies..." -ForegroundColor Yellow
    if (-not (Get-Command "dotnet-ef" -ErrorAction SilentlyContinue)) {
        Write-Host "Installing dotnet-ef global tool..." -ForegroundColor Cyan
        dotnet tool install --global dotnet-ef
        $env:PATH += ";$env:USERPROFILE\.dotnet\tools"
    }

    $env:ERP_MIGRATOR_CONNECTION = "Host=$pgHost;Port=$pgPort;Database=$dbName;Username=erp_migrator;Password=$migratorPwd"
    dotnet ef database update --project $infraProj --startup-project $apiProj
    if ($LASTEXITCODE -ne 0) { throw "Failed to apply EF Core Migrations" }

    # 6. Initialize UserSecretsId if missing and save runtime connection string (erp_app)
    Write-Host "`n[4/5] Saving runtime connection string to dotnet user-secrets..." -ForegroundColor Yellow
    if (-not (Select-String -Path $apiProj -Pattern "<UserSecretsId>" -Quiet)) {
        dotnet user-secrets init --project $apiProj
        if ($LASTEXITCODE -ne 0) { throw "Failed to initialize user-secrets" }
    }

    $appConn = "Host=$pgHost;Port=$pgPort;Database=$dbName;Username=erp_app;Password=$appPwd"
    dotnet user-secrets set "ConnectionStrings:DefaultConnection" $appConn --project $apiProj
    if ($LASTEXITCODE -ne 0) { throw "Failed to save ConnectionStrings:DefaultConnection" }

    # 7. Configure environment variables for Integration Tests
    Write-Host "`n[5/5] Configuring environment variables for Integration Tests..." -ForegroundColor Yellow
    $itConn = "Host=$pgHost;Port=$pgPort;Database=postgres;Username=postgres;Password=$postgresPwd"
    [Environment]::SetEnvironmentVariable("ERP_IT_POSTGRES", $itConn, "User")
    $env:ERP_IT_POSTGRES = $itConn
    $env:ConnectionStrings__DefaultConnection = $appConn

    Write-Host "`n=== Setup Completed Successfully! ===" -ForegroundColor Green
    Write-Host "You can now run 'dotnet run --project src/PharmacyERP.Api' or 'dotnet test PharmacyERP.sln'." -ForegroundColor Cyan
}
finally {
    # Clean up sensitive passwords from current session memory
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ERP_MIGRATOR_CONNECTION -ErrorAction SilentlyContinue
}