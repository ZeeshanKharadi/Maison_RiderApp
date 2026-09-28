using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Rider.Application.DTOs.Orders;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.WebAPI.Filters;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController : ControllerBase
    {
        private readonly IOrderService _orderService;
        private readonly ILogger<OrderController> _logger;

        public OrderController(IOrderService orderService, ILogger<OrderController> logger)
        {
            _orderService = orderService;
            _logger = logger;
        }

        /// <summary>POS / integration push — persists orders that riders can see.</summary>
        [HttpPost("AssignOrder")]
        [PosIntegrationAuth]
        public async Task<IActionResult> AssignOrder([FromBody] AssignOrderRequest request)
        {
            try
            {
                var result = await _orderService.AssignOrderAsync(request);
                if (!result.status)
                    return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during AssignOrder");
                return BadRequest(new ApiResponse<string>(false, "Unable to assign orders", null));
            }
        }

        /// <summary>Same payload as AssignOrder, plus workerId for direct dispatch.</summary>
        [HttpPost("AssignOrderToRider")]
        [PosIntegrationAuth]
        public async Task<IActionResult> AssignOrderToRider([FromBody] AssignOrderToRiderRequest request)
        {
            try
            {
                var result = await _orderService.AssignOrderToRiderAsync(request);
                if (!result.status)
                    return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during AssignOrderToRider");
                return BadRequest(new ApiResponse<string>(false, "Unable to assign orders to rider", null));
            }
        }

        [HttpGet("Available")]
        [Authorize]
        public async Task<IActionResult> GetAvailableOrders()
        {
            try
            {
                if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                    return Unauthorized();

                await _orderService.TouchLastSeenAsync(uid);
                var result = await _orderService.GetAvailableOrdersAsync(uid);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading available orders");
                return BadRequest(new ApiResponse<string>(false, "Unable to load orders", null));
            }
        }

        [HttpGet("Active")]
        [Authorize]
        public async Task<IActionResult> GetActiveOrders()
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            await _orderService.TouchLastSeenAsync(uid);
            return Ok(await _orderService.GetActiveOrdersAsync(uid));
        }

        /// <summary>
        /// Unacknowledged cancellations for this rider (durable inbox catch-up).
        /// Cancelled jobs stay out of Active. withinMinutes is ignored.
        /// </summary>
        [HttpGet("RecentCancellations")]
        [Authorize]
        public async Task<IActionResult> GetRecentCancellations([FromQuery] int withinMinutes = 180)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            return Ok(await _orderService.GetRecentlyCancelledOrdersAsync(uid, withinMinutes));
        }

        /// <summary>
        /// Marks cancel-inbox notifications read for the assigned rider (cross-device durable ack).
        /// </summary>
        [HttpPost("AcknowledgeCancellations")]
        [Authorize]
        public async Task<IActionResult> AcknowledgeCancellations([FromBody] AcknowledgeCancellationsRequest request)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            return Ok(await _orderService.AcknowledgeCancellationsAsync(
                uid, request ?? new AcknowledgeCancellationsRequest()));
        }

        [HttpGet("History")]
        [Authorize]
        public async Task<IActionResult> GetHistory([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            return Ok(await _orderService.GetOrderHistoryAsync(uid, page, pageSize));
        }

        [HttpGet("Performance")]
        [Authorize]
        public async Task<IActionResult> GetPerformance([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            return Ok(await _orderService.GetPerformanceAsync(uid, from, to));
        }

        [HttpPost("availability")]
        [Authorize]
        public async Task<IActionResult> SetAvailability([FromBody] SetAvailabilityRequest request)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            var result = await _orderService.SetAvailabilityAsync(uid, request?.isOnline ?? false);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("location")]
        [Authorize]
        [EnableRateLimiting("location")]
        public async Task<IActionResult> UpdateLocation([FromBody] UpdateRiderLocationRequest request)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            var result = await _orderService.UpdateRiderLocationAsync(uid, request ?? new UpdateRiderLocationRequest());
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/reject")]
        [Authorize]
        public async Task<IActionResult> Reject(string id, [FromBody] RejectOrderRequest request)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            var resolve = await TryResolveOrderIdAsync(id, uid);
            if (!resolve.ok)
                return resolve.notFound!;

            request ??= new RejectOrderRequest();
            if (string.IsNullOrWhiteSpace(request.requestId)
                && Request.Headers.TryGetValue("Idempotency-Key", out var key)
                && !string.IsNullOrWhiteSpace(key))
            {
                request.requestId = key.ToString();
            }

            await _orderService.TouchLastSeenAsync(uid);
            var result = await _orderService.RejectOrderAsync(resolve.numericId, uid, request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/report-issue")]
        [Authorize]
        public async Task<IActionResult> ReportIssue(string id, [FromBody] ReportDeliveryIssueRequest request)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            var resolve = await TryResolveOrderIdAsync(id, uid);
            if (!resolve.ok)
                return resolve.notFound!;

            request ??= new ReportDeliveryIssueRequest();
            if (string.IsNullOrWhiteSpace(request.requestId)
                && Request.Headers.TryGetValue("Idempotency-Key", out var key)
                && !string.IsNullOrWhiteSpace(key))
            {
                request.requestId = key.ToString();
            }

            await _orderService.TouchLastSeenAsync(uid);
            var result = await _orderService.ReportDeliveryIssueAsync(resolve.numericId, uid, request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        /// <summary>
        /// Rider requests controlled failed delivery (creates issue report + pending failure).
        /// Does not mark the order Failed; manager must approve return.
        /// </summary>
        [HttpPost("{id}/request-failed-delivery")]
        [Authorize]
        public async Task<IActionResult> RequestFailedDelivery(string id, [FromBody] RequestFailedDeliveryRequest request)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            var resolve = await TryResolveOrderIdAsync(id, uid);
            if (!resolve.ok)
                return resolve.notFound!;

            request ??= new RequestFailedDeliveryRequest();
            if (string.IsNullOrWhiteSpace(request.requestId)
                && Request.Headers.TryGetValue("Idempotency-Key", out var key)
                && !string.IsNullOrWhiteSpace(key))
            {
                request.requestId = key.ToString();
            }

            await _orderService.TouchLastSeenAsync(uid);
            var result = await _orderService.RequestFailedDeliveryAsync(resolve.numericId, uid, request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        /// <summary>Rider confirms arrival back at store after return was approved.</summary>
        [HttpPost("{id}/confirm-return-to-store")]
        [Authorize]
        public async Task<IActionResult> ConfirmReturnToStore(string id, [FromBody] RejectOrderRequest? body)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            var resolve = await TryResolveOrderIdAsync(id, uid);
            if (!resolve.ok)
                return resolve.notFound!;

            var requestId = body?.requestId;
            if (string.IsNullOrWhiteSpace(requestId)
                && Request.Headers.TryGetValue("Idempotency-Key", out var key)
                && !string.IsNullOrWhiteSpace(key))
            {
                requestId = key.ToString();
            }

            await _orderService.TouchLastSeenAsync(uid);
            var result = await _orderService.ConfirmReturnToStoreAsync(resolve.numericId, uid, requestId);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/status")]
        [Authorize]
        public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateOrderStatusRequest request)
        {
            try
            {
                if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                    return Unauthorized();

                request ??= new UpdateOrderStatusRequest();
                if (string.IsNullOrWhiteSpace(request.requestId)
                    && Request.Headers.TryGetValue("Idempotency-Key", out var key)
                    && !string.IsNullOrWhiteSpace(key))
                {
                    request.requestId = key.ToString();
                }

                var resolve = await TryResolveOrderIdAsync(id, uid);
                if (!resolve.ok)
                    return resolve.notFound!;

                await _orderService.TouchLastSeenAsync(uid);
                var result = await _orderService.UpdateRiderStatusAsync(resolve.numericId, uid, request);
                if (!result.status)
                    return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating order status {OrderId}", id);
                return BadRequest(new ApiResponse<string>(false, "Unable to update order status", null));
            }
        }

        [HttpGet("{id}")]
        [Authorize]
        public async Task<IActionResult> GetOrderById(string id)
        {
            try
            {
                if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                    return Unauthorized();

                ApiResponse<AvailableOrderDto> result;

                if (long.TryParse(id, out var numericId))
                {
                    result = await _orderService.GetOrderByIdAsync(numericId, uid);
                    if (!result.status)
                        result = await _orderService.GetOrderByExternalIdAsync(id, uid);
                }
                else
                {
                    result = await _orderService.GetOrderByExternalIdAsync(id, uid);
                }

                if (!result.status)
                    return NotFound(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading order {OrderId}", id);
                return BadRequest(new ApiResponse<string>(false, "Unable to load order", null));
            }
        }

        private async Task<(bool ok, long numericId, IActionResult? notFound)> TryResolveOrderIdAsync(string id, Guid uid)
        {
            if (long.TryParse(id, out var numericId))
                return (true, numericId, null);

            var byExternal = await _orderService.GetOrderByExternalIdAsync(id, uid);
            if (!byExternal.status || byExternal.Data == null)
                return (false, 0, NotFound(byExternal));

            return (true, byExternal.Data.id, null);
        }
    }
}
