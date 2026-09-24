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

        /// <summary>Live Ops event only — order row stays Available after pool reject.</summary>
        public const string Rejected = "Rejected";

        public const int MaxActiveDeliveries = 5;

        /// <summary>In-flight for the rider (counts toward max-5).</summary>
        public static readonly string[] ActiveStatuses =
        {
            Accepted,
            NavigatingToPickup,
            ArrivedAtPickup,
            InProgress,
            OnTheWay,
            ArrivedAtCustomer,
            Delivered
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
    }
}
