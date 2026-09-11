using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("RiderAvailabilityIntervals")]
    public class RiderAvailabilityInterval
    {
        [Key]
        public long Id { get; set; }

        public Guid UserId { get; set; }

        public DateTime StartedAt { get; set; }

        public DateTime? EndedAt { get; set; }

        /// <summary>ToggleOff | HeartbeatExpired | Admin | CrashClose</summary>
        [MaxLength(40)]
        public string? EndReason { get; set; }

        [ForeignKey(nameof(UserId))]
        public AppUser? User { get; set; }
    }
}
