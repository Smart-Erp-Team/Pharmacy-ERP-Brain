namespace PharmacyERP.Application.Features.Integration.Services.Implementations;

public class CanonicalCapabilitiesService : ICanonicalCapabilitiesService
{
    private readonly IRuntimeModeProvider _runtimeModeProvider;

    public CanonicalCapabilitiesService(IRuntimeModeProvider runtimeModeProvider)
    {
        _runtimeModeProvider = runtimeModeProvider;
    }

    public CanonicalCapabilitiesDto GetCapabilities()
    {
        var isCloud = _runtimeModeProvider.CurrentMode == ErpRuntimeMode.Cloud;

        return new CanonicalCapabilitiesDto(
            Stage: 1,
            RuntimeMode: _runtimeModeProvider.CurrentMode.ToString(),
            SupportedReads: isCloud ? new[] { "products", "inventory" } : Array.Empty<string>(),
            SupportedWrites: isCloud ? new[] { "configuration.products", "configuration.reorder-rules" } : Array.Empty<string>()
        );
    }
}