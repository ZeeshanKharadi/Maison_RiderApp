/**
 * @deprecated Prefer RiderSessionContext.
 * Re-exports keep Phase 1/2A imports working.
 */
export {
  RiderSessionProvider as RiderStatusProvider,
  useRiderStatus,
  useRiderSession,
} from './RiderSessionContext';
