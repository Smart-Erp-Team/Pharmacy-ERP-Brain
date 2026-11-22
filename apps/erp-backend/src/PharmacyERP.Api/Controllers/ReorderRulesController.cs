#nullable enable

namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/branches/{branchId:guid}/products/{productId:guid}/reorder-rule")]
public sealed class ReorderRulesController : ControllerBase
{
    private readonly IReorderRuleService _service;
    private readonly ICurrentUser _currentUser;

    public ReorderRulesController(
        IReorderRuleService service,
        ICurrentUser currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [Authorize(Roles = "Admin,Pharmacist,Cashier")]
    [HttpGet]
    public async Task<IActionResult> GetReorderRule(Guid branchId, Guid productId, CancellationToken ct = default)
    {
        var result = await _service.GetReorderRuleAsync(branchId, productId, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPut]
    public async Task<IActionResult> UpsertReorderRule(
        Guid branchId,
        Guid productId,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] UpsertReorderRuleRequest request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, _currentUser.TraceId);
        }

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey : request.IdempotencyKey ?? string.Empty;
        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _service.UpsertReorderRuleAsync(branchId, productId, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
