namespace PharmacyERP.Api.Logging;

public sealed record DevRequestExceptionDetail(
    string Type,
    string Message,
    string? SqlState,
    string? InnerExceptionType,
    string? InnerExceptionMessage,
    string? StackTrace);

public sealed record DevRequestErrorLogEntry(
    DateTimeOffset TimestampUtc,
    string TraceId,
    string Method,
    string Path,
    string? QueryString,
    int StatusCode,
    long DurationMs,
    string? RuntimeMode,
    Guid? OrganizationId,
    Guid? BranchId,
    Guid? UserId,
    string? Role,
    string? BranchScope,
    string? ResponseBody,
    DevRequestExceptionDetail? Exception);

public interface IDevRequestErrorLogWriter
{
    Task WriteAsync(DevRequestErrorLogEntry entry, CancellationToken cancellationToken = default);
}

public sealed class FileDevRequestErrorLogWriter : IDevRequestErrorLogWriter, IDisposable
{
    private const string DefaultRelativeLogPath = "logs/dev-requests.log";
    private const string SolutionFileName = "PharmacyERP.sln";

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    private readonly string _logFilePath;
    private readonly SemaphoreSlim _writeLock = new(1, 1);

    public FileDevRequestErrorLogWriter(IHostEnvironment hostEnvironment, IConfiguration configuration)
        : this(ResolveLogFilePath(hostEnvironment.ContentRootPath, configuration["DevRequestErrorLog:FilePath"]))
    {
    }

    public FileDevRequestErrorLogWriter(string logFilePath)
    {
        _logFilePath = logFilePath;
    }

    public string LogFilePath => _logFilePath;

    public async Task WriteAsync(DevRequestErrorLogEntry entry, CancellationToken cancellationToken = default)
    {
        try
        {
            var directory = Path.GetDirectoryName(_logFilePath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var line = JsonSerializer.Serialize(entry, SerializerOptions) + Environment.NewLine;

            await _writeLock.WaitAsync(CancellationToken.None).ConfigureAwait(false);
            try
            {
                await using var stream = new FileStream(
                    _logFilePath,
                    FileMode.Append,
                    FileAccess.Write,
                    FileShare.ReadWrite,
                    bufferSize: 4096,
                    useAsync: true);

                await using var writer = new StreamWriter(stream);
                await writer.WriteAsync(line).ConfigureAwait(false);
                await writer.FlushAsync().ConfigureAwait(false);
            }
            finally
            {
                _writeLock.Release();
            }
        }
        catch
        {
            // Logging failures must never crash or alter the HTTP response.
        }
    }

    public static string ResolveLogFilePath(string contentRootPath, string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.IsPathRooted(configuredPath)
                ? configuredPath
                : Path.GetFullPath(Path.Combine(FindBackendRoot(contentRootPath), configuredPath));
        }

        var backendRoot = FindBackendRoot(contentRootPath);
        return Path.GetFullPath(Path.Combine(backendRoot, DefaultRelativeLogPath));
    }

    private static string FindBackendRoot(string contentRootPath)
    {
        var current = new DirectoryInfo(Path.GetFullPath(contentRootPath));
        for (var depth = 0; depth < 5 && current is not null; depth++)
        {
            if (File.Exists(Path.Combine(current.FullName, SolutionFileName)))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return Path.GetFullPath(contentRootPath);
    }

    public void Dispose()
    {
        _writeLock.Dispose();
    }
}
