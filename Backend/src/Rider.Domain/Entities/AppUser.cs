using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("Users")]
    public class AppUser
    {
        [Key]
        public Guid UserId { get; set; } = Guid.NewGuid();

        [MaxLength(200)]
        public string? UserName { get; set; }

        [MaxLength(200)]
        public string? Email { get; set; }

        [MaxLength(100)]
        public string? ThirdPartyEmployeeId { get; set; }

        /// <summary>AES ciphertext (IV + payload). Null until password is set.</summary>
        public byte[]? PasswordEncrypted { get; set; }

        public bool IsActive { get; set; } = true;

        public bool IsVerified { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? DeletedAt { get; set; }

        [MaxLength(100)]
        public string? Position { get; set; }

        [MaxLength(100)]
        public string? PayGroup { get; set; }

        public DateTime? DateOfBirth { get; set; }

        [MaxLength(50)]
        public string? Grade { get; set; }

        [MaxLength(50)]
        public string? PhoneNumber { get; set; }

        [MaxLength(50)]
        public string? Cnic { get; set; }

        [MaxLength(100)]
        public string? Department { get; set; }

        [MaxLength(100)]
        public string? CostCenter { get; set; }

        [MaxLength(500)]
        public string? ProfileImageUrl { get; set; }

        public ICollection<OtpCode>? Otps { get; set; }
        public ICollection<UserRefreshToken>? RefreshTokens { get; set; }
    }
}
