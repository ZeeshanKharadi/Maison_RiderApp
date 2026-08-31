using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Orders;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

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

        /// <summary>
        /// POS / integration push — persists orders that riders can see.
        /// </summary>
        [HttpPost("AssignOrder")]
        [AllowAnonymous]
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
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }

        /// <summary>
        /// Same payload as AssignOrder, plus workerId. Only that rider sees the job
        /// on GET /api/Order/Available; other riders do not.
        /// </summary>
        [HttpPost("AssignOrderToRider")]
        [AllowAnonymous]
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
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }

        /// <summary>
        /// Rider list — open pool (unassigned Available) plus jobs reserved for this rider.
        /// </summary>
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
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }

        [HttpPost("{id}/status")]
        [Authorize]
        public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateOrderStatusRequest request)
        {
            try
            {
                if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                    return Unauthorized();

                long numericId;
                if (!long.TryParse(id, out numericId))
                {
                    var byExternal = await _orderService.GetOrderByExternalIdAsync(id);
                    if (!byExternal.status || byExternal.Data == null)
                        return NotFound(byExternal);
                    numericId = byExternal.Data.id;
                }

                await _orderService.TouchLastSeenAsync(uid);
                var result = await _orderService.UpdateRiderStatusAsync(numericId, uid, request);
                if (!result.status)
                    return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating order status {OrderId}", id);
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }

        [HttpGet("{id}")]
        [Authorize]
        public async Task<IActionResult> GetOrderById(string id)
        {
            try
            {
                ApiResponse<AvailableOrderDto> result;

                // Prefer DB primary key when numeric; also accept external orderId (e.g. "89012").
                if (long.TryParse(id, out var numericId))
                {
                    result = await _orderService.GetOrderByIdAsync(numericId);
                    if (!result.status)
                        result = await _orderService.GetOrderByExternalIdAsync(id);
                }
                else
                {
                    result = await _orderService.GetOrderByExternalIdAsync(id);
                }

                if (!result.status)
                    return NotFound(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading order {OrderId}", id);
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }
    }
}
