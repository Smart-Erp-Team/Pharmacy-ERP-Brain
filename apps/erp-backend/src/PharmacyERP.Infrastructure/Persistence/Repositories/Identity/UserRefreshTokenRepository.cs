namespace PharmacyERP.Infrastructure.Persistence.Repositories.Identity;

/// <summary>
/// Persists and locks (<c>SELECT ... FOR UPDATE</c>) refresh token rows to serialize concurrent
/// rotation attempts and support atomic token-family revocation on reuse detection or logout.
/// </summary>
public sealed class UserRefreshTokenRepository : IUserRefreshTokenRepository
{
    private readonly PharmacyDbContext _db;
    public UserRefreshTokenRepository(PharmacyDbContext db) => _db = db;

    public async Task<Guid?> FindOrganizationIdByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default)
    {
        var orgId = await _db.UserRefreshTokens
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(x => x.TokenHash == tokenHash)
            .Select(x => (Guid?)x.OrganizationId)
            .FirstOrDefaultAsync(ct);

        return orgId;
    }

    public async Task<UserRefreshToken?> GetByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default)
    {
        UserRefreshToken? token;
        if (_db.Database.IsRelational())
        {
            var rows = await _db.UserRefreshTokens
                .FromSqlInterpolated($"SELECT * FROM identity.\"USER_REFRESH_TOKEN\" WHERE token_hash = {tokenHash} LIMIT 1 FOR UPDATE")
                .IgnoreQueryFilters()
                .ToListAsync(ct);
            token = rows.FirstOrDefault();
        }
        else
        {
            token = await _db.UserRefreshTokens
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.TokenHash == tokenHash, ct);
        }

        if (token != null)
        {
            await _db.Entry(token).Reference(x => x.UserAccount).Query().IgnoreQueryFilters().LoadAsync(ct);
            if (token.UserAccount != null)
            {
                await _db.Entry(token.UserAccount).Reference(x => x.Employee).Query().IgnoreQueryFilters().LoadAsync(ct);
                await _db.Entry(token.UserAccount).Collection(x => x.BranchAccesses).Query().IgnoreQueryFilters().LoadAsync(ct);
            }
        }

        return token;
    }

    public async Task RevokeFamilyAsync(Guid organizationId, Guid tokenFamilyId, DateTimeOffset revokedAt, CancellationToken ct = default)
    {
        if (_db.Database.IsRelational())
        {
            await _db.UserRefreshTokens
                .Where(x => x.OrganizationId == organizationId
                         && x.TokenFamilyId == tokenFamilyId
                         && x.RevokedAt == null
                         && x.ExpiresAt > revokedAt)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, revokedAt), ct);
            return;
        }

        var family = await _db.UserRefreshTokens
            .Where(x => x.OrganizationId == organizationId
                     && x.TokenFamilyId == tokenFamilyId
                     && x.RevokedAt == null
                     && x.ExpiresAt > revokedAt)
            .ToListAsync(ct);
        foreach (var token in family) token.Revoke(revokedAt);
    }

    public async Task RevokeAllUserTokensAsync(Guid organizationId, Guid userId, DateTimeOffset revokedAt, CancellationToken ct = default)
    {
        if (_db.Database.IsRelational())
        {
            await _db.UserRefreshTokens
                .Where(x => x.OrganizationId == organizationId
                         && x.UserId == userId
                         && x.RevokedAt == null
                         && x.ExpiresAt > revokedAt)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, revokedAt), ct);
            return;
        }

        var tokens = await _db.UserRefreshTokens
            .Where(x => x.OrganizationId == organizationId
                     && x.UserId == userId
                     && x.RevokedAt == null
                     && x.ExpiresAt > revokedAt)
            .ToListAsync(ct);
        foreach (var token in tokens) token.Revoke(revokedAt);
    }

    public async Task AddAsync(UserRefreshToken token, CancellationToken ct = default)
        => await _db.UserRefreshTokens.AddAsync(token, ct);
}
