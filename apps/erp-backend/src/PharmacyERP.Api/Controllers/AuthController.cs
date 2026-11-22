namespace PharmacyERP.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly ICurrentUser _currentUser;
    public AuthController(IAuthService auth, ICurrentUser currentUser) { _auth = auth; _currentUser = currentUser; }

    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
        => ApiResultMapper.ToActionResult(this, await _auth.LoginAsync(request, ct), _currentUser.TraceId);

    [AllowAnonymous, HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request, CancellationToken ct)
        => ApiResultMapper.ToActionResult(this, await _auth.RefreshAsync(request, ct), _currentUser.TraceId);

    [Authorize, HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request, CancellationToken ct)
        => ApiResultMapper.ToActionResult(this, await _auth.LogoutAsync(request, ct), _currentUser.TraceId);

    [Authorize, HttpGet("me")]
    public IActionResult Me()
        => ApiResultMapper.ToActionResult(this, _auth.GetCurrentUser(), _currentUser.TraceId);
}
