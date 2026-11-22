using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace PharmacyERP.Infrastructure.Persistence.Interceptors;

/// <summary>
/// EF Core command interceptor that acts as a defense-in-depth guardrail for PostgreSQL
/// <c>FORCE ROW LEVEL SECURITY</c>. Rejects any SQL command executed outside an active database
/// transaction or without a bound <c>OrganizationId</c> (unless explicit system bypass is active),
/// preventing accidental un-scoped queries when <c>set_config('app.organization_id', ..., true)</c>
/// has not been applied to the transaction.
/// </summary>
public class TenantRlsConnectionInterceptor : DbCommandInterceptor
{
    private readonly ITenantContext _tenantContext;

    public TenantRlsConnectionInterceptor(ITenantContext tenantContext)
    {
        _tenantContext = tenantContext;
    }

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        ValidateRlsAndTransactionGuard(command);
        return base.ReaderExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    {
        ValidateRlsAndTransactionGuard(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        ValidateRlsAndTransactionGuard(command);
        return base.NonQueryExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        ValidateRlsAndTransactionGuard(command);
        return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        ValidateRlsAndTransactionGuard(command);
        return base.ScalarExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result, CancellationToken cancellationToken = default)
    {
        ValidateRlsAndTransactionGuard(command);
        return base.ScalarExecutingAsync(command, eventData, result, cancellationToken);
    }

    private void ValidateRlsAndTransactionGuard(DbCommand command)
    {
        // Allow UnitOfWork's transaction-local GUC configuration commands (set_config('app.*')) through.
        if (string.IsNullOrWhiteSpace(command.CommandText) ||
            command.CommandText.Contains("set_config('app.", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        // System bypass is reserved for short discovery transactions (login/refresh/enrollment/outbox worker).
        if (_tenantContext.IsSystemBypassEnabled)
        {
            return;
        }

        // Transaction-local RLS GUCs (is_local = true) only take effect inside an explicit transaction.
        if (command.Transaction == null)
        {
            throw new InvalidOperationException("Database commands on tenant-scoped tables must be executed within an active transaction.");
        }

        if (!_tenantContext.IsTenantBound || !_tenantContext.OrganizationId.HasValue)
        {
            throw new UnauthorizedAccessException("Tenant context is not bound to a valid OrganizationId.");
        }
    }
}