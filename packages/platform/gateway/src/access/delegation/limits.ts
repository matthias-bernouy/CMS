/** Shared bounds for ticket validation and both persistence adapters. */
export const DELEGATION_LIMITS = Object.freeze({
    lifetimeMs: 30_000,
    rootDeadlineMs: 15_000,
    activeTicketsPerSite: 256,
    childCalls: 32,
    requestBytes: 4 * 1024 * 1024,
});
