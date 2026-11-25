namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/employees")]
public sealed class EmployeesController : ControllerBase
{
    private readonly IEmployeeService _service;
    private readonly ICurrentUser _currentUser;
    public EmployeesController(IEmployeeService service, ICurrentUser currentUser) { _service = service; _currentUser = currentUser; }

    [Authorize(Roles = "Admin,Pharmacist"), HttpGet]
    public async Task<IActionResult> GetPaged(
        [FromQuery(Name = "branch_id")] Guid? branchId,
        [FromQuery(Name = "include_inactive")] bool includeInactive = false,
        [FromQuery(Name = "search")] string? search = null,
        [FromQuery(Name = "page")] int page = 1,
        [FromQuery(Name = "page_size")] int pageSize = 25,
        CancellationToken ct = default)
        => ApiResultMapper.ToActionResult(this, await _service.GetPagedAsync(branchId, includeInactive, search, page, pageSize, ct), _currentUser.TraceId);

    [AllowHeaderIdempotencyKey]
    [Authorize(Policy = "AdminOnly"), HttpPost]
    public async Task<IActionResult> Create(
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] CreateEmployeeRequest request,
        CancellationToken ct)
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

        var result = await _service.CreateAsync(request with { IdempotencyKey = effectiveKey }, ct);
        var locationUri = result.IsSuccess ? $"/api/v1/employees/{result.Value!.EmployeeId}" : null;
        return ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri);
    }

    [Authorize(Roles = "Admin,Pharmacist"), HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
        => ApiResultMapper.ToActionResult(this, await _service.GetByIdAsync(id, ct), _currentUser.TraceId);

    [AllowHeaderIdempotencyKey]
    [Authorize(Policy = "AdminOnly"), HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        [FromBody] UpdateEmployeeRequest request,
        CancellationToken ct)
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

        var result = await _service.UpdateAsync(id, request with { IdempotencyKey = effectiveKey }, ct);
        return ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId);
    }
}
