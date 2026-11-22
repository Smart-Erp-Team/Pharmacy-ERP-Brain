using Microsoft.Extensions.Caching.Memory;

namespace PharmacyERP.Infrastructure.Auth;

/// <summary>
/// Validates the <c>security_stamp</c> claim of incoming JWTs against the database with a short
/// 30-second in-memory cache so deactivated users or rotated privileges take effect rapidly
/// (and immediately on the local node when <see cref="Invalidate"/> is called after mutations).
/// </summary>
public sealed class UserSecurityStampValidator : IUserSecurityStampValidator
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMemoryCache _cache;

    public UserSecurityStampValidator(IServiceScopeFactory scopeFactory, IMemoryCache cache)
    {
        _scopeFactory = scopeFactory;
        _cache = cache;
    }

    public async Task<bool> ValidateAsync(Guid organizationId, Guid userId, Guid securityStamp, CancellationToken ct = default)
    {
        if (organizationId == Guid.Empty || userId == Guid.Empty || securityStamp == Guid.Empty)
            return false;

        var cacheKey = CacheKey(organizationId, userId);
        if (!_cache.TryGetValue(cacheKey, out CachedSecurityState? state))
        {
            state = await LoadSecurityStateAsync(organizationId, userId, ct);
            _cache.Set(cacheKey, state, CacheTtl);
        }

        return state is not null && state.IsActive && state.SecurityStamp == securityStamp;
    }

    public void Invalidate(Guid organizationId, Guid userId)
    {
        if (organizationId == Guid.Empty || userId == Guid.Empty)
            return;

        _cache.Remove(CacheKey(organizationId, userId));
    }

    private async Task<CachedSecurityState?> LoadSecurityStateAsync(Guid organizationId, Guid userId, CancellationToken cancellationToken)
    {
        // Create an isolated DI scope because this validator is registered as a singleton for JWT Bearer events.
        using var scope = _scopeFactory.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var userRepository = scope.ServiceProvider.GetRequiredService<IUserAccountRepository>();

        tenantContext.SetTenant(organizationId);
        // Explicit read transaction binds app.organization_id for PostgreSQL FORCE ROW LEVEL SECURITY.
        await unitOfWork.BeginTransactionAsync(cancellationToken);
        try
        {
            var securityState = await userRepository.GetSecurityStateAsync(organizationId, userId, cancellationToken);
            await unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return securityState.HasValue
                ? new CachedSecurityState(securityState.Value.IsActive, securityState.Value.SecurityStamp)
                : null;
        }
        catch
        {
            if (unitOfWork.HasActiveTransaction)
                await unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    private static string CacheKey(Guid organizationId, Guid userId) => $"user-sec-stamp:{organizationId:N}:{userId:N}";

    private sealed record CachedSecurityState(bool IsActive, Guid SecurityStamp);
}
