using Microsoft.Extensions.Logging;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Domain.Entities.Integration;

namespace PharmacyERP.Infrastructure.BackgroundServices;

public sealed class LoggingOutboxEventDispatcher : IOutboxEventDispatcher
{
    private readonly ILogger<LoggingOutboxEventDispatcher> _logger;

    public LoggingOutboxEventDispatcher(ILogger<LoggingOutboxEventDispatcher> logger)
    {
        _logger = logger;
    }

    public Task DispatchAsync(OutboxEvent outboxEvent, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "Dispatched outbox event {EventId} ({EventType} v{SchemaVersion}) for Organization {OrganizationId} Seq {EventSequence} TraceId {TraceId}.",
            outboxEvent.EventId,
            outboxEvent.EventType,
            outboxEvent.SchemaVersion,
            outboxEvent.OrganizationId,
            outboxEvent.EventSequence,
            outboxEvent.TraceId);

        return Task.CompletedTask;
    }
}
