using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Identity;

public sealed class BranchEnrollmentRepository : IBranchEnrollmentRepository
{
    private readonly PharmacyDbContext _db;
    public BranchEnrollmentRepository(PharmacyDbContext db) => _db = db;

    public async Task<Guid?> FindOrganizationIdByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default)
    {
        var orgId = await _db.BranchEnrollments
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(x => x.TokenHash == tokenHash)
            .Select(x => (Guid?)x.OrganizationId)
            .FirstOrDefaultAsync(ct);

        return orgId;
    }

    public async Task<BranchEnrollment?> GetByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default)
    {
        BranchEnrollment? enrollment;
        if (_db.Database.IsRelational())
        {
            var rows = await _db.BranchEnrollments
                .FromSqlInterpolated($"SELECT * FROM identity.\"BRANCH_ENROLLMENT\" WHERE token_hash = {tokenHash} LIMIT 1 FOR UPDATE")
                .IgnoreQueryFilters()
                .ToListAsync(ct);
            enrollment = rows.FirstOrDefault();
        }
        else
        {
            enrollment = await _db.BranchEnrollments
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.TokenHash == tokenHash, ct);
        }

        if (enrollment != null)
        {
            await _db.Entry(enrollment).Reference(x => x.Branch).Query().IgnoreQueryFilters().LoadAsync(ct);
        }

        return enrollment;
    }

    public async Task AddAsync(BranchEnrollment enrollment, CancellationToken ct = default)
        => await _db.BranchEnrollments.AddAsync(enrollment, ct);
}
