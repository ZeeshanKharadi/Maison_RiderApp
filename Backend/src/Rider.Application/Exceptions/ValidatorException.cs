namespace Rider.Application.Exceptions
{
    public class ValidatorException : Exception
    {
        public List<string> ValdationErrors { get; set; } = new();

        public ValidatorException(string message) : base(message) { }

        public ValidatorException(IEnumerable<string> errors)
            : base("Validation errors!")
        {
            ValdationErrors = errors?.ToList() ?? new List<string>();
        }
    }
}
