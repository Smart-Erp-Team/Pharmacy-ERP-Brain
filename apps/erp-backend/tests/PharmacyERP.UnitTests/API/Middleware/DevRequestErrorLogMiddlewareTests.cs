using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using PharmacyERP.Api.Logging;
using PharmacyERP.Api.Middleware;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Domain.Enums;
using Xunit;

namespace PharmacyERP.UnitTests.Api.Middleware;

public class DevRequestErrorLogMiddlewareTests
{
    [Fact]
    public async Task DevRequestErrorLogMiddleware_DoesNotLog_WhenResponseIs200Ok_AndPreservesBody()
    {
        var writer = new InMemoryDevRequestErrorLogWriter();
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/api/v1/products";
        context.Response.Body = new MemoryStream();

        var middleware = new DevRequestErrorLogMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            await ctx.Response.WriteAsync("{\"ok\":true}");
        }, writer);

        await middleware.InvokeAsync(context);

        Assert.Empty(writer.Entries);
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();
        Assert.Equal("{\"ok\":true}", body);
    }

    [Fact]
    public async Task DevRequestErrorLogMiddleware_LogsStructuredEntry_WhenStatusCodeIs400OrHigher()
    {
        var writer = new InMemoryDevRequestErrorLogWriter();
        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var currentUserMock = new Mock<ICurrentUser>();
        currentUserMock.SetupGet(x => x.IsAuthenticated).Returns(true);
        currentUserMock.SetupGet(x => x.OrganizationId).Returns(orgId);
        currentUserMock.SetupGet(x => x.UserId).Returns(userId);
        currentUserMock.SetupGet(x => x.Role).Returns("Manager");
        currentUserMock.SetupGet(x => x.BranchScope).Returns("ASSIGNED");
        currentUserMock.SetupGet(x => x.AuthorizedBranchIds).Returns(new HashSet<Guid> { branchId });

        var runtimeModeMock = new Mock<IRuntimeModeProvider>();
        runtimeModeMock.SetupGet(x => x.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);
        runtimeModeMock.SetupGet(x => x.EnrolledBranchId).Returns(branchId);

        var services = new ServiceCollection()
            .AddSingleton(currentUserMock.Object)
            .AddSingleton(runtimeModeMock.Object)
            .BuildServiceProvider();

        var context = new DefaultHttpContext
        {
            RequestServices = services,
            TraceIdentifier = "00-trace-422"
        };
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = "/api/v1/inventory/adjustments";
        context.Request.QueryString = new QueryString("?strict=true");
        context.Response.Body = new MemoryStream();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("sub", userId.ToString()),
            new Claim("organization_id", orgId.ToString()),
            new Claim("role", "Manager"),
            new Claim("branch_scope", "ASSIGNED")
        }, "TestAuth"));

        const string errorPayload = "{\"error\":{\"code\":\"VALIDATION_ERROR\",\"message\":\"Invalid quantity\"}}";

        var middleware = new DevRequestErrorLogMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync(errorPayload);
        }, writer);

        await middleware.InvokeAsync(context);

        var entry = Assert.Single(writer.Entries);
        Assert.Equal("00-trace-422", entry.TraceId);
        Assert.Equal("POST", entry.Method);
        Assert.Equal("/api/v1/inventory/adjustments", entry.Path);
        Assert.Equal("?strict=true", entry.QueryString);
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, entry.StatusCode);
        Assert.Equal("BranchLocal", entry.RuntimeMode);
        Assert.Equal(orgId, entry.OrganizationId);
        Assert.Equal(branchId, entry.BranchId);
        Assert.Equal(userId, entry.UserId);
        Assert.Equal("Manager", entry.Role);
        Assert.Equal("ASSIGNED", entry.BranchScope);
        Assert.Equal(errorPayload, entry.ResponseBody);
        Assert.Null(entry.Exception);
        Assert.True(entry.DurationMs >= 0);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var clientBody = await new StreamReader(context.Response.Body).ReadToEndAsync();
        Assert.Equal(errorPayload, clientBody);
    }

    [Fact]
    public async Task DevRequestErrorLogMiddleware_TruncatesResponseBody_ToMax2000Chars()
    {
        var writer = new InMemoryDevRequestErrorLogWriter();
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/api/v1/products";
        context.Response.Body = new MemoryStream();

        var oversizedBody = new string('A', 3500);
        var middleware = new DevRequestErrorLogMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsync(oversizedBody);
        }, writer);

        await middleware.InvokeAsync(context);

        var entry = Assert.Single(writer.Entries);
        Assert.NotNull(entry.ResponseBody);
        Assert.Equal(DevRequestErrorLogMiddleware.MaxResponseBodyLength, entry.ResponseBody!.Length);
        Assert.EndsWith("...[truncated]", entry.ResponseBody);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var fullClientBody = await new StreamReader(context.Response.Body).ReadToEndAsync();
        Assert.Equal(3500, fullClientBody.Length);
    }

    [Fact]
    public async Task DevRequestErrorLogMiddleware_CapturesExceptionAndErrorEnvelope_WithExceptionHandlingMiddleware()
    {
        var writer = new InMemoryDevRequestErrorLogWriter();
        var loggerMock = new Mock<ILogger<ExceptionHandlingMiddleware>>();

        var traceMiddleware = new TraceparentMiddleware(_ => throw new InvalidOperationException("Simulated RLS failure"));
        var exceptionMiddleware = new ExceptionHandlingMiddleware(traceMiddleware.InvokeAsync, loggerMock.Object);
        var devLogMiddleware = new DevRequestErrorLogMiddleware(exceptionMiddleware.InvokeAsync, writer);

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/api/v1/inventory/stock";
        context.Response.Body = new MemoryStream();

        await devLogMiddleware.InvokeAsync(context);

        Assert.Equal((int)HttpStatusCode.InternalServerError, context.Response.StatusCode);

        var entry = Assert.Single(writer.Entries);
        Assert.Equal(StatusCodes.Status500InternalServerError, entry.StatusCode);
        Assert.StartsWith("00-", entry.TraceId);
        Assert.NotNull(entry.ResponseBody);
        Assert.Contains("INTERNAL_SERVER_ERROR", entry.ResponseBody);
        Assert.NotNull(entry.Exception);
        Assert.Equal(typeof(InvalidOperationException).FullName, entry.Exception!.Type);
        Assert.Equal("Simulated RLS failure", entry.Exception.Message);
    }

    [Fact]
    public async Task DevRequestErrorLogMiddleware_LogsAndRethrows_WhenUnhandledExceptionEscapes()
    {
        var writer = new InMemoryDevRequestErrorLogWriter();
        var context = new DefaultHttpContext { TraceIdentifier = "escaped-trace" };
        context.Request.Method = HttpMethods.Delete;
        context.Request.Path = "/api/v1/products/123";
        context.Response.Body = new MemoryStream();

        var middleware = new DevRequestErrorLogMiddleware(
            _ => throw new InvalidOperationException("Uncaught boom"),
            writer);

        await Assert.ThrowsAsync<InvalidOperationException>(() => middleware.InvokeAsync(context));

        var entry = Assert.Single(writer.Entries);
        Assert.Equal(StatusCodes.Status500InternalServerError, entry.StatusCode);
        Assert.Equal("escaped-trace", entry.TraceId);
        Assert.NotNull(entry.Exception);
        Assert.Equal("Uncaught boom", entry.Exception!.Message);
    }

    [Fact]
    public async Task DevRequestErrorLogMiddleware_NeverCrashesOrAltersResponse_WhenLogWriterThrows()
    {
        var failingWriter = new Mock<IDevRequestErrorLogWriter>();
        failingWriter
            .Setup(x => x.WriteAsync(It.IsAny<DevRequestErrorLogEntry>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("Disk full"));

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/api/v1/branches";
        context.Response.Body = new MemoryStream();

        var middleware = new DevRequestErrorLogMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            await ctx.Response.WriteAsync("{\"error\":{\"code\":\"FORBIDDEN\"}}");
        }, failingWriter.Object);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(context.Response.Body, Encoding.UTF8).ReadToEndAsync();
        Assert.Equal("{\"error\":{\"code\":\"FORBIDDEN\"}}", body);
    }

    [Fact]
    public async Task FileDevRequestErrorLogWriter_WritesThreadSafeJsonLines()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "pharmacy-erp-log-tests-" + Guid.NewGuid().ToString("N"));
        var logPath = Path.Combine(tempDir, "logs", "dev-requests.log");

        try
        {
            using var writer = new FileDevRequestErrorLogWriter(logPath);

            var tasks = Enumerable.Range(0, 12).Select(i => writer.WriteAsync(new DevRequestErrorLogEntry(
                TimestampUtc: DateTimeOffset.UtcNow,
                TraceId: $"trace-{i}",
                Method: "GET",
                Path: $"/api/v1/test/{i}",
                QueryString: null,
                StatusCode: 500,
                DurationMs: 15,
                RuntimeMode: "Cloud",
                OrganizationId: null,
                BranchId: null,
                UserId: null,
                Role: null,
                BranchScope: null,
                ResponseBody: "{\"error\":{\"code\":\"INTERNAL_SERVER_ERROR\"}}",
                Exception: null)));

            await Task.WhenAll(tasks);

            var lines = await File.ReadAllLinesAsync(logPath);
            Assert.Equal(12, lines.Length);

            foreach (var line in lines)
            {
                using var doc = JsonDocument.Parse(line);
                Assert.Equal(500, doc.RootElement.GetProperty("statusCode").GetInt32());
                Assert.Equal("Cloud", doc.RootElement.GetProperty("runtimeMode").GetString());
                Assert.True(doc.RootElement.TryGetProperty("timestampUtc", out _));
                Assert.True(doc.RootElement.TryGetProperty("traceId", out _));
            }
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }

    private sealed class InMemoryDevRequestErrorLogWriter : IDevRequestErrorLogWriter
    {
        public List<DevRequestErrorLogEntry> Entries { get; } = new();

        public Task WriteAsync(DevRequestErrorLogEntry entry, CancellationToken cancellationToken = default)
        {
            Entries.Add(entry);
            return Task.CompletedTask;
        }
    }
}
