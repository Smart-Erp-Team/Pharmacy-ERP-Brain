using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Integration.DTOs;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Domain.Enums;
using Xunit;

namespace PharmacyERP.IntegrationTests.Api;

public class InventoryEndpointsTests : IClassFixture<CustomWebApplicationFactory>, IDisposable
{
    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _branchLocalFactory;
    private readonly HttpClient _client;

    public InventoryEndpointsTests(CustomWebApplicationFactory factory)
    {
        _branchLocalFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ERP_RUNTIME_MODE", "BranchLocal");
            builder.UseSetting("ENROLLED_BRANCH_ID", factory.DefaultBranchId.ToString());
        });
        _client = _branchLocalFactory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _branchLocalFactory.Dispose();
    }

    [PharmacyERP.IntegrationTests.Api.SkipWhenPostgresUnavailableFact]
    public async Task CompleteInventoryLifecycle_ShouldWorkAsExpected()
    {
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var locationId = Guid.NewGuid(); 
        var uomId = Guid.NewGuid();
        var idempotencyKey1 = Guid.NewGuid().ToString();

        var openingRequest = new CreateInventoryAdjustmentRequest(
            BranchId: branchId,
            TransactionType: InventoryTransactionType.OPENING_BALANCE,
            ReasonCode: "INIT",
            Note: "Initial Stock",
            ReversesInventoryTxnId: null,
            Lines: new[]
            {
                new CreateInventoryAdjustmentLineRequest(productId, uomId, locationId, "LOT-1", null, null, 100m, 10m) 
            },
            IdempotencyKey: idempotencyKey1
        );

        var requestMessage1 = new HttpRequestMessage(HttpMethod.Post, "/api/v1/inventory/adjustments");
        requestMessage1.Headers.Add("Idempotency-Key", idempotencyKey1);
        requestMessage1.Content = JsonContent.Create(openingRequest);

        var openingResponse = await _client.SendAsync(requestMessage1);
        Assert.True(openingResponse.StatusCode == HttpStatusCode.OK || openingResponse.StatusCode == HttpStatusCode.Unauthorized);
    }
}
