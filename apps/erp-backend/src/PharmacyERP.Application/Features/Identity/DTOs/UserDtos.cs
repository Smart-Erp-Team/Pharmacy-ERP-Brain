namespace PharmacyERP.Application.Features.Identity.DTOs;

public sealed record CreateUserRequest
{
    public Guid EmployeeId { get; init; }
    [Required, StringLength(80)] public string Username { get; init; } = string.Empty;
    [Required, MinLength(12)] public string Password { get; init; } = string.Empty;
    public UserRole Role { get; init; }
    public BranchScope BranchScope { get; init; } = BranchScope.ASSIGNED;
    public IReadOnlyCollection<Guid> BranchIds { get; init; } = Array.Empty<Guid>();
    public string? IdempotencyKey { get; init; }
}

public sealed record UpdateUserRequest
{
    public UserRole? Role { get; init; }
    public BranchScope? BranchScope { get; init; }
    public IReadOnlyCollection<Guid>? BranchIds { get; init; }
    public bool? IsActive { get; init; }
    public string? IdempotencyKey { get; init; }
}

public sealed record ResetPasswordRequest
{
    [Required, MinLength(12)] public string NewPassword { get; init; } = string.Empty;
    public string? IdempotencyKey { get; init; }
}
public sealed record UserDto(
    Guid UserId,
    Guid EmployeeId,
    Guid OrganizationId,
    string Username,
    UserRole Role,
    BranchScope BranchScope,
    bool IsActive,
    IReadOnlyCollection<Guid> BranchIds,
    DateTimeOffset? LastLoginAt = null,
    DateTimeOffset? LockoutEnd = null);

public static class UserDtoMapper
{
    public static UserDto From(UserAccount user) => new(
        user.UserId,
        user.EmployeeId,
        user.OrganizationId,
        user.Username,
        user.Role,
        user.BranchScope,
        user.IsActive,
        user.BranchAccesses.Select(x => x.BranchId).ToArray(),
        user.LastLoginAt,
        user.LockoutEnd);
}
