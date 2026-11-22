namespace PharmacyERP.Application.Common.Interfaces.Integration;

public interface IOutboxEventDispatcher
{
    Task DispatchAsync(OutboxEvent outboxEvent, CancellationToken ct = default);
}
