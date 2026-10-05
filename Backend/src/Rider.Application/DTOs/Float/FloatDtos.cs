using System.ComponentModel.DataAnnotations;
using Rider.Domain.Common;

namespace Rider.Application.DTOs.Float
{
    public class FloatLedgerEntryDto
    {
        public long id { get; set; }
        public Guid riderUserId { get; set; }
        public string? riderWorkerId { get; set; }
        public string? riderName { get; set; }
        public string storeId { get; set; } = "";
        public decimal amount { get; set; }
        public string entryType { get; set; } = "";
        public string? status { get; set; }
        public DateTime? acknowledgedAt { get; set; }
        public Guid actorUserId { get; set; }
        public string? actorName { get; set; }
        public string? reason { get; set; }
        public string requestId { get; set; } = "";
        public DateTime createdAt { get; set; }
    }

    public class FloatSummaryDto
    {
        public Guid riderUserId { get; set; }
        public string? riderWorkerId { get; set; }
        public string? riderName { get; set; }
        public string? storeId { get; set; }
        /// <summary>Acknowledged issues minus returns — owed to store as change float.</summary>
        public decimal outstandingFloat { get; set; }
        public decimal pendingAcknowledgmentTotal { get; set; }
        public List<FloatLedgerEntryDto> pendingAcknowledgments { get; set; } = new();
        public List<FloatLedgerEntryDto> recent { get; set; } = new();
        public DateTime asOfUtc { get; set; }
    }

    public class FloatMutationRequest
    {
        [Required]
        public Guid riderUserId { get; set; }

        [Required]
        public string storeId { get; set; } = "";

        [Required]
        public decimal amount { get; set; }

        public string? reason { get; set; }

        [Required]
        public string requestId { get; set; } = "";
    }

    public class FloatAcknowledgeRequest
    {
        [Required]
        public long issueId { get; set; }

        [Required]
        public string requestId { get; set; } = "";
    }
}
