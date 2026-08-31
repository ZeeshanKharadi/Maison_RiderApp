using System.Net;
using System.Text.Json;
using Rider.Application.Exceptions;
using Rider.Domain.Common;

namespace Rider.WebAPI.Middleware
{
    public class GlobalExceptionHandler
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<GlobalExceptionHandler> _logger;

        public GlobalExceptionHandler(RequestDelegate next, ILogger<GlobalExceptionHandler> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task Invoke(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception ex)
            {
                await HandleExceptionAsync(context, ex);
            }
        }

        private async Task HandleExceptionAsync(HttpContext context, Exception exception)
        {
            context.Response.ContentType = "application/json";
            var responseModel = new BaseResponse<string>
            {
                Succeeded = false,
                StatusCode = (int)HttpStatusCode.InternalServerError,
                Message = "Internal Server Error! Please retry after sometime."
            };

            _logger.LogError(exception, "Unhandled exception");

            switch (exception)
            {
                case ValidatorException validationException:
                    responseModel.StatusCode = (int)HttpStatusCode.BadRequest;
                    responseModel.Message = "Validation errors!";
                    responseModel.ValidationErrors = validationException.ValdationErrors;
                    break;
                case ApplicationException:
                    responseModel.StatusCode = (int)HttpStatusCode.BadRequest;
                    responseModel.Message = exception.Message;
                    break;
            }

            context.Response.StatusCode = responseModel.StatusCode;
            await context.Response.WriteAsync(JsonSerializer.Serialize(responseModel,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        }
    }
}
