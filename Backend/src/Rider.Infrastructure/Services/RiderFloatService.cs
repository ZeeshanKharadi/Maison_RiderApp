using Microsoft.EntityFrameworkCore;
using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Float;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Services
{
    public class RiderFloatService : IRiderFloatService
    {
        private readonly IUnitOfWork _unitOfWork;

        public RiderFloatService(IUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public Task<ApiResponse<FloatSummaryDto>> GetSummaryForRiderAsync(Guid riderUserId)
            => BuildSummaryAsync(riderUserId, storeScope: null);

        public async Task<ApiResponse<FloatSummaryDto>> GetSummaryAsync(AdminActor actor, Guid riderUserId)
        {
            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderUserId);
            if (rider == null || !CanAccessRider(actor, rider))
                return FailSummary("Rider not found");
            return await BuildSummaryAsync(riderUserId, actor.IsHeadOffice ? null : actor.StoreId);
        }

        public async Task<ApiResponse<List<FloatLedgerEntryDto>>> GetPendingAcknowledgmentsAsync(
            AdminActor actor, string? storeId)
        {
            var scope = actor.IsHeadOffice
                ? (string.IsNullOrWhiteSpace(storeId) ? null : storeId.Trim())
                : actor.StoreId;
            if (!actor.IsHeadOffice && string.IsNullOrWhiteSpace(scope))
                return new ApiResponse<List<FloatLedgerEntryDto>>(false, "Store scope required", null);

            var q = _unitOfWork.Context.Set<RiderFloatLedger>()
                .AsNoTracking()
                .Where(e => e.EntryType == FloatEntryTypes.Issue && e.Status == FloatIssueStatuses.PendingAck);
            if (!string.IsNullOrWhiteSpace(scope))
                q = q.Where(e => e.StoreId == scope);

            var rows = await q.OrderBy(e => e.CreatedAt).Take(100).ToListAsync();
            var list = new List<FloatLedgerEntryDto>();
            foreach (var row in rows)
                list.Add(await MapAsync(row));
            return new ApiResponse<List<FloatLedgerEntryDto>>(true, "Pending float acknowledgments", list);
        }

        public async Task<ApiResponse<FloatLedgerEntryDto>> IssueAsync(AdminActor actor, FloatMutationRequest request)
        {
            if (request == null) return FailEntry("Request is required");
            var requestId = (request.requestId ?? "").Trim();
            if (string.IsNullOrEmpty(requestId)) return FailEntry("requestId is required");
            if (requestId.Length > 100) return FailEntry("requestId is too long");

            var storeId = (request.storeId ?? "").Trim();
            if (string.IsNullOrEmpty(storeId)) return FailEntry("storeId is required");
            if (!actor.IsHeadOffice
                && !string.Equals(actor.StoreId, storeId, StringComparison.OrdinalIgnoreCase))
                return FailEntry("You can only issue float for your store");

            if (request.amount <= 0) return FailEntry("amount must be greater than zero");

            await using var tx = await _unitOfWork.Context.Database.BeginTransactionAsync();
            try
            {
                var existing = await _unitOfWork.Context.Set<RiderFloatLedger>()
                    .AsNoTracking()
                    .FirstOrDefaultAsync(e => e.RequestId == requestId);
                if (existing != null)
                {
                    if (existing.EntryType != FloatEntryTypes.Issue
                        || existing.RiderUserId != request.riderUserId
                        || !string.Equals(existing.StoreId, storeId, StringComparison.OrdinalIgnoreCase)
                        || existing.Amount != request.amount)
                    {
                        await tx.RollbackAsync();
                        return FailEntry("Conflicting reuse of requestId");
                    }
                    await tx.CommitAsync();
                    return new ApiResponse<FloatLedgerEntryDto>(true, "Idempotent replay", await MapAsync(existing));
                }

                var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(request.riderUserId);
                if (rider == null || !rider.IsActive || !CanAccessRider(actor, rider))
                {
                    await tx.RollbackAsync();
                    return FailEntry("Rider not found");
                }
                if (!string.IsNullOrWhiteSpace(rider.StoreId)
                    && !string.Equals(rider.StoreId, storeId, StringComparison.OrdinalIgnoreCase)
                    && !actor.IsHeadOffice)
                {
                    await tx.RollbackAsync();
                    return FailEntry("Rider is not assigned to this store");
                }

                await _unitOfWork.StoreRepository.EnsureExistsAsync(storeId, storeId);

                var entry = new RiderFloatLedger
                {
                    RiderUserId = request.riderUserId,
                    StoreId = storeId,
                    Amount = request.amount,
                    EntryType = FloatEntryTypes.Issue,
                    Status = FloatIssueStatuses.PendingAck,
                    ActorUserId = actor.UserId,
                    Reason = string.IsNullOrWhiteSpace(request.reason) ? null : request.reason.Trim(),
                    RequestId = requestId,
                    CreatedAt = DateTime.UtcNow
                };
                await _unitOfWork.Context.Set<RiderFloatLedger>().AddAsync(entry);
                await _unitOfWork.SaveChangesAsync();
                await tx.CommitAsync();
                return new ApiResponse<FloatLedgerEntryDto>(true, "Float issued — awaiting rider acknowledgment", await MapAsync(entry));
            }
            catch (DbUpdateException)
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                var race = await _unitOfWork.Context.Set<RiderFloatLedger>()
                    .AsNoTracking().FirstOrDefaultAsync(e => e.RequestId == requestId);
                if (race != null
                    && race.EntryType == FloatEntryTypes.Issue
                    && race.RiderUserId == request.riderUserId
                    && race.Amount == request.amount)
                    return new ApiResponse<FloatLedgerEntryDto>(true, "Idempotent replay", await MapAsync(race));
                return FailEntry("Conflicting reuse of requestId");
            }
            catch
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                throw;
            }
        }

        public async Task<ApiResponse<FloatLedgerEntryDto>> AcknowledgeAsync(
            Guid riderUserId, FloatAcknowledgeRequest request)
        {
            if (request == null) return FailEntry("Request is required");
            var requestId = (request.requestId ?? "").Trim();
            if (string.IsNullOrEmpty(requestId)) return FailEntry("requestId is required");

            await using var tx = await _unitOfWork.Context.Database.BeginTransactionAsync();
            try
            {
                var entry = await _unitOfWork.Context.Set<RiderFloatLedger>()
                    .FirstOrDefaultAsync(e => e.Id == request.issueId);
                if (entry == null
                    || entry.EntryType != FloatEntryTypes.Issue
                    || entry.RiderUserId != riderUserId)
                {
                    await tx.RollbackAsync();
                    return FailEntry("Float issue not found");
                }

                if (entry.Status == FloatIssueStatuses.Acknowledged)
                {
                    if (string.Equals(entry.AckRequestId, requestId, StringComparison.Ordinal))
                    {
                        await tx.CommitAsync();
                        return new ApiResponse<FloatLedgerEntryDto>(true, "Idempotent replay", await MapAsync(entry));
                    }
                    await tx.RollbackAsync();
                    return FailEntry("Float issue already acknowledged");
                }

                var ackTaken = await _unitOfWork.Context.Set<RiderFloatLedger>()
                    .AsNoTracking()
                    .AnyAsync(e => e.AckRequestId == requestId && e.Id != entry.Id);
                if (ackTaken)
                {
                    await tx.RollbackAsync();
                    return FailEntry("Conflicting reuse of requestId");
                }

                entry.Status = FloatIssueStatuses.Acknowledged;
                entry.AcknowledgedAt = DateTime.UtcNow;
                entry.AcknowledgedByUserId = riderUserId;
                entry.AckRequestId = requestId;
                await _unitOfWork.SaveChangesAsync();
                await tx.CommitAsync();
                return new ApiResponse<FloatLedgerEntryDto>(true, "Float acknowledged", await MapAsync(entry));
            }
            catch (DbUpdateException)
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                return FailEntry("Unable to acknowledge float (concurrency or duplicate requestId)");
            }
            catch
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                throw;
            }
        }

        public async Task<ApiResponse<FloatLedgerEntryDto>> RecordReturnAsync(
            AdminActor actor, FloatMutationRequest request)
        {
            if (request == null) return FailEntry("Request is required");
            var requestId = (request.requestId ?? "").Trim();
            if (string.IsNullOrEmpty(requestId)) return FailEntry("requestId is required");

            var storeId = (request.storeId ?? "").Trim();
            if (string.IsNullOrEmpty(storeId)) return FailEntry("storeId is required");
            if (!actor.IsHeadOffice
                && !string.Equals(actor.StoreId, storeId, StringComparison.OrdinalIgnoreCase))
                return FailEntry("You can only receive float for your store");

            if (request.amount <= 0) return FailEntry("amount must be greater than zero");

            await using var tx = await _unitOfWork.Context.Database.BeginTransactionAsync();
            try
            {
                var existing = await _unitOfWork.Context.Set<RiderFloatLedger>()
                    .AsNoTracking()
                    .FirstOrDefaultAsync(e => e.RequestId == requestId);
                if (existing != null)
                {
                    if (existing.EntryType != FloatEntryTypes.Return
                        || existing.RiderUserId != request.riderUserId
                        || existing.Amount != request.amount)
                    {
                        await tx.RollbackAsync();
                        return FailEntry("Conflicting reuse of requestId");
                    }
                    await tx.CommitAsync();
                    return new ApiResponse<FloatLedgerEntryDto>(true, "Idempotent replay", await MapAsync(existing));
                }

                var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(request.riderUserId);
                if (rider == null || !CanAccessRider(actor, rider))
                {
                    await tx.RollbackAsync();
                    return FailEntry("Rider not found");
                }

                var outstanding = await SumOutstandingAsync(request.riderUserId);
                if (request.amount > outstanding)
                {
                    await tx.RollbackAsync();
                    return FailEntry(
                        $"Return amount ({request.amount:0.00}) exceeds outstanding float ({outstanding:0.00})");
                }

                var entry = new RiderFloatLedger
                {
                    RiderUserId = request.riderUserId,
                    StoreId = storeId,
                    Amount = request.amount,
                    EntryType = FloatEntryTypes.Return,
                    Status = null,
                    ActorUserId = actor.UserId,
                    Reason = string.IsNullOrWhiteSpace(request.reason) ? null : request.reason.Trim(),
                    RequestId = requestId,
                    CreatedAt = DateTime.UtcNow
                };
                await _unitOfWork.Context.Set<RiderFloatLedger>().AddAsync(entry);
                await _unitOfWork.SaveChangesAsync();
                await tx.CommitAsync();
                return new ApiResponse<FloatLedgerEntryDto>(true, "Float return recorded", await MapAsync(entry));
            }
            catch (DbUpdateException)
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                var race = await _unitOfWork.Context.Set<RiderFloatLedger>()
                    .AsNoTracking().FirstOrDefaultAsync(e => e.RequestId == requestId);
                if (race != null && race.EntryType == FloatEntryTypes.Return && race.Amount == request.amount)
                    return new ApiResponse<FloatLedgerEntryDto>(true, "Idempotent replay", await MapAsync(race));
                return FailEntry("Conflicting reuse of requestId");
            }
            catch
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                throw;
            }
        }

        public Task<decimal> GetOutstandingFloatAsync(Guid riderUserId)
            => SumOutstandingAsync(riderUserId);

        private async Task<ApiResponse<FloatSummaryDto>> BuildSummaryAsync(Guid riderUserId, string? storeScope)
        {
            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderUserId);
            if (rider == null) return FailSummary("Rider not found");

            var outstanding = await SumOutstandingAsync(riderUserId);
            var pendingQ = _unitOfWork.Context.Set<RiderFloatLedger>()
                .AsNoTracking()
                .Where(e => e.RiderUserId == riderUserId
                    && e.EntryType == FloatEntryTypes.Issue
                    && e.Status == FloatIssueStatuses.PendingAck);
            if (!string.IsNullOrWhiteSpace(storeScope))
                pendingQ = pendingQ.Where(e => e.StoreId == storeScope);

            var pending = await pendingQ.OrderBy(e => e.CreatedAt).ToListAsync();
            var historyQ = _unitOfWork.Context.Set<RiderFloatLedger>()
                .AsNoTracking()
                .Where(e => e.RiderUserId == riderUserId);
            if (!string.IsNullOrWhiteSpace(storeScope))
                historyQ = historyQ.Where(e => e.StoreId == storeScope);
            var recent = await historyQ.OrderByDescending(e => e.CreatedAt).Take(30).ToListAsync();

            var pendingDtos = new List<FloatLedgerEntryDto>();
            foreach (var p in pending) pendingDtos.Add(await MapAsync(p));
            var recentDtos = new List<FloatLedgerEntryDto>();
            foreach (var r in recent) recentDtos.Add(await MapAsync(r));

            return new ApiResponse<FloatSummaryDto>(true, "Float summary", new FloatSummaryDto
            {
                riderUserId = riderUserId,
                riderWorkerId = rider.ThirdPartyEmployeeId,
                riderName = rider.UserName,
                storeId = storeScope ?? rider.StoreId,
                outstandingFloat = outstanding,
                pendingAcknowledgmentTotal = pending.Sum(p => p.Amount),
                pendingAcknowledgments = pendingDtos,
                recent = recentDtos,
                asOfUtc = DateTime.UtcNow
            });
        }

        private async Task<decimal> SumOutstandingAsync(Guid riderUserId)
        {
            var issued = await _unitOfWork.Context.Set<RiderFloatLedger>()
                .AsNoTracking()
                .Where(e => e.RiderUserId == riderUserId
                    && e.EntryType == FloatEntryTypes.Issue
                    && e.Status == FloatIssueStatuses.Acknowledged)
                .SumAsync(e => (decimal?)e.Amount) ?? 0m;
            var returned = await _unitOfWork.Context.Set<RiderFloatLedger>()
                .AsNoTracking()
                .Where(e => e.RiderUserId == riderUserId && e.EntryType == FloatEntryTypes.Return)
                .SumAsync(e => (decimal?)e.Amount) ?? 0m;
            return Math.Max(0m, issued - returned);
        }

        private async Task<FloatLedgerEntryDto> MapAsync(RiderFloatLedger e)
        {
            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(e.RiderUserId);
            var actor = await _unitOfWork.UserRepository.GetByUserIdAsync(e.ActorUserId);
            return new FloatLedgerEntryDto
            {
                id = e.Id,
                riderUserId = e.RiderUserId,
                riderWorkerId = rider?.ThirdPartyEmployeeId,
                riderName = rider?.UserName,
                storeId = e.StoreId,
                amount = e.Amount,
                entryType = e.EntryType,
                status = e.Status,
                acknowledgedAt = e.AcknowledgedAt,
                actorUserId = e.ActorUserId,
                actorName = actor?.UserName,
                reason = e.Reason,
                requestId = e.RequestId,
                createdAt = e.CreatedAt
            };
        }

        private static bool CanAccessRider(AdminActor actor, AppUser rider)
        {
            if (actor.IsHeadOffice) return true;
            return !string.IsNullOrWhiteSpace(actor.StoreId)
                && string.Equals(actor.StoreId, rider.StoreId, StringComparison.OrdinalIgnoreCase);
        }

        private static ApiResponse<FloatLedgerEntryDto> FailEntry(string msg)
            => new(false, msg, null);

        private static ApiResponse<FloatSummaryDto> FailSummary(string msg)
            => new(false, msg, null);
    }
}
