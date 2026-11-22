namespace PharmacyERP.Application.Features.Identity.Interfaces;

public interface IUserSecurityStampValidator
{
    Task<bool> ValidateAsync(Guid organizationId, Guid userId, Guid securityStamp, CancellationToken ct = default);
    void Invalidate(Guid organizationId, Guid userId);
}
