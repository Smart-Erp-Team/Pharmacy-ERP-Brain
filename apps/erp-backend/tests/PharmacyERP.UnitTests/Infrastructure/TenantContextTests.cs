using PharmacyERP.Infrastructure.Services.Context;

namespace PharmacyERP.UnitTests.Infrastructure;

public sealed class TenantContextTests
{
    [Fact]
    public void SetTenant_DisablesSystemBypassForTheRestOfTheRequest()
    {
        var tenant = new TenantContext();

        tenant.AllowSystemBypass();
        Assert.True(tenant.IsSystemBypassAllowed);
        Assert.True(tenant.IsSystemBypassEnabled);

        var organizationId = Guid.NewGuid();
        tenant.SetTenant(organizationId);

        Assert.Equal(organizationId, tenant.OrganizationId);
        Assert.True(tenant.IsTenantBound);
        Assert.False(tenant.IsSystemBypassAllowed);
        Assert.False(tenant.IsSystemBypassEnabled);
    }

    [Fact]
    public void AllowSystemBypass_DoesNotEnableBypassAfterTenantHasBeenBound()
    {
        var tenant = new TenantContext();
        tenant.SetTenant(Guid.NewGuid());

        tenant.AllowSystemBypass();

        Assert.False(tenant.IsSystemBypassAllowed);
        Assert.False(tenant.IsSystemBypassEnabled);
    }
}
