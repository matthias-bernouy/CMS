export const SUPABASE_SQL_BUNDLE_SCHEMA = "cms.integration.sql-bundle.v1";

export const SUPABASE_SQL_BUNDLE_LIMITS = Object.freeze({
    maxDepth: 24,
    maxFiles: 512,
    maxBytes: 8 * 1024 * 1024,
});

export type SupabaseSqlBundleLimits = typeof SUPABASE_SQL_BUNDLE_LIMITS;
