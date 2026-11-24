using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.Exceptions;
using PharmacyERP.Domain.Exceptions;

namespace PharmacyERP.Api.Middleware;

/// <summary>
/// Global HTTP exception middleware that translates domain, application, EF Core concurrency,
/// and PostgreSQL SQLSTATE exceptions into standardized <see cref="ApiErrorEnvelopeDto"/> responses.
/// </summary>
public class ExceptionHandlingMiddleware
{
    public const string HandledExceptionItemKey = "__PharmacyErp_HandledException";

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException exception) when (context.RequestAborted.IsCancellationRequested)
        {
            _logger.LogInformation(exception, "Request was cancelled by the client.");
        }
        catch (Exception exception)
        {
            context.Items[HandledExceptionItemKey] = exception;
            _logger.LogError(exception, "An unhandled exception occurred during request processing.");
            await HandleExceptionAsync(context, exception);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        if (context.Response.HasStarted || context.RequestAborted.IsCancellationRequested)
        {
            return;
        }

        var (statusCode, errorCode, message, details) = MapException(exception);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var traceId = context.Items["TraceId"]?.ToString() ?? context.TraceIdentifier ?? Guid.NewGuid().ToString();

        var errorBody = new ApiErrorBodyDto(errorCode, message, details, traceId);
        var errorEnvelope = new ApiErrorEnvelopeDto(errorBody);

        var serializedError = JsonSerializer.Serialize(errorEnvelope, DependencyInjection.ApiJsonSerializerOptions);
        await context.Response.WriteAsync(serializedError, context.RequestAborted);
    }

    private static (HttpStatusCode StatusCode, string ErrorCode, string Message, IReadOnlyList<ApiErrorDetailDto> Details) MapException(Exception exception)
    {
        IReadOnlyList<ApiErrorDetailDto> emptyDetails = Array.Empty<ApiErrorDetailDto>();

        switch (exception)
        {
            case ValidationException validationException:
                var validationDetails = validationException.Errors
                    .SelectMany(entry => (entry.Value ?? Array.Empty<string>())
                        .Select(errorMessage => new ApiErrorDetailDto(entry.Key, errorMessage)))
                    .ToList();
                return (HttpStatusCode.UnprocessableEntity, ErrorCode.VALIDATION_ERROR.ToString(), validationException.Message, validationDetails);

            case AppException appException:
                return (MapErrorCodeToHttpStatus(appException.ErrorCode), appException.ErrorCode.ToString(), appException.Message, appException.Details);

            case IntegrationDomainException integrationException when string.Equals(integrationException.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase)
                                                    || integrationException.GetType().Name.Contains("IdempotencyMismatch", StringComparison.OrdinalIgnoreCase):
                return (HttpStatusCode.Conflict, ErrorCode.IDEMPOTENCY_MISMATCH.ToString(), integrationException.Message, emptyDetails);

            case DomainException domainException:
                return (HttpStatusCode.UnprocessableEntity, ErrorCode.VALIDATION_ERROR.ToString(), domainException.Message, emptyDetails);

            // Optimistic concurrency token (row_version) mismatch surfaced by EF Core.
            case DbUpdateConcurrencyException:
                return (HttpStatusCode.Conflict, ErrorCode.CONFLICT.ToString(), "The resource was modified by another concurrent request. Please retry.", emptyDetails);

            // PostgreSQL serialization_failure (40001) and deadlock_detected (40P01) map to retryable 409 Conflict.
            case PostgresException postgresException when postgresException.SqlState is "40001" or "40P01":
            case DbUpdateException dbUpdateException when dbUpdateException.InnerException is PostgresException { SqlState: "40001" or "40P01" }:
                return (HttpStatusCode.Conflict, ErrorCode.CONFLICT.ToString(), "The request conflicted with a concurrent transaction. Please retry.", emptyDetails);

            // PostgreSQL unique_violation (23505) maps to 409 Conflict.
            case PostgresException postgresUniqueException when postgresUniqueException.SqlState == "23505":
            case DbUpdateException dbUniqueException when dbUniqueException.InnerException is PostgresException { SqlState: "23505" }:
                return (HttpStatusCode.Conflict, ErrorCode.CONFLICT.ToString(), "A conflicting record with the same unique value already exists.", emptyDetails);

            case JsonException:
                return (HttpStatusCode.BadRequest, ErrorCode.MALFORMED_REQUEST.ToString(), "Malformed JSON request payload.", emptyDetails);

            case UnauthorizedAccessException:
                return (HttpStatusCode.Forbidden, ErrorCode.FORBIDDEN.ToString(), "You do not have permission to perform this action.", emptyDetails);

            case KeyNotFoundException notFoundException:
                return (HttpStatusCode.NotFound, ErrorCode.NOT_FOUND.ToString(), notFoundException.Message, emptyDetails);

            default:
                return (HttpStatusCode.InternalServerError, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.", emptyDetails);
        }
    }

    private static HttpStatusCode MapErrorCodeToHttpStatus(ErrorCode code) => code switch
    {
        ErrorCode.MALFORMED_REQUEST => HttpStatusCode.BadRequest,
        ErrorCode.UNAUTHORIZED => HttpStatusCode.Unauthorized,
        ErrorCode.FORBIDDEN => HttpStatusCode.Forbidden,
        ErrorCode.FORBIDDEN_BRANCH => HttpStatusCode.Forbidden,
        ErrorCode.NOT_FOUND => HttpStatusCode.NotFound,
        ErrorCode.CONFLICT => HttpStatusCode.Conflict,
        ErrorCode.INVALID_STATE_TRANSITION => HttpStatusCode.Conflict,
        ErrorCode.OUT_OF_STOCK => HttpStatusCode.Conflict,
        ErrorCode.IDEMPOTENCY_MISMATCH => HttpStatusCode.Conflict,
        ErrorCode.VALIDATION_ERROR => HttpStatusCode.UnprocessableEntity,
        ErrorCode.EXPIRY_POLICY_VIOLATION => HttpStatusCode.UnprocessableEntity,
        _ => HttpStatusCode.InternalServerError
    };
}
