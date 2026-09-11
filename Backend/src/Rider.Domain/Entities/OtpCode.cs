using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("OTP")]
    public class OtpCode
    {
        [Key]
        public int OtpId { get; set; }

        public Guid UserId { get; set; }

        [MaxLength(20)]
        public string OtpCodeValue { get; set; }

        [MaxLength(50)]
        public string Channel { get; set; }

        public DateTime ExpiresAt { get; set; }

        public bool IsUsed { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>PasswordReset | Registration</summary>
        [MaxLength(40)]
        public string Purpose { get; set; } = "PasswordReset";

        public int AttemptCount { get; set; }

        [ForeignKey(nameof(UserId))]
        public AppUser User { get; set; }
    }
}
