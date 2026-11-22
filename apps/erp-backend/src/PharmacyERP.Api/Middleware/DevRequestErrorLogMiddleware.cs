using System.Diagnostics;
using System.Security.Claims;
using System.Text;

namespace PharmacyERP.Api.Middleware;

/// <summary>
/// Development-only diagnostic middleware that buffers HTTP error responses (<c>&gt;= 400</c>)
/// and unhandled exceptions, appending structured JSONL entries via <see cref="IDevRequestErrorLogWriter"/>
/// without altering the client response.
/// </summary>
public sealed class DevRequestErrorLogMiddleware
{
    public const int MaxResponseBodyLength = 2000;
    private const int MaxStackTraceLength = 4000;
    private const string TruncationSuffix = "...[truncated]";

    private readonly RequestDelegate _next;
    private readonly IDevRequestErrorLogWriter _logWriter;

    public DevRequestErrorLogMiddleware(RequestDelegate next, IDevRequestErrorLogWriter logWriter)
    {
        _next = next;
        _logWriter = logWriter;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        var originalBodyStream = context.Response.Body;

        await using var bufferStream = new MemoryStream();
        context.Response.Body = bufferStream;

        Exception? unhandledException = null;

        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            unhandledException = ex;
            throw;
        }
        finally
        {
            stopwatch.Stop();
            context.Response.Body = originalBodyStream;

            if (unhandledException is null && bufferStream.Length > 0)
            {
                try
                {
                    bufferStream.Position = 0;
                    await bufferStream.CopyToAsync(originalBodyStream, context.RequestAborted);
                }
                catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
                {
                    // Client disconnected while reading the response; do not mask or log as a server error.
                }
            }

            var handledException = context.Items.TryGetValue(ExceptionHandlingMiddleware.HandledExceptionItemKey, out var handledObj)
                ? handledObj as Exception
                : null;
            var capturedException = unhandledException ?? handledException;

            var effectiveStatusCode = context.Response.StatusCode;
            if (unhandledException is not null && effectiveStatusCode < StatusCodes.Status400BadRequest)
            {
                effectiveStatusCode = StatusCodes.Status500InternalServerError;
            }

            if (effectiveStatusCode >= StatusCodes.Status400BadRequest || capturedException is not null)
            {
                await TryWriteLogEntryAsync(
                    context,
                    bufferStream,
                    effectiveStatusCode,
                    stopwatch.ElapsedMilliseconds,
                    capturedException);
            }
        }
    }

    private async Task TryWriteLogEntryAsync(
        HttpContext context,
        MemoryStream bufferStream,
        int statusCode,
        long durationMs,
        Exception? exception)
    {
        try
        {
            var services = context.RequestServices;
            var currentUser = services?.GetService<ICurrentUser>();
            var tenantContext = services?.GetService<ITenantContext>();
            var runtimeModeProvider = services?.GetService<IRuntimeModeProvider>();

            var traceId = context.Items.TryGetValue("TraceId", out var traceObj) && traceObj is string traceStr && !string.IsNullOrWhiteSpace(traceStr)
                ? traceStr
                : context.TraceIdentifier;

            var isAuthenticated = currentUser?.IsAuthenticated == true || context.User.Identity?.IsAuthenticated == true;

            var organizationId = currentUser?.OrganizationId
                ?? tenantContext?.OrganizationId
                ?? (isAuthenticated ? TryGetGuidClaim(context.User, "organization_id") : null);

            var branchId = ResolveBranchId(context, currentUser, runtimeModeProvider, isAuthenticated);

            var userId = isAuthenticated
                ? currentUser?.UserId ?? TryGetGuidClaim(context.User, ClaimTypes.NameIdentifier) ?? TryGetGuidClaim(context.User, "sub")
                : null;

            var role = isAuthenticated
                ? currentUser?.Role ?? context.User.FindFirst(ClaimTypes.Role)?.Value ?? context.User.FindFirst("role")?.Value
                : null;

            var branchScope = isAuthenticated
                ? currentUser?.BranchScope ?? context.User.FindFirst("branch_scope")?.Value
                : null;

            var responseBody = ReadTruncatedResponseBody(bufferStream);
            var exceptionDetail = BuildExceptionDetail(exception);

            var entry = new DevRequestErrorLogEntry(
                TimestampUtc: DateTimeOffset.UtcNow,
                TraceId: traceId,
                Method: context.Request.Method,
                Path: context.Request.Path.Value ?? string.Empty,
                QueryString: context.Request.QueryString.HasValue ? context.Request.QueryString.Value : null,
                StatusCode: statusCode,
                DurationMs: durationMs,
                RuntimeMode: runtimeModeProvider?.CurrentMode.ToString(),
                OrganizationId: organizationId,
                BranchId: branchId,
                UserId: userId,
                Role: role,
                BranchScope: branchScope,
                ResponseBody: responseBody,
                Exception: exceptionDetail);

            await _logWriter.WriteAsync(entry, CancellationToken.None);
        }
        catch
        {
            // Logging failures must never crash or alter the HTTP response.
        }
    }

    private static Guid? ResolveBranchId(
        HttpContext context,
        ICurrentUser? currentUser,
        IRuntimeModeProvider? runtimeModeProvider,
        bool isAuthenticated)
    {
        if (TryGetGuidFromRoute(context, "branchId") is { } routeBranchId)
        {
            return routeBranchId;
        }

        if (TryGetGuidFromRoute(context, "branch_id") is { } routeSnakeBranchId)
        {
            return routeSnakeBranchId;
        }

        if (TryGetGuidFromQuery(context, "branchId") is { } queryBranchId)
        {
            return queryBranchId;
        }

        if (TryGetGuidFromQuery(context, "branch_id") is { } querySnakeBranchId)
        {
            return querySnakeBranchId;
        }

        if (isAuthenticated && TryGetGuidClaim(context.User, "branch_id") is { } claimBranchId)
        {
            return claimBranchId;
        }

        if (runtimeModeProvider?.EnrolledBranchId is { } enrolledBranchId && enrolledBranchId != Guid.Empty)
        {
            return enrolledBranchId;
        }

        if (isAuthenticated && currentUser?.AuthorizedBranchIds is { Count: 1 } authorizedBranches)
        {
            return authorizedBranches.First();
        }

        return null;
    }

    private static Guid? TryGetGuidFromRoute(HttpContext context, string key)
    {
        if (context.Request.RouteValues.TryGetValue(key, out var raw)
            && raw is not null
            && Guid.TryParse(raw.ToString(), out var parsed)
            && parsed != Guid.Empty)
        {
            return parsed;
        }

        return null;
    }

    private static Guid? TryGetGuidFromQuery(HttpContext context, string key)
    {
        var raw = context.Request.Query[key].FirstOrDefault();
        return Guid.TryParse(raw, out var parsed) && parsed != Guid.Empty ? parsed : null;
    }

    private static Guid? TryGetGuidClaim(ClaimsPrincipal principal, string claimType)
    {
        var raw = principal.FindFirst(claimType)?.Value;
        return Guid.TryParse(raw, out var parsed) && parsed != Guid.Empty ? parsed : null;
    }

    private static string? ReadTruncatedResponseBody(MemoryStream bufferStream)
    {
        if (bufferStream.Length == 0)
        {
            return null;
        }

        bufferStream.Position = 0;
        using var reader = new StreamReader(bufferStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);
        var chars = new char[MaxResponseBodyLength + 1];
        var readCount = reader.ReadBlock(chars, 0, chars.Length);
        if (readCount == 0)
        {
            return null;
        }

        if (readCount <= MaxResponseBodyLength)
        {
            return new string(chars, 0, readCount);
        }

        var keptLength = MaxResponseBodyLength - TruncationSuffix.Length;
        return new string(chars, 0, keptLength) + TruncationSuffix;
    }

    private static DevRequestExceptionDetail? BuildExceptionDetail(Exception? exception)
    {
        if (exception is null)
        {
            return null;
        }

        var pgException = exception as PostgresException ?? exception.InnerException as PostgresException;
        var stackTrace = exception.StackTrace;
        if (!string.IsNullOrEmpty(stackTrace) && stackTrace.Length > MaxStackTraceLength)
        {
            stackTrace = stackTrace[..(MaxStackTraceLength - TruncationSuffix.Length)] + TruncationSuffix;
        }

        return new DevRequestExceptionDetail(
            Type: exception.GetType().FullName ?? exception.GetType().Name,
            Message: exception.Message,
            SqlState: pgException?.SqlState,
            InnerExceptionType: exception.InnerException?.GetType().FullName ?? exception.InnerException?.GetType().Name,
            InnerExceptionMessage: exception.InnerException?.Message,
            StackTrace: stackTrace);
    }
}
