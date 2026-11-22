using Microsoft.EntityFrameworkCore.Storage;

namespace PharmacyERP.Infrastructure.Persistence.UoW;

/// <summary>
/// Manages database transactions over <see cref="PharmacyDbContext"/> and binds transaction-local
/// PostgreSQL RLS session variables (<c>app.organization_id</c> or <c>app.system_bypass</c>)
/// immediately upon opening each transaction.
/// </summary>
public class UnitOfWork : IUnitOfWork
{
    private readonly PharmacyDbContext _dbContext;
    private readonly ITenantContext _tenantContext;
    private IDbContextTransaction? _currentTransaction;

    public UnitOfWork(PharmacyDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public bool HasActiveTransaction => _currentTransaction != null;

    public async Task BeginTransactionAsync(CancellationToken ct = default)
    {
        if (_currentTransaction != null)
        {
            throw new InvalidOperationException("A transaction is already active in this UnitOfWork.");
        }

        _currentTransaction = await _dbContext.Database.BeginTransactionAsync(ct);

        if (_dbContext.Database.IsRelational())
        {
            try
            {
                // Passing is_local = true scopes set_config to the current transaction so pooled Npgsql
                // connections can never leak tenant context or system bypass to a later request.
                if (_tenantContext.IsTenantBound && _tenantContext.OrganizationId.HasValue)
                {
                    var organizationIdText = _tenantContext.OrganizationId.Value.ToString();
                    await _dbContext.Database.ExecuteSqlInterpolatedAsync(
                        $"SELECT set_config('app.organization_id', {organizationIdText}, true);", ct);
                }
                else if (_tenantContext.IsSystemBypassAllowed)
                {
                    await _dbContext.Database.ExecuteSqlRawAsync(
                        "SELECT set_config('app.system_bypass', 'true', true);", ct);
                }
            }
            catch
            {
                await RollbackTransactionAsync(CancellationToken.None);
                throw;
            }
        }
    }

    public Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        return _dbContext.SaveChangesAsync(ct);
    }

    public async Task CommitTransactionAsync(CancellationToken ct = default)
    {
        if (_currentTransaction == null)
        {
            throw new InvalidOperationException("No active transaction to commit.");
        }

        try
        {
            await _dbContext.SaveChangesAsync(ct);
            await _currentTransaction.CommitAsync(ct);
        }
        catch
        {
            await RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
        finally
        {
            await DisposeTransactionAsync();
        }
    }

    public async Task RollbackTransactionAsync(CancellationToken ct = default)
    {
        if (_currentTransaction == null)
        {
            return;
        }

        try
        {
            // Always send ROLLBACK regardless of whether the request CancellationToken is already cancelled.
            await _currentTransaction.RollbackAsync(CancellationToken.None);
        }
        finally
        {
            await DisposeTransactionAsync();
            _dbContext.ChangeTracker.Clear();
        }
    }

    private async Task DisposeTransactionAsync()
    {
        if (_currentTransaction != null)
        {
            await _currentTransaction.DisposeAsync();
            _currentTransaction = null;
        }
    }

    public void Dispose()
    {
        _currentTransaction?.Dispose();
        _currentTransaction = null;
    }

    public async ValueTask DisposeAsync()
    {
        await DisposeTransactionAsync();
    }
}
