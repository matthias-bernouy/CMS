export const BEHAVIORAL_RLS_CHECK_IDS = Object.freeze({
    environment: "supabase-rls-runtime",
    reads: "tenant-read-isolation",
    writes: "tenant-write-isolation",
});

export const BEHAVIORAL_RLS_IDENTITIES = Object.freeze({
    first: "0194df39-2b9e-7d9e-9803-81ca737dd9d1",
    second: "0194df39-2b9e-7d9e-9803-81ca737dd9d2",
});

export const BEHAVIORAL_RLS_LIMITS = Object.freeze({
    probes: 32,
    fixtureFields: 48,
    stringBytes: 4_096,
    planBytes: 512 * 1_024,
    statementTimeoutMs: 2_000,
    lockTimeoutMs: 1_000,
});
