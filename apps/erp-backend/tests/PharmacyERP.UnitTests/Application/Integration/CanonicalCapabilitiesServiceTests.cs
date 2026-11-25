namespace PharmacyERP.UnitTests.Application.Integration;

public class CanonicalCapabilitiesServiceTests
{
    [Fact]
    public void GetCapabilities_WhenModeIsCloud_ReturnsCloudRuntimeMode()
    {
        var runtimeModeProviderMock = new Mock<IRuntimeModeProvider>();
        runtimeModeProviderMock.Setup(x => x.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        var service = new CanonicalCapabilitiesService(runtimeModeProviderMock.Object);

        var result = service.GetCapabilities();

        Assert.Equal("Cloud", result.RuntimeMode);
    }

    [Fact]
    public void GetCapabilities_WhenModeIsBranchLocal_ReturnsBranchLocalRuntimeModeWithEmptyCapabilities()
    {
        var runtimeModeProviderMock = new Mock<IRuntimeModeProvider>();
        runtimeModeProviderMock.Setup(x => x.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);
        var service = new CanonicalCapabilitiesService(runtimeModeProviderMock.Object);

        var result = service.GetCapabilities();

        Assert.Equal("BranchLocal", result.RuntimeMode);
        Assert.Empty(result.SupportedReads);
        Assert.Empty(result.SupportedWrites);
    }

    [Fact]
    public void GetCapabilities_AlwaysReturnsStageOne()
    {
        var runtimeModeProviderMock = new Mock<IRuntimeModeProvider>();
        runtimeModeProviderMock.Setup(x => x.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        var service = new CanonicalCapabilitiesService(runtimeModeProviderMock.Object);

        var result = service.GetCapabilities();

        Assert.Equal(1, result.Stage);
    }

    [Fact]
    public void GetCapabilities_ContainsExactSupportedReads()
    {
        var runtimeModeProviderMock = new Mock<IRuntimeModeProvider>();
        runtimeModeProviderMock.Setup(x => x.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        var service = new CanonicalCapabilitiesService(runtimeModeProviderMock.Object);

        var result = service.GetCapabilities();

        Assert.NotNull(result.SupportedReads);
        Assert.Equal(2, result.SupportedReads.Count);
        Assert.Contains("products", result.SupportedReads);
        Assert.Contains("inventory", result.SupportedReads);
    }

    [Fact]
    public void GetCapabilities_ContainsExactSupportedWrites()
    {
        var runtimeModeProviderMock = new Mock<IRuntimeModeProvider>();
        runtimeModeProviderMock.Setup(x => x.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        var service = new CanonicalCapabilitiesService(runtimeModeProviderMock.Object);

        var result = service.GetCapabilities();

        Assert.NotNull(result.SupportedWrites);
        Assert.Equal(2, result.SupportedWrites.Count);
        Assert.Contains("configuration.products", result.SupportedWrites);
        Assert.Contains("configuration.reorder-rules", result.SupportedWrites);
    }
}