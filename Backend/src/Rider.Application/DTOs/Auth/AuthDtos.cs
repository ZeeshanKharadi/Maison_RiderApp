using System.ComponentModel.DataAnnotations;

namespace Rider.Application.DTOs.Auth
{
    public class LoginModel
    {
        [Required]
        public string userid { get; set; }

        [Required]
        public string password { get; set; }
    }

    public class VerifyAndGetUserDetailsRequest
    {
        public string workerId { get; set; }
    }

    public class VerfiyOtp
    {
        public string userid { get; set; }
        public string otp { get; set; }
    }

    public class UpdatePassword
    {
        public string userid { get; set; }
        public string password { get; set; }
    }

    public class ChangePasswordRequest
    {
        public string oldPassword { get; set; }
        public string newPassword { get; set; }
        public string employeeId { get; set; }
    }

    public class RefreshTokenRequest
    {
        public string accessToken { get; set; }
        public string refreshToken { get; set; }
    }

    public class UpdateProfileRequest
    {
        public string name { get; set; }
        public string email { get; set; }
        public string phoneNumber { get; set; }
        public string department { get; set; }
        public string profilePicture { get; set; }
    }

    public class GetUserResponse
    {
        public string id { get; set; }
        public string employeeId { get; set; }
        public string name { get; set; }
        public string email { get; set; }
        public string phoneNumber { get; set; }
        public string department { get; set; }
        public string position { get; set; }
        public string costCenter { get; set; }
        public string grade { get; set; }
        public string payGroup { get; set; }
        public string dateOfBirth { get; set; }
        public string CNIC { get; set; }
        public string profilePicture { get; set; }
        public bool isActive { get; set; }
        public bool isVerified { get; set; }
        public List<string> roles { get; set; } = new();
        public List<string> permissions { get; set; } = new();
    }

    public class LoginUser
    {
        public GetUserResponse userData { get; set; }
        public string token { get; set; }
        public string refreshToken { get; set; }
    }
}
