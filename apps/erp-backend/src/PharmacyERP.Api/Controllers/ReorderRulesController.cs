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
    [ProducesResponseType(typeof(ReorderRuleDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetReorderRule(Guid branchId, Guid productId, CancellationToken ct = default)
    {
        var result = await _service.GetReorderRuleAsync(branchId, productId, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }

    [AllowHeaderIdempotencyKey]
    [Authorize(Roles = "Admin,Pharmacist")]
    [HttpPut]
    [ProducesResponseType(typeof(ReorderRuleDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
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

        var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey) ? idempotencyKey.Trim() : request.IdempotencyKey?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(effectiveKey))
        {
            return ApiResultMapper.ToMissingIdempotencyKeyResult(this, _currentUser.TraceId);
        }

        var requestWithKey = request with { IdempotencyKey = effectiveKey };
        var result = await _service.UpsertReorderRuleAsync(branchId, productId, requestWithKey, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
