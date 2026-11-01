using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
using PharmacyERP.Domain.Enums;
using System;
using System.Threading;
using System.Threading.Tasks;

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
        [FromQuery] Guid organizationId,
        [FromQuery] Guid branchId,
        [FromQuery] Guid? productId,
        [FromQuery] DateTimeOffset? updatedSince,
        [FromQuery] long? cursor,
        [FromQuery] int pageSize = 100,
        CancellationToken ct = default)
    {
        var result = await _canonicalService.GetCanonicalInventoryAsync(
            organizationId, branchId, productId, updatedSince, cursor, pageSize, ct);

        if (result.IsSuccess) return Ok(result.Value);

        var statusCode = result.ErrorCode == ErrorCode.FORBIDDEN_BRANCH ? 403 : 400;
        return StatusCode(statusCode, new ApiErrorEnvelopeDto(
            new ApiErrorBodyDto(
                result.ErrorCode?.ToString() ?? ErrorCode.MALFORMED_REQUEST.ToString(),
                result.ErrorMessage ?? string.Empty,
                result.ErrorDetails ?? Array.Empty<ApiErrorDetailDto>(),
                _currentUser.TraceId)));
    }
}