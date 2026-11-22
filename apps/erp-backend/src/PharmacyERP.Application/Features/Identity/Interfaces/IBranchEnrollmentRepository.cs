using PharmacyERP.Domain.Entities.Identity;

namespace PharmacyERP.Application.Features.Identity.Interfaces;

public interface IBranchEnrollmentRepository
{
    Task<Guid?> FindOrganizationIdByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default);
    Task<BranchEnrollment?> GetByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default);
    Task AddAsync(BranchEnrollment enrollment, CancellationToken ct = default);
}
