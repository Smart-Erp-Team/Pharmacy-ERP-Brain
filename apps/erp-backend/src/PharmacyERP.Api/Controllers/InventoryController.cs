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
        [FromQuery(Name = "product_id")] Guid? productId,
        [FromQuery(Name = "status")] BatchQualityStatus? status,
        [FromQuery(Name = "expiring_before")] DateOnly? expiringBefore,
        [FromQuery(Name = "page")] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _queryService.GetBatchesAsync(productId, status, expiringBefore, page, pageSize, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [HttpGet("balances")]
    [Authorize]
    public async Task<IActionResult> GetBalances(
        [FromQuery(Name = "branch_id")] Guid branchId,
        [FromQuery(Name = "product_id")] Guid? productId,
        [FromQuery(Name = "location_id")] Guid? locationId,
        [FromQuery(Name = "batch_id")] Guid? batchId,
        CancellationToken ct = default)
    {
        var result = await _queryService.GetBalancesAsync(branchId, productId, locationId, batchId, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [HttpGet("transactions")]
    [Authorize]
    public async Task<IActionResult> GetTransactions(
        [FromQuery(Name = "branch_id")] Guid branchId,
        [FromQuery(Name = "type")] InventoryTransactionType? type = null,
        [FromQuery(Name = "product_id")] Guid? productId = null,
        [FromQuery(Name = "from_date")] DateTimeOffset? fromDate = null,
        [FromQuery(Name = "to_date")] DateTimeOffset? toDate = null,
        [FromQuery(Name = "page")] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 20,
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

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey.Trim() : request.IdempotencyKey?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(effectiveKey))
        {
            return ApiResultMapper.ToMissingIdempotencyKeyResult(this, _currentUser.TraceId);
        }

        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _adjustmentService.PostAdjustmentAsync(requestWithKey, ct);
        var locationUri = result.IsSuccess ? $"/api/v1/inventory/transactions/{result.Value!.InventoryTxnId}" : null;
        return ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri);
    }
}
