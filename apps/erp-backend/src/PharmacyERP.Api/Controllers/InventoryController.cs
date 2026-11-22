#nullable enable

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
        [FromQuery] BatchQualityStatus? status,
        [FromQuery] DateOnly? expiringBefore,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _queryService.GetBatchesAsync(productId, status, expiringBefore, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [HttpGet("balances")]
    [Authorize]
    public async Task<IActionResult> GetBalances(
        [FromQuery] Guid branchId,
        [FromQuery] Guid? productId,
        [FromQuery] Guid? locationId,
        [FromQuery] Guid? batchId,
        CancellationToken ct = default)
    {
        var result = await _queryService.GetBalancesAsync(branchId, productId, locationId, batchId, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [HttpGet("transactions")]
    [Authorize]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] Guid branchId,
        [FromQuery] InventoryTransactionType? type = null,
        [FromQuery] Guid? productId = null,
        [FromQuery] DateTimeOffset? fromDate = null,
        [FromQuery] DateTimeOffset? toDate = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _queryService.GetTransactionsAsync(
            branchId, type, productId, fromDate, toDate, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [HttpPost("adjustments")]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> PostAdjustment(
        [FromBody] CreateInventoryAdjustmentRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, _currentUser.TraceId);
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _adjustmentService.PostAdjustmentAsync(requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
