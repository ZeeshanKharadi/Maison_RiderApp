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

        [ForeignKey(nameof(UserId))]
        public AppUser User { get; set; }
    }
}
