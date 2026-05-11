import type { RulesConfig } from "@bernouy/cdn-buckets";

/**
 * Canonical rules for Supabase data (PostgREST). Two defaults run on every request:
 *
 *  1. `apikey: ${env:SUPABASE_ANON_KEY}` — required by PostgREST on every call,
 *     identifies the project. Always present.
 *  2. `cookie_to_header sb-access-token → Authorization: Bearer …` — opportunistic.
 *     If the user signed in via the companion `supabase-auth` provider, the
 *     access cookie was set with `Path=/` so it reaches `/.cms/data/<this>/`.
 *     The user's JWT then unlocks RLS-protected rows. **Without** the cookie
 *     the request still goes through; PostgREST falls back to the anon role
 *     and only RLS policies tagged "anon" return rows.
 *
 * `paths: {}` — no path-specific rules. PostgREST's surface is dynamic
 * (one endpoint per user table, plus RPC), so we keep the template
 * generic. Per-table rules can be added later via the Edit modal.
 */
export function buildSupabaseDataRules(): RulesConfig {
    return {
        defaults: { on_request: [
            { type: "inject_header", name: "apikey", value: "${env:SUPABASE_ANON_KEY}" },
            { type: "cookie_to_header",
              cookie_name: "sb-access-token", header_name: "Authorization", prefix: "Bearer ",
              omit_if_missing: true },
        ] },
        paths: {},
    };
}

export const SUPABASE_DATA_SECRET_ENV = "SUPABASE_ANON_KEY";
