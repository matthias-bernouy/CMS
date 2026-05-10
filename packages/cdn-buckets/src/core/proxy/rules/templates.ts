import type { RulesConfig } from "../../../interfaces/proxy/RulesConfig";

/**
 * A pre-baked rules + secrets template the admin UI can drop into the
 * editor as a starting point. `secrets` lists the env names the rules
 * reference, with empty placeholder values — the user fills them in
 * before saving.
 *
 * Browser-safe: this module imports only types, holds only data. Both
 * `<bsp-proxy-rules-editor>` (cdn-buckets) and `<cms-data-provider-rules>`
 * (cms) import from here.
 */
export type RulesTemplate = {
    label:       string;
    description: string;
    rules:       RulesConfig;
    secrets:     Record<string, string>;
};

export const RULE_TEMPLATES: RulesTemplate[] = [
    {
        label:       "Empty (catch-all forward)",
        description: "Forwards everything to the upstream as-is. No auth, no transformation.",
        rules:       { paths: {} },
        secrets:     {},
    },
    {
        label:       "Bearer token",
        description: "Authorization: Bearer <token> injected on every request. Used by Stripe, OpenAI, GitHub, …",
        rules: {
            defaults: { on_request: [
                { type: "inject_header", name: "Authorization", value: "Bearer ${env:API_TOKEN}" },
            ] },
            paths: {},
        },
        secrets: { API_TOKEN: "" },
    },
    {
        label:       "API key in header (Supabase-style)",
        description: "Custom header like 'apikey' or 'X-API-Key' on every request.",
        rules: {
            defaults: { on_request: [
                { type: "inject_header", name: "apikey", value: "${env:API_KEY}" },
            ] },
            paths: {},
        },
        secrets: { API_KEY: "" },
    },
    {
        label:       "Multi-header auth",
        description: "Two headers — e.g. Supabase wants both 'apikey' and 'Authorization: Bearer <jwt>'.",
        rules: {
            defaults: { on_request: [
                { type: "inject_header", name: "apikey",        value: "${env:API_KEY}" },
                { type: "inject_header", name: "Authorization", value: "Bearer ${env:API_TOKEN}" },
            ] },
            paths: {},
        },
        secrets: { API_KEY: "", API_TOKEN: "" },
    },
    {
        label:       "Auth on /api/* only (public assets pass through)",
        description: "Public paths reach the upstream unauthenticated. Only /api/** gets the bearer.",
        rules: {
            paths: {
                "/api/**": { on_request: [
                    { type: "inject_header", name: "Authorization", value: "Bearer ${env:API_TOKEN}" },
                ] },
            },
        },
        secrets: { API_TOKEN: "" },
    },
    {
        label:       "OAuth login + httpOnly cookie session (Supabase magic link)",
        description: "POST /auth/v1/token captures access_token + refresh_token from JSON into httpOnly cookies; /rest/v1/* requires the session cookie + injects Bearer.",
        rules: {
            defaults: { on_request: [
                { type: "inject_header", name: "apikey", value: "${env:API_KEY}" },
            ] },
            paths: {
                "/auth/v1/token": {
                    methods: ["POST"],
                    on_response: [
                        { type: "extract_json", field: "access_token",
                          action: { type: "set_cookie", name: "sb-access-token",
                                    attributes: { max_age: 3600,    http_only: true, secure: true, same_site: "Lax", path: "/" } } },
                        { type: "extract_json", field: "refresh_token",
                          action: { type: "set_cookie", name: "sb-refresh-token",
                                    attributes: { max_age: 2592000, http_only: true, secure: true, same_site: "Lax", path: "/" } } },
                        { type: "strip_body_fields", fields: ["access_token", "refresh_token"] },
                    ],
                },
                "/rest/v1/*": {
                    on_request: [
                        { type: "require_cookie", name: "sb-access-token",
                          on_missing: { type: "redirect", url: "/.cms/data/<provider>/login?redirectTo={original_url}" } },
                        { type: "cookie_to_header", cookie_name: "sb-access-token",
                          header_name: "Authorization", prefix: "Bearer " },
                    ],
                },
            },
        },
        secrets: { API_KEY: "" },
    },
];
