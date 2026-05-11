import type { RulesConfig, ProxyRule, CookieAttributes } from "@bernouy/cdn-buckets";

const COOKIE_BASE: CookieAttributes = { http_only: true, secure: true, same_site: "Lax", path: "/" };
const ACCESS_MAX_AGE  = 3600;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

const CAPTURE_TOKENS: ProxyRule[] = [
    { type: "extract_json", field: "access_token",
      action: { type: "set_cookie", name: "sb-access-token",
                attributes: { ...COOKIE_BASE, max_age: ACCESS_MAX_AGE } } },
    { type: "extract_json", field: "refresh_token",
      action: { type: "set_cookie", name: "sb-refresh-token",
                attributes: { ...COOKIE_BASE, max_age: REFRESH_MAX_AGE } } },
    { type: "strip_body_fields", fields: ["access_token", "refresh_token"] },
];

const USE_ACCESS_COOKIE: ProxyRule[] = [
    { type: "cookie_to_header",
      cookie_name: "sb-access-token", header_name: "Authorization", prefix: "Bearer " },
];

/**
 * Canonical rules for Supabase email/password auth via GoTrue.
 *
 * Flow:
 *  - All calls inject `apikey: ${env:SUPABASE_ANON_KEY}` (GoTrue requires it on every request).
 *  - `POST /signup` and `POST /token` capture `access_token` + `refresh_token` from the
 *    response body into httpOnly cookies (`sb-access-token` 1 h, `sb-refresh-token` 30 d)
 *    and strip them from the body so they never reach the browser JS.
 *  - `GET/PUT /user` and `POST /logout` lift the access cookie back into
 *    `Authorization: Bearer <token>` before forwarding to GoTrue.
 *
 * The browser only ever talks to `/.cms/data/<providerId>/...`. It never sees
 * the anon key (lives in nginx Lua, sourced from `cms_secrets`) and never sees
 * the user tokens (httpOnly cookies set by the edge).
 */
export function buildSupabaseRules(): RulesConfig {
    return {
        defaults: { on_request: [
            { type: "inject_header", name: "apikey", value: "${env:SUPABASE_ANON_KEY}" },
        ] },
        paths: {
            "/signup": { methods: ["POST"], on_response: CAPTURE_TOKENS },
            "/token":  { methods: ["POST"], on_response: CAPTURE_TOKENS },
            "/user":   { on_request: USE_ACCESS_COOKIE },
            "/logout": { methods: ["POST"], on_request: USE_ACCESS_COOKIE },
        },
    };
}

export const SUPABASE_SECRET_ENV = "SUPABASE_ANON_KEY";
