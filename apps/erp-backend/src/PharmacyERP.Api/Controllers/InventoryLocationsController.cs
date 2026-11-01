using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
using PharmacyERP.Domain.Enums;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/inventory/locations")]
public class InventoryLocationsController : ControllerBase
{
    private readonly IInventoryLocationService _locationService;
    private readonly ICurrentUser _currentUser;

    public InventoryLocationsController(IInventoryLocationService locationService, ICurrentUser currentUser)
    {
        _locationService = locationService;
        _currentUser = currentUser;
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Pharmacist,Cashier")] 
    public async Task<IActionResult> GetLocations(
        [FromQuery] Guid branchId,
        [FromQuery] bool? isSellable,
        [FromQuery] bool includeInactive = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _locationService.GetPagedAsync(branchId, isSellable, includeInactive, page, pageSize, ct);
        return HandleResult(result);
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Pharmacist")] 
    public async Task<IActionResult> CreateLocation(
        [FromBody] CreateInventoryLocationRequest request,
        [FromHeader(Name = "Idempotency-Key")] string idempotencyKey, 
        CancellationToken ct)
    {
        
        var requestWithKey = request with { IdempotencyKey = idempotencyKey };
        var result = await _locationService.CreateAsync(requestWithKey, ct);
        return HandleResult(result);
    }

    [HttpPatch("{id:guid}")]
    [Authorize(Roles = "Admin,Pharmacist")] 
    public async Task<IActionResult> UpdateLocation(
        Guid id,
        [FromBody] UpdateInventoryLocationRequest request,
        [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
        CancellationToken ct)
    {
        var requestWithKey = request with { IdempotencyKey = idempotencyKey };
        var result = await _locationService.UpdateAsync(id, requestWithKey, ct);
        return HandleResult(result);
    }

   
    private IActionResult HandleResult<T>(Result<T> result)
    {
        if (result.IsSuccess)
        {
            return Ok(result.Value);
        }

        var statusCode = result.ErrorCode switch
        {
            ErrorCode.NOT_FOUND => 404,
            ErrorCode.FORBIDDEN_BRANCH => 403,
            ErrorCode.UNAUTHORIZED => 401,
            ErrorCode.OUT_OF_STOCK => 409,
            ErrorCode.VALIDATION_ERROR => 422,
            _ => 400
        };

        var errorResponse = new ApiErrorEnvelopeDto(
            Error: new ApiErrorBodyDto(
                Code: result.ErrorCode?.ToString() ?? ErrorCode.MALFORMED_REQUEST.ToString(),
                Message: result.ErrorMessage ?? string.Empty,
                Details: result.ErrorDetails ?? Array.Empty<ApiErrorDetailDto>(),
                TraceId: _currentUser.TraceId)
        );

        return StatusCode(statusCode, errorResponse);
    }
}