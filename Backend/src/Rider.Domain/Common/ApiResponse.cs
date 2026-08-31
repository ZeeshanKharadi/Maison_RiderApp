namespace Rider.Domain.Common
{
    /// <summary>
    /// ESS-compatible API envelope (status / message / Data).
    /// </summary>
    public class ApiResponse<T>
    {
        public bool status { get; set; }
        public string message { get; set; }
        public T Data { get; set; }

        public ApiResponse(bool status, string message, T data)
        {
            this.status = status;
            this.message = message;
            Data = data;
        }
    }
}
