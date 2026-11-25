namespace PharmacyERP.Application.Features.Identity.Interfaces;

public sealed record GeneratedAccessToken(
    string Token,
    DateTimeOffset ExpiresAt,
    string Issuer = "PharmacyERP",
    string Audience = "PharmacyERP.Api",
    string KeyId = "");

public interface IJwtTokenGenerator
{
    GeneratedAccessToken GenerateAccessToken(UserAccount user, IReadOnlyCollection<Guid> branchIds);
}
