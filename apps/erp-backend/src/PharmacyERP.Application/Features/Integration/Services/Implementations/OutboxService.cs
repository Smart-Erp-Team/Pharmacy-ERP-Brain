namespace PharmacyERP.Application.Features.Integration.Services.Implementations;

public class OutboxService : IOutboxService
{
    private static readonly JsonSerializerOptions OutboxJsonOptions = new()
    {
        WriteIndented = false,
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly IOutboxRepository _repository;
    private readonly ITenantContext _tenantContext;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ICurrentUser _currentUser;

    public OutboxService(IOutboxRepository repository, ITenantContext tenantContext, IDateTimeProvider dateTimeProvider, ICurrentUser currentUser)
    {
        _repository = repository;
        _tenantContext = tenantContext;
        _dateTimeProvider = dateTimeProvider;
        _currentUser = currentUser;
    }

    public async Task EnqueueAsync<TPayload>(string eventType, Guid? branchId, TPayload payload, string schemaVersion = "1.0", CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
        {
            throw new InvalidOperationException("OrganizationId is required to enqueue outbox events.");
        }

        var orgId = _tenantContext.OrganizationId.Value;

        var cursor = await _repository.LockAndGetCursorAsync(orgId, ct);
        if (cursor == null)
        {
            throw new InvalidOperationException("OutboxEventCursor missing. Ensure PlatformProvisioner created the initial cursor.");
        }

        var now = _dateTimeProvider.UtcNow;
        var nextSequence = cursor.AllocateNextSequence(now);
        var payloadJson = JsonSerializer.Serialize(payload, OutboxJsonOptions);

        var outboxEvent = new OutboxEvent(
            Guid.NewGuid(),
            orgId,
            branchId,
            nextSequence,
            eventType,
            payloadJson,
            _currentUser.TraceId,
            schemaVersion,
            now
        );

        await _repository.AddEventAsync(outboxEvent, ct);
    }
}