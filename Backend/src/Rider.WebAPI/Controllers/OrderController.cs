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
        /// Rider list — only orders previously saved via AssignOrder with Status = Available.
        /// </summary>
        [HttpGet("Available")]
        [Authorize]
        public async Task<IActionResult> GetAvailableOrders()
        {
            try
            {
                var result = await _orderService.GetAvailableOrdersAsync();
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading available orders");
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
