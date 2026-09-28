namespace Rider.Domain.Common
{
    public static class OrderStatuses
    {
        public const string Available = "Available";
        public const string Accepted = "Accepted";
        public const string NavigatingToPickup = "NavigatingToPickup";
        public const string ArrivedAtPickup = "ArrivedAtPickup";
        public const string InProgress = "InProgress";
        public const string OnTheWay = "OnTheWay";
        public const string ArrivedAtCustomer = "ArrivedAtCustomer";
        public const string Delivered = "Delivered";
        public const string Completed = "Completed";
        public const string Cancelled = "Cancelled";

        /// <summary>Admin approved return-to-store; rider still has the parcel.</summary>
        public const string ReturningToStore = "ReturningToStore";

        /// <summary>Rider confirmed return; awaiting manager store receipt.</summary>
        public const string AwaitingStoreReceipt = "AwaitingStoreReceipt";

        /// <summary>Store receipt confirmed. Terminal until Cancel or Requeue. Not a rider-writable status.</summary>
        public const string Failed = "Failed";

        /// <summary>Live Ops event only — order row stays Available after pool reject.</summary>
        public const string Rejected = "Rejected";

        public const int MaxActiveDeliveries = 5;

        /// <summary>In-flight for the rider (counts toward max-5), including return-to-store.</summary>
        public static readonly string[] ActiveStatuses =
        {
            Accepted,
            NavigatingToPickup,
            ArrivedAtPickup,
            InProgress,
            OnTheWay,
            ArrivedAtCustomer,
            Delivered,
            ReturningToStore,
            AwaitingStoreReceipt
        };

        /// <summary>Statuses from which the rider may complete (pickup done).</summary>
        public static readonly string[] CompletablesStatuses =
        {
            InProgress,
            OnTheWay,
            ArrivedAtCustomer,
            Delivered
        };

        /// <summary>Linear rider progression after accept (forward / skip OK; not backward).</summary>
        public static readonly string[] RiderProgression =
        {
            Accepted,
            NavigatingToPickup,
            ArrivedAtPickup,
            InProgress,
            OnTheWay,
            ArrivedAtCustomer,
            Delivered,
            Completed
        };

        public static bool IsActiveStatus(string? status)
            => !string.IsNullOrEmpty(status) && ActiveStatuses.Contains(status);

        public static bool IsCompletableStatus(string? status)
            => !string.IsNullOrEmpty(status) && CompletablesStatuses.Contains(status);

        public static bool IsFailedDeliveryFlowStatus(string? status)
            => status is ReturningToStore or AwaitingStoreReceipt or Failed;

        /// <summary>Cancel/requeue after store receipt, or normal Available/Cancelled requeue.</summary>
        public static bool CanAdminRequeue(string? status)
            => status is Available or Cancelled or Failed;

        /// <summary>
        /// Cancel blocked while a failure request is pending review or return is in progress.
        /// Allowed after Failed (store receipt) and for normal ops otherwise (not Completed).
        /// </summary>
        public static bool CanAdminCancel(string? status, string? failureRequestStatus)
        {
            if (string.IsNullOrEmpty(status) || status == Completed)
                return false;
            if (status is ReturningToStore or AwaitingStoreReceipt)
                return false;
            if (string.Equals(failureRequestStatus, FailureRequestStatuses.Pending, StringComparison.OrdinalIgnoreCase))
                return false;
            return true;
        }

        public static bool IsRiderWritableStatus(string? status)
            => !string.IsNullOrEmpty(status) && RiderProgression.Contains(status);

        /// <summary>
        /// Forward-only along <see cref="RiderProgression"/> (skips allowed).
        /// Completed requires pickup (<see cref="CompletablesStatuses"/>).
        /// </summary>
        public static bool CanRiderAdvance(string from, string to)
        {
            if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to))
                return false;
            if (from == to)
                return true;

            var fi = Array.IndexOf(RiderProgression, from);
            var ti = Array.IndexOf(RiderProgression, to);
            if (fi < 0 || ti < 0)
                return false;

            if (to == Completed)
                return IsCompletableStatus(from);

            return ti > fi;
        }

        public static int ProgressionIndex(string status)
            => Array.IndexOf(RiderProgression, status);
    }

    public static class OtpPurposes
    {
        public const string PasswordReset = "PasswordReset";
        public const string Registration = "Registration";
    }

    public static class CashSemantics
    {
        public const string LegacyAmbiguous = "LegacyCashCollected_Ambiguous";
        public const string RiderCollected = "RiderCollected";
        public const string AdminCorrected = "AdminCorrected";
        public const string HandedOver = "HandedOver";

        /// <summary>
        /// Collected cash not yet confirmed handed to the store.
        /// </summary>
        public static decimal UnreconciledCollectedCash(decimal? cashCollected, decimal? cashHandedOverAmount)
        {
            if (!cashCollected.HasValue || cashCollected.Value <= 0)
                return 0;
            return Math.Max(0m, cashCollected.Value - (cashHandedOverAmount ?? 0m));
        }

        /// <summary>
        /// Deadline-safe Failed→Requeue gate: any CashCollected &gt; 0 blocks requeue,
        /// even after full handover. Completing a requeued COD order would overwrite
        /// CashCollected while retaining a prior rider's CashHandedOverAmount and can
        /// falsely show no cash outstanding for the next rider.
        /// Supporting two collecting riders on one order requires a separate per-rider
        /// cash ledger (out of scope). Failed non-COD / no-collected-cash may requeue.
        /// </summary>
        public static bool BlocksFailedRequeue(
            string? status, decimal? cashCollected, decimal? cashHandedOverAmount = null)
        {
            _ = cashHandedOverAmount; // handover does not unlock Failed→Requeue
            return string.Equals(status, OrderStatuses.Failed, StringComparison.OrdinalIgnoreCase)
                   && cashCollected.HasValue
                   && cashCollected.Value > 0;
        }
    }

    /// <summary>
    /// Rider delivery-issue reason codes. Event-only — never used as AssignedOrder.Status.
    /// </summary>
    public static class DeliveryIssueReasons
    {
        public const string CustomerUnreachable = "CustomerUnreachable";
        public const string CustomerRefused = "CustomerRefused";
        public const string AddressIssue = "AddressIssue";
        public const string Other = "Other";

        /// <summary>Lifecycle audit NewStatus label only (order row status unchanged).</summary>
        public const string AuditEventStatus = "IssueReported";

        public static readonly string[] All =
        {
            CustomerUnreachable,
            CustomerRefused,
            AddressIssue,
            Other
        };

        public static bool IsValid(string? code)
            => !string.IsNullOrWhiteSpace(code)
               && All.Contains(code.Trim(), StringComparer.OrdinalIgnoreCase);

        public static string Normalize(string code)
            => All.First(c => string.Equals(c, code.Trim(), StringComparison.OrdinalIgnoreCase));

        public static string DisplayLabel(string? code) => code switch
        {
            CustomerUnreachable => "Customer unreachable",
            CustomerRefused => "Customer refused",
            AddressIssue => "Address issue",
            Other => "Other",
            _ => code ?? ""
        };
    }

    /// <summary>Admin triage statuses for DeliveryIssueReports. Independent of delivery status.</summary>
    public static class DeliveryIssueStatuses
    {
        public const string New = "New";
        public const string Acknowledged = "Acknowledged";
        public const string Closed = "Closed";

        public static readonly string[] All = { New, Acknowledged, Closed };
        public static readonly string[] Open = { New, Acknowledged };

        public static bool IsValid(string? status)
            => !string.IsNullOrWhiteSpace(status)
               && All.Contains(status.Trim(), StringComparer.OrdinalIgnoreCase);

        public static bool IsOpen(string? status)
            => !string.IsNullOrWhiteSpace(status)
               && Open.Contains(status.Trim(), StringComparer.OrdinalIgnoreCase);

        public static string Normalize(string status)
            => All.First(s => string.Equals(s, status.Trim(), StringComparison.OrdinalIgnoreCase));

        public static string DisplayLabel(string? status) => status switch
        {
            New => "New",
            Acknowledged => "Acknowledged",
            Closed => "Closed",
            _ => status ?? ""
        };

        public static bool CanAcknowledge(string? from)
            => string.Equals(from, New, StringComparison.OrdinalIgnoreCase);

        public static bool CanClose(string? from)
            => string.Equals(from, Acknowledged, StringComparison.OrdinalIgnoreCase);

        public static bool CanUpdateNote(string? from)
            => IsOpen(from);

        /// <summary>Linear: New → Acknowledged → Closed.</summary>
        public static bool CanTransition(string from, string to)
        {
            from = Normalize(from);
            to = Normalize(to);
            if (from == to) return true;
            if (from == New && to == Acknowledged) return true;
            if (from == Acknowledged && to == Closed) return true;
            return false;
        }
    }

    public static class DeliveryIssueTriageActions
    {
        public const string Reported = "Reported";
        public const string Acknowledged = "Acknowledged";
        public const string NoteUpdated = "NoteUpdated";
        public const string Closed = "Closed";
    }

    /// <summary>Controlled failed-delivery request lifecycle (independent of issue triage Close).</summary>
    public static class FailureRequestStatuses
    {
        public const string Pending = "Pending";
        public const string Rejected = "Rejected";
        public const string ReturnApproved = "ReturnApproved";
        public const string RiderReturned = "RiderReturned";
        public const string StoreReceived = "StoreReceived";

        public static bool IsOpen(string? status)
            => status is Pending or ReturnApproved or RiderReturned;
    }
}

