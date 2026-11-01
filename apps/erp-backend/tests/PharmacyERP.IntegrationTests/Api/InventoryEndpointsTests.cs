using System;
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
        Assert.Equal(HttpStatusCode.OK, openingResponse.StatusCode);

        
        var requestMessageDuplicate = new HttpRequestMessage(HttpMethod.Post, "/api/v1/inventory/adjustments");
        requestMessageDuplicate.Headers.Add("Idempotency-Key", idempotencyKey1);
        requestMessageDuplicate.Content = JsonContent.Create(openingRequest);

        var duplicateResponse = await _client.SendAsync(requestMessageDuplicate);
        Assert.Equal(HttpStatusCode.OK, duplicateResponse.StatusCode);

        
        var idempotencyKey2 = Guid.NewGuid().ToString();
        var adjustmentInRequest = openingRequest with
        {
            TransactionType = InventoryTransactionType.ADJUSTMENT_IN,
            IdempotencyKey = idempotencyKey2,
            Lines = new[]
            {
                new CreateInventoryAdjustmentLineRequest(productId, uomId, locationId, "LOT-1", null, null, 50m, 16m) 
            }
        };

        var requestMessage2 = new HttpRequestMessage(HttpMethod.Post, "/api/v1/inventory/adjustments");
        requestMessage2.Headers.Add("Idempotency-Key", idempotencyKey2);
        requestMessage2.Content = JsonContent.Create(adjustmentInRequest);

        await _client.SendAsync(requestMessage2);


        var canonicalResponse = await _client.GetAsync($"/api/v1/canonical/inventory?organizationId={Guid.Empty}&branchId={branchId}&productId={productId}");
        Assert.Equal(HttpStatusCode.OK, canonicalResponse.StatusCode);

      
        var canonicalData = await canonicalResponse.Content.ReadFromJsonAsync<PagedResult<CanonicalInventoryItemDto>>();

        Assert.NotNull(canonicalData);
        var item = canonicalData!.Items.First();
        Assert.Equal(150m, item.QuantityOnHandBase);
        Assert.Equal(12m, item.AverageUnitCostBase);
    }
}