namespace PharmacyERP.Api.Common;

/// <summary>
/// Maps application-layer <see cref="Result"/> and <see cref="Result{T}"/> outcomes to HTTP
/// <see cref="IActionResult"/> responses with standardized <see cref="ApiErrorEnvelopeDto"/> error bodies.
/// </summary>
internal static class ApiResultMapper
{
    public static IActionResult ToActionResult(ControllerBase controller, Result result, string traceId)
    {
        if (result.IsSuccess) return controller.NoContent();
        return ToErrorResult(
            controller,
            result.ErrorCode ?? ErrorCode.VALIDATION_ERROR,
            result.ErrorMessage ?? "Request failed.",
            traceId,
            result.ErrorDetails);
    }

    public static IActionResult ToActionResult<T>(ControllerBase controller, Result<T> result, string traceId)
    {
        if (result.IsSuccess) return controller.Ok(result.Value);
        return ToErrorResult(
            controller,
            result.ErrorCode ?? ErrorCode.VALIDATION_ERROR,
            result.ErrorMessage ?? "Request failed.",
            traceId,
            result.ErrorDetails);
    }

    public static IActionResult ToCreatedResult<T>(ControllerBase controller, Result<T> result, string traceId, string? locationUri = null)
    {
        if (result.IsSuccess)
        {
            return string.IsNullOrWhiteSpace(locationUri)
                ? controller.StatusCode(201, result.Value)
                : controller.Created(locationUri, result.Value);
        }

        return ToErrorResult(
            controller,
            result.ErrorCode ?? ErrorCode.VALIDATION_ERROR,
            result.ErrorMessage ?? "Request failed.",
            traceId,
            result.ErrorDetails);
    }

    public static IActionResult ToErrorResult(
        ControllerBase controller,
        ErrorCode code,
        string message,
        string traceId,
        IReadOnlyList<ApiErrorDetailDto>? details = null)
    {
        var status = MapStatusCode(code);
        var body = new ApiErrorEnvelopeDto(
            new ApiErrorBodyDto(
                code.ToString(),
                message,
                details ?? Array.Empty<ApiErrorDetailDto>(),
                traceId));
        return controller.StatusCode(status, body);
    }

    private static int MapStatusCode(ErrorCode code) => code switch
    {
        ErrorCode.MALFORMED_REQUEST => 400,
        ErrorCode.UNAUTHORIZED => 401,
        ErrorCode.FORBIDDEN or ErrorCode.FORBIDDEN_BRANCH => 403,
        ErrorCode.NOT_FOUND => 404,
        ErrorCode.CONFLICT or ErrorCode.INVALID_STATE_TRANSITION or ErrorCode.OUT_OF_STOCK or ErrorCode.IDEMPOTENCY_MISMATCH => 409,
        ErrorCode.VALIDATION_ERROR or ErrorCode.EXPIRY_POLICY_VIOLATION => 422,
        _ => 500
    };
}
