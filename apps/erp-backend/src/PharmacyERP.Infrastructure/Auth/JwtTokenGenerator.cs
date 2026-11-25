using System.IdentityModel.Tokens.Jwt;

namespace PharmacyERP.Infrastructure.Auth;

/// <summary>
/// Issues RS256-signed JWT access tokens embedding tenant, role, branch-scope, and
/// <c>security_stamp</c> claims, restricting BranchLocal tokens to the single enrolled branch.
/// </summary>
public sealed class JwtTokenGenerator : IJwtTokenGenerator
{
    private static readonly TimeSpan DefaultLifetime = TimeSpan.FromMinutes(15);
    private readonly JwksKeyProvider _keys;
    private readonly IRuntimeModeProvider _runtimeMode;
    private readonly IDateTimeProvider _clock;
    private readonly string _issuer;
    private readonly string _audience;

    public JwtTokenGenerator(JwksKeyProvider keys, IRuntimeModeProvider runtimeMode, IDateTimeProvider clock, IConfiguration configuration)
    {
        _keys = keys;
        _runtimeMode = runtimeMode;
        _clock = clock;
        _issuer = configuration["Jwt:Issuer"] ?? "PharmacyERP";
        _audience = configuration["Jwt:Audience"] ?? "PharmacyERP.Api";
    }

    public GeneratedAccessToken GenerateAccessToken(UserAccount user, IReadOnlyCollection<Guid> branchIds)
    {
        ArgumentNullException.ThrowIfNull(user);
        var now = _clock.UtcNow;
        var expires = now.Add(DefaultLifetime);
        var effectiveBranches = branchIds.Where(x => x != Guid.Empty).Distinct().ToArray();
        var branchScope = user.BranchScope.ToString();
        if (_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal)
        {
            var enrolledBranchId = _runtimeMode.EnrolledBranchId
                ?? throw new InvalidOperationException("BranchLocal mode requires ENROLLED_BRANCH_ID.");
            var isOrgAdmin = user.Role == UserRole.Admin && user.BranchScope == BranchScope.ALL;
            if (!isOrgAdmin && !effectiveBranches.Contains(enrolledBranchId))
            {
                throw new UnauthorizedAccessException("User is not authorized to access the enrolled BranchLocal branch.");
            }
            effectiveBranches = new[] { enrolledBranchId };
            // CurrentUser treats Admin + ALL as unrestricted, so local tokens must use ASSIGNED.
            branchScope = BranchScope.ASSIGNED.ToString();
            expires = now.AddHours(24);
        }

        var scopes = GetScopes(user.Role);
        var header = new JwtHeader(_keys.CreateSigningCredentials())
        {
            ["typ"] = "JWT",
            ["kid"] = _keys.KeyId
        };
        var payload = new JwtPayload
        {
            ["iss"] = _issuer,
            ["aud"] = _audience,
            ["sub"] = user.UserId.ToString(),
            ["employee_id"] = user.EmployeeId.ToString(),
            ["username"] = user.Username,
            // Blueprint §8.5: emit roles and scopes strictly as JSON string arrays.
            ["roles"] = new[] { user.Role.ToString() },
            ["organization_id"] = user.OrganizationId.ToString(),
            ["branch_scope"] = branchScope,
            ["branch_ids"] = effectiveBranches.Select(x => x.ToString()).ToArray(),
            ["scopes"] = scopes,
            ["security_stamp"] = user.SecurityStamp.ToString(),
            ["iat"] = now.ToUnixTimeSeconds(),
            ["exp"] = expires.ToUnixTimeSeconds()
        };

        var jwt = new JwtSecurityToken(header, payload);
        var token = new JwtSecurityTokenHandler().WriteToken(jwt);
        return new GeneratedAccessToken(token, expires, _issuer, _audience, _keys.KeyId);
    }

    private static string[] GetScopes(UserRole role) => role switch
    {
        // Blueprint §8.5: adhere strictly to the closed 13-scope vocabulary (no undocumented branch:admin/employee:admin).
        UserRole.Admin => new[] { "user:admin", "inventory:read", "inventory:write", "sales:read", "sales:write" },
        // Blueprint §8.5/§9.1: Pharmacist is read-only on POS sales (excludes sales:write).
        UserRole.Pharmacist => new[] { "inventory:read", "inventory:write", "sales:read" },
        UserRole.Cashier => new[] { "inventory:read", "sales:read", "sales:write" },
        _ => Array.Empty<string>()
    };
}
