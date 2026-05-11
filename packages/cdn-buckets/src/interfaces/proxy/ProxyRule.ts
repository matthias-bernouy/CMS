/**
 * Declarative proxy rule consumed by `BucketProxy`. The whole union is
 * the public DSL — adding a primitive means adding an arm here, a parser
 * in `core/proxy/rules/parseRule.ts`, and a Lua emitter (Phase 2).
 */
export type RulePhase = "request" | "response";

export type SameSite = "Strict" | "Lax" | "None";

/** Cookie attributes shared by every primitive that emits Set-Cookie. */
export type CookieAttributes = {
    max_age?:   number;
    path?:      string;
    domain?:    string;
    http_only?: boolean;
    secure?:    boolean;
    same_site?: SameSite;
};

/** What to do when a `require_*` rule's precondition fails. */
export type OnMissingStrategy =
    | { type: "redirect";       url: string }
    | { type: "status";         code: number }
    | { type: "silent_refresh"; refresh_path: string };

// ── on_request ──────────────────────────────────────────────────────────

export type RequireCookieRule = {
    type:       "require_cookie";
    name:       string;
    on_missing: OnMissingStrategy;
};

export type RequireHeaderRule = {
    type:       "require_header";
    name:       string;
    on_missing: OnMissingStrategy;
};

export type CookieToHeaderRule = {
    type:        "cookie_to_header";
    cookie_name: string;
    header_name: string;
    /** Literal prefix prepended to the cookie value (e.g. `"Bearer "`). */
    prefix?:     string;
    /**
     * When true, the header is set ONLY if the cookie is present and
     * non-empty. Without this flag, an absent cookie still emits the
     * header with an empty value (e.g. `Authorization: Bearer `) which
     * upstreams like PostgREST treat as malformed-JWT → 401. Use this
     * flag for opportunistic auth where anonymous access must remain
     * possible.
     */
    omit_if_missing?: boolean;
};

export type CookieToBodyFieldRule = {
    type:        "cookie_to_body_field";
    cookie_name: string;
    body_field:  string;
};

export type InjectHeaderRule = {
    type:  "inject_header";
    name:  string;
    /** Literal, or interpolation: `${env:VAR}` (whitelist) | `${cookie:NAME}`. */
    value: string;
};

export type InjectCookieRule = {
    type:       "inject_cookie";
    name:       string;
    value:      string;
    attributes?: CookieAttributes;
};

export type InjectQueryParamRule = {
    type:  "inject_query_param";
    name:  string;
    /** Literal, or interpolation: `${env:VAR}` (whitelist) | `${cookie:NAME}`.
     *  Always overrides any client-supplied value for the same key —
     *  same semantics as `inject_header`. Other client query params on
     *  the request are preserved. */
    value: string;
};

// ── on_response ─────────────────────────────────────────────────────────

/** Action taken with a value extracted from the upstream response body. */
export type ExtractAction =
    | { type: "set_cookie"; name: string; attributes?: CookieAttributes }
    | { type: "set_header"; name: string };

export type ExtractJsonRule = {
    type:             "extract_json";
    /** JSON path with dot notation, e.g. `"data.access_token"`. */
    field:            string;
    action:           ExtractAction;
    /** Default true: a captured token is removed from the body before
     *  it reaches the client. Set false only when the client also needs it. */
    strip_from_body?: boolean;
};

export type StripBodyFieldsRule = {
    type:   "strip_body_fields";
    fields: string[];
};

export type RewriteStatusRule = {
    type: "rewrite_status";
    from: number;
    to:   number;
    /** Apply the rewrite only when the response body contains this field
     *  (used when an upstream returns 200 with an error envelope). */
    if_body_field?: string;
};

export type ExtractHeaderToCookieRule = {
    type:        "extract_header_to_cookie";
    header_name: string;
    cookie_name: string;
    attributes?: CookieAttributes;
};

// ── union ───────────────────────────────────────────────────────────────

export type ProxyRule =
    | RequireCookieRule
    | RequireHeaderRule
    | CookieToHeaderRule
    | CookieToBodyFieldRule
    | InjectHeaderRule
    | InjectCookieRule
    | InjectQueryParamRule
    | ExtractJsonRule
    | StripBodyFieldsRule
    | RewriteStatusRule
    | ExtractHeaderToCookieRule;

export type ProxyRuleType = ProxyRule["type"];
