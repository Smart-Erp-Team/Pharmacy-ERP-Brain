using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Identity.Interfaces;

namespace PharmacyERP.Infrastructure.Auth;

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

    private async Task<CachedSecurityState?> LoadSecurityStateAsync(Guid organizationId, Guid userId, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var userRepository = scope.ServiceProvider.GetRequiredService<IUserAccountRepository>();

        tenantContext.SetTenant(organizationId);
        await unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var result = await userRepository.GetSecurityStateAsync(organizationId, userId, ct);
            await unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return result.HasValue ? new CachedSecurityState(result.Value.IsActive, result.Value.SecurityStamp) : null;
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
