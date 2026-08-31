namespace Rider.Domain.Common
{
    public static class RoleNames
    {
        public const string Rider = "Rider";
        public const string Manager = "Manager";
        public const string Administrator = "Administrator";

        public const string AdminOrManager = Administrator + "," + Manager;
    }
}
