export const BEHAVIORAL_RLS_CHECK_IDS = Object.freeze({
    environment: "supabase-rls-runtime",
    reads: "tenant-read-isolation",
    writes: "tenant-write-isolation",
});

export const BEHAVIORAL_RLS_LIMITS = Object.freeze({
    probes: 32,
    fixtureFields: 48,
    stringBytes: 4_096,
    planBytes: 512 * 1_024,
    statementTimeoutMs: 2_000,
    lockTimeoutMs: 1_000,
});
