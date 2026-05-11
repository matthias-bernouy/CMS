import type {
    CookieToBodyFieldRule, CookieToHeaderRule,
    InjectCookieRule, InjectHeaderRule, InjectQueryParamRule, OnMissingStrategy,
    RequireCookieRule, RequireHeaderRule,
} from "../../../interfaces/proxy/ProxyRule";
import type { EmittedSnippet, RuleEmitter } from "../../../interfaces/proxy/EmittedSnippet";
import type { ResolvedSecretVar } from "./interpolation";
import { resolveInterpolations, nginxCookieVar, setByLuaForSecret } from "./interpolation";

/** Build the `set_by_lua_block` staging snippets for every secret used. */
function stagings(vars: ResolvedSecretVar[]): EmittedSnippet[] {
    return vars.map(v => ({ kind: "nginx", phase: "request", directive: setByLuaForSecret(v) }));
}

/**
 * Convert a YAML URL like `/login?redirectTo={original_url}` to a Lua
 * string expression that splices in `ngx.var.request_uri` at runtime
 * (URL-escaped for safe use as a query value).
 */
function luaUrlExpr(url: string): string {
    if (!url.includes("{original_url}")) return JSON.stringify(url);
    const parts = url.split("{original_url}");
    const pieces: string[] = [];
    parts.forEach((p, i) => {
        if (p !== "")          pieces.push(JSON.stringify(p));
        if (i < parts.length - 1) pieces.push("ngx.escape_uri(ngx.var.request_uri)");
    });
    return pieces.join(" .. ");
}

function luaOnMissing(s: OnMissingStrategy): string {
    if (s.type === "redirect") {
        return `return ngx.redirect(${luaUrlExpr(s.url)}, 302)`;
    }
    if (s.type === "status") {
        return `ngx.status = ${s.code}; return ngx.exit(${s.code})`;
    }
    return `ngx.status = 401; ngx.header["X-Auth-Refresh"] = ${JSON.stringify(s.refresh_path)}; return ngx.exit(401)`;
}

const nginxHeaderVar = (name: string) => "http_" + name.toLowerCase().replace(/-/g, "_");

// ── emitters ────────────────────────────────────────────────────────────

export const emitRequireCookie: RuleEmitter<RequireCookieRule> = (rule) => [{
    kind:  "lua",
    phase: "request",
    hook:  "access",
    code:  `local v = ngx.var.${nginxCookieVar(rule.name)}
if not v or v == "" then
    ${luaOnMissing(rule.on_missing)}
end`,
}];

export const emitRequireHeader: RuleEmitter<RequireHeaderRule> = (rule) => [{
    kind:  "lua",
    phase: "request",
    hook:  "access",
    code:  `local v = ngx.var.${nginxHeaderVar(rule.name)}
if not v or v == "" then
    ${luaOnMissing(rule.on_missing)}
end`,
}];

export const emitCookieToHeader: RuleEmitter<CookieToHeaderRule> = (rule) => {
    const prefix    = rule.prefix ?? "";
    const cookieVar = nginxCookieVar(rule.cookie_name);
    if (rule.omit_if_missing) {
        // Lua-based: only call ngx.req.set_header when the cookie is present
        // and non-empty. Skipping the header preserves anonymous semantics
        // upstream (e.g. PostgREST falls back to anon role).
        return [{
            kind:  "lua",
            phase: "request",
            hook:  "access",
            code:  `local v = ngx.var.${cookieVar}
if v and v ~= "" then
    ngx.req.set_header(${JSON.stringify(rule.header_name)}, ${JSON.stringify(prefix)} .. v)
end`,
        }];
    }
    return [{
        kind:      "nginx",
        phase:     "request",
        directive: `proxy_set_header ${rule.header_name} "${prefix}$${cookieVar}";`,
    }];
};

export const emitInjectHeader: RuleEmitter<InjectHeaderRule> = (rule, ctx) => {
    const r = resolveInterpolations(rule.value, ctx);
    return [
        ...stagings(r.vars),
        { kind: "nginx", phase: "request",
          directive: `proxy_set_header ${rule.name} "${r.nginxValue}";` },
    ];
};

/**
 * `inject_cookie` (request phase) appends the cookie to the upstream
 * `Cookie` request header. The optional `attributes` field is silently
 * ignored — Cookie request-headers don't carry attributes; those are a
 * Set-Cookie response concept. Interpolations are read at runtime via
 * `os.getenv` / `ngx.var`, never embedded as plaintext.
 */
export const emitInjectCookie: RuleEmitter<InjectCookieRule> = (rule, ctx) => {
    const r = resolveInterpolations(rule.value, ctx);
    return [{
        kind:  "lua",
        phase: "request",
        hook:  "access",
        code:  `local existing = ngx.var.http_cookie or ""
local injected = ${JSON.stringify(rule.name)} .. "=" .. ${r.luaExpr}
ngx.req.set_header("Cookie", existing == "" and injected or (existing .. "; " .. injected))`,
    }];
};

export const emitCookieToBodyField: RuleEmitter<CookieToBodyFieldRule> = (rule) => [{
    kind:  "lua",
    phase: "request",
    hook:  "access",
    code:  `ngx.req.read_body()
local cjson = require "cjson.safe"
local body  = ngx.req.get_body_data() or "{}"
local data  = cjson.decode(body) or {}
data[${JSON.stringify(rule.body_field)}] = ngx.var.${nginxCookieVar(rule.cookie_name)} or ""
ngx.req.set_body_data(cjson.encode(data))`,
}];

/**
 * Inject (or override) one query parameter on the upstream request.
 * `ngx.req.get_uri_args()` returns the existing client args; we patch
 * the targeted key, then `set_uri_args` writes the merged table back —
 * client-supplied args for OTHER keys survive untouched. Same key:
 * the rule wins (matches `inject_header` semantics).
 */
export const emitInjectQueryParam: RuleEmitter<InjectQueryParamRule> = (rule, ctx) => {
    const r = resolveInterpolations(rule.value, ctx);
    return [{
        kind:  "lua",
        phase: "request",
        hook:  "access",
        code:  `local args = ngx.req.get_uri_args()
args[${JSON.stringify(rule.name)}] = ${r.luaExpr}
ngx.req.set_uri_args(args)`,
    }];
};

export const REQUEST_EMITTERS = {
    require_cookie:       emitRequireCookie,
    require_header:       emitRequireHeader,
    cookie_to_header:     emitCookieToHeader,
    cookie_to_body_field: emitCookieToBodyField,
    inject_header:        emitInjectHeader,
    inject_cookie:        emitInjectCookie,
    inject_query_param:   emitInjectQueryParam,
} satisfies Record<string, RuleEmitter<never>>;

export type _EmittedRequestSnippet = EmittedSnippet; // re-export for tests
