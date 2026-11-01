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
[Route("api/v1/inventory")]
public class InventoryController : ControllerBase
{
    private readonly IInventoryQueryService _queryService;
    private readonly IInventoryAdjustmentService _adjustmentService;
    private readonly ICurrentUser _currentUser;

    public InventoryController(
        IInventoryQueryService queryService,
        IInventoryAdjustmentService adjustmentService,
        ICurrentUser currentUser)
    {
        _queryService = queryService;
        _adjustmentService = adjustmentService;
        _currentUser = currentUser;
    }

    [HttpGet("batches")] 
    [Authorize]
    public async Task<IActionResult> GetBatches(
        [FromQuery] Guid? productId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        return NotFound("Batch listing is not available through the current inventory query service.");
    }

    [HttpGet("balances")] 
    [Authorize]
    public async Task<IActionResult> GetBalances(
        [FromQuery] Guid branchId,
        [FromQuery] Guid? productId,
        [FromQuery] Guid? locationId,
        [FromQuery] Guid? batchId,
        CancellationToken ct)
    {
        var result = await _queryService.GetBalancesAsync(branchId, productId, locationId, batchId, ct);
        return HandleResult(result);
    }

    [HttpGet("transactions")] 
    [Authorize]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] Guid branchId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _queryService.GetTransactionsAsync(
            branchId, null, null, null, null, page, pageSize, ct);
        return HandleResult(result);
    }

    [HttpPost("adjustments")]
    [Authorize(Roles = "Admin,Pharmacist")] 
    public async Task<IActionResult> PostAdjustment(
        [FromBody] CreateInventoryAdjustmentRequest request,
        [FromHeader(Name = "Idempotency-Key")] string idempotencyKey, 
        CancellationToken ct)
    {
        var requestWithKey = request with { IdempotencyKey = idempotencyKey };
        
        var result = await _adjustmentService.PostAdjustmentAsync(requestWithKey, ct);
        return HandleResult(result);
    }

    private IActionResult HandleResult<T>(Result<T> result)
    {
        if (result.IsSuccess) return Ok(result.Value);
        
        var statusCode = result.ErrorCode switch
        {
            ErrorCode.NOT_FOUND => 404,
            ErrorCode.FORBIDDEN_BRANCH => 403,
            ErrorCode.UNAUTHORIZED => 401,
            ErrorCode.OUT_OF_STOCK => 409,
            ErrorCode.FORBIDDEN => 403,
            ErrorCode.VALIDATION_ERROR => 422,
            _ => 400
        };

        return StatusCode(statusCode, new ApiErrorEnvelopeDto(
            new ApiErrorBodyDto(
                result.ErrorCode?.ToString() ?? ErrorCode.MALFORMED_REQUEST.ToString(),
                result.ErrorMessage ?? string.Empty,
                result.ErrorDetails ?? Array.Empty<ApiErrorDetailDto>(),
                _currentUser.TraceId)));
    }
}