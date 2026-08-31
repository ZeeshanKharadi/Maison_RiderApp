using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Auth;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    /// <summary>
    /// ESS-compatible User auth endpoints under /api/User/*
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly ILogger<UserController> _logger;

        public UserController(IUserService userService, ILogger<UserController> logger)
        {
            _userService = userService;
            _logger = logger;
        }

        [HttpPost("register")]
        [AllowAnonymous]
        public async Task<IActionResult> Register([FromBody] VerifyAndGetUserDetailsRequest request)
        {
            try
            {
                if (!await _userService.UserExists(request?.workerId))
                {
                    var result = await _userService.AddUser(request);
                    return Ok(result);
                }

                var forgot = await _userService.ForgetPassword(request);
                return Ok(forgot);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during user registration");
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginModel model)
        {
            try
            {
                _logger.LogInformation("Calling Login");
                var result = await _userService.UserLoginUsingEmailandPassword(model);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during user login");
                return BadRequest(ex.Message);
            }
        }

        [HttpPost("VerifyOtp")]
        [AllowAnonymous]
        public async Task<IActionResult> VerifyOtp([FromBody] VerfiyOtp req)
        {
            try
            {
                var data = await _userService.VerifyOtpAsync(req?.userid, req?.otp);
                return Ok(data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during VerifyOtp");
                return BadRequest(ex.Message);
            }
        }

        [HttpPost("UpdatePassword")]
        [AllowAnonymous]
        public async Task<IActionResult> UpdatePassword([FromBody] UpdatePassword req)
        {
            try
            {
                var data = await _userService.UpdatePassword(req?.userid, req?.password);
                return Ok(data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during UpdatePassword");
                return BadRequest(ex.Message);
            }
        }

        [HttpPost("ChangePassword")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim))
                    return Unauthorized("User ID not found in token");

                req ??= new ChangePasswordRequest();
                req.employeeId = userIdClaim;
                var data = await _userService.UpdatePasswordUsingOldPassword(req);
                return Ok(data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during ChangePassword");
                return BadRequest(ex.Message);
            }
        }

        [HttpPost("Logout")]
        [Authorize]
        public async Task<IActionResult> Logout()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var result = await _userService.Logout(userIdClaim);
            return Ok(result);
        }

        [HttpGet("CurrentUser")]
        [Authorize]
        public async Task<IActionResult> CurrentUser()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var result = await _userService.GetCurrentUser(userIdClaim);
            return Ok(result);
        }

        [HttpPost("RefreshToken")]
        [AllowAnonymous]
        public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest req)
        {
            var result = await _userService.RefreshToken(req);
            return Ok(result);
        }

        [HttpPut("UpdateProfile")]
        [Authorize]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var result = await _userService.UpdateProfile(req, userIdClaim);
            return Ok(result);
        }

        [HttpPost("ValidateToken")]
        [Authorize]
        public async Task<IActionResult> ValidateToken()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var result = await _userService.ValidateToken(userIdClaim);
            return Ok(result);
        }
    }
}
