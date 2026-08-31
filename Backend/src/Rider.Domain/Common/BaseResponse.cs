using System.Net;

namespace Rider.Domain.Common
{
    public class BaseResponse<T>
    {
        public BaseResponse()
        {
            Succeeded = true;
            StatusCode = (int)HttpStatusCode.OK;
        }

        public bool Succeeded { get; set; }
        public string Message { get; set; }
        public bool IsInfo { get; set; }
        public bool IsError { get; set; }
        public bool IsWarning { get; set; }
        public int StatusCode { get; set; }
        public List<string> ValidationErrors { get; set; }
        public T Data { get; set; }

        public static BaseResponse<T> Success(T data, string message = null) =>
            new() { Succeeded = true, Data = data, Message = message };

        public static BaseResponse<T> Failure(string message) =>
            new() { Succeeded = false, Message = message, StatusCode = (int)HttpStatusCode.BadRequest };
    }
}
