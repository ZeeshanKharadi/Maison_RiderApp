namespace Rider.Domain.Common
{
    public static class OrderStatuses
    {
        public const string Available = "Available";
        public const string Accepted = "Accepted";
        public const string InProgress = "InProgress";
        public const string Completed = "Completed";
        public const string Cancelled = "Cancelled";

        public const int MaxActiveDeliveries = 5;

        public static readonly string[] ActiveStatuses = { Accepted, InProgress };
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
