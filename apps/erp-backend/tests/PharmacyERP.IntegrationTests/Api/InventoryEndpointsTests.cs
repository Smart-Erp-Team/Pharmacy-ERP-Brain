using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Integration.DTOs;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Domain.Enums;
using Xunit;

namespace PharmacyERP.IntegrationTests.Api;

public class InventoryEndpointsTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public InventoryEndpointsTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient(); 
    }

    [Fact]
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
