#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyERP.Api.Common;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/canonical/inventory")]
public class CanonicalInventoryController : ControllerBase
{
    private readonly ICanonicalInventoryService _canonicalService;
    private readonly ICurrentUser _currentUser;

    public CanonicalInventoryController(ICanonicalInventoryService canonicalService, ICurrentUser currentUser)
    {
        _canonicalService = canonicalService;
        _currentUser = currentUser;
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetCanonicalInventory(
        [FromQuery(Name = "organization_id")] Guid? organizationId,
        [FromQuery(Name = "branch_id")] Guid branchId,
        [FromQuery(Name = "product_id")] Guid? productId,
        [FromQuery(Name = "updated_since")] DateTimeOffset? updatedSince,
        [FromQuery(Name = "cursor")] long? cursor,
        [FromQuery(Name = "limit")] int limit = 100,
        CancellationToken ct = default)
    {
        var result = await _canonicalService.GetCanonicalInventoryAsync(
            organizationId ?? Guid.Empty, branchId, productId, updatedSince, cursor, limit, ct);

        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
