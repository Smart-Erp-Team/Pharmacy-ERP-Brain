using PharmacyERP.Application.Common.Interfaces.Context;

namespace PharmacyERP.Infrastructure.Services.Context;

public class TenantContext : ITenantContext
{
    public Guid? OrganizationId { get; private set; }
    public bool IsTenantBound => OrganizationId.HasValue;
    public bool IsSystemBypassAllowed { get; private set; }
    public bool IsSystemBypassEnabled { get; private set; }

    public void SetTenant(Guid organizationId)
    {
        if (organizationId == Guid.Empty)
        {
            throw new ArgumentException("OrganizationId cannot be empty.", nameof(organizationId));
        }

        OrganizationId = organizationId;
        // A system-level discovery transaction must not leave EF query filters disabled
        // after the request has been bound to a tenant.
        IsSystemBypassAllowed = false;
        IsSystemBypassEnabled = false;
    }

    public void AllowSystemBypass()
    {
        // A request that already has a tenant can do its discovery inside that tenant's
        // RLS boundary; it must not widen the request to cross-tenant access.
        if (IsTenantBound)
        {
            return;
        }

        IsSystemBypassAllowed = true;
        IsSystemBypassEnabled = true;
    }
}
