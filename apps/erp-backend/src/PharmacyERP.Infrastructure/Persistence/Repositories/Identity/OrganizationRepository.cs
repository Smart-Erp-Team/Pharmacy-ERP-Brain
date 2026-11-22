namespace PharmacyERP.Infrastructure.Persistence.Repositories.Identity;

public sealed class OrganizationRepository : IOrganizationRepository
{
    private readonly PharmacyDbContext _db;

    public OrganizationRepository(PharmacyDbContext db) => _db = db;

    public Task<Organization?> GetActiveByCodeAsync(string organizationCode, CancellationToken ct = default)
    {
        var code = organizationCode.Trim();
        return _db.Organizations.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(x => x.IsActive && x.OrganizationCode.ToUpper() == code.ToUpper(), ct);
    }

    public Task<bool> ExistsByCodeAsync(string organizationCode, CancellationToken ct = default)
    {
        var code = organizationCode.Trim();
        return _db.Organizations.IgnoreQueryFilters()
            .AnyAsync(x => x.OrganizationCode.ToUpper() == code.ToUpper(), ct);
    }

    public async Task AddAsync(Organization organization, CancellationToken ct = default)
        => await _db.Organizations.AddAsync(organization, ct);
}
