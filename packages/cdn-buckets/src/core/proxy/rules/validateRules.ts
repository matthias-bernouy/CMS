import type { ProxyRule } from "../../../interfaces/proxy/ProxyRule";
import type { RulesConfig } from "../../../interfaces/proxy/RulesConfig";

export class ProxyRulesValidationError extends Error {
    constructor(public readonly path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = "ProxyRulesValidationError";
    }
}

/** Hop-by-hop and proxy-controlled headers that rules MUST NOT inject. */
const FORBIDDEN_HEADERS = new Set([
    "set-cookie", "cookie", "host", "content-length",
    "transfer-encoding", "connection", "upgrade", "te", "trailer",
]);

const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const COOKIE_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const PATH_PATTERN_RE = /^\/[A-Za-z0-9._~\-/*]*$/;
const ENV_VAR_RE     = /^[A-Z][A-Z0-9_]*$/;
const INTERPOLATION_RE = /\$\{(env|cookie):([^}]+)\}/g;

function assertHeaderName(name: string, path: string): void {
    if (!HEADER_NAME_RE.test(name)) {
        throw new ProxyRulesValidationError(path, `invalid header name: "${name}"`);
    }
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
        throw new ProxyRulesValidationError(path, `header "${name}" is forbidden (hop-by-hop or proxy-controlled)`);
    }
}

function assertCookieName(name: string, path: string): void {
    if (!COOKIE_NAME_RE.test(name)) {
        throw new ProxyRulesValidationError(path, `invalid cookie name: "${name}"`);
    }
}

function assertInterpolation(value: string, path: string): void {
    let m: RegExpExecArray | null;
    INTERPOLATION_RE.lastIndex = 0;
    while ((m = INTERPOLATION_RE.exec(value)) !== null) {
        const [, kind, name] = m as unknown as [string, "env" | "cookie", string];
        if (kind === "env" && !ENV_VAR_RE.test(name)) {
            throw new ProxyRulesValidationError(path, `invalid env var name in interpolation: "${name}"`);
        }
        if (kind === "cookie" && !COOKIE_NAME_RE.test(name)) {
            throw new ProxyRulesValidationError(path, `invalid cookie name in interpolation: "${name}"`);
        }
    }
    if (value.includes("${") && !INTERPOLATION_RE.test(value) && /\$\{[^}]*\}/.test(value)) {
        throw new ProxyRulesValidationError(path, "only ${env:NAME} and ${cookie:NAME} interpolations are allowed");
    }
}

function assertPathPattern(pattern: string, path: string): void {
    if (!PATH_PATTERN_RE.test(pattern)) {
        throw new ProxyRulesValidationError(path, `invalid path pattern: "${pattern}" (allowed: /, alnum, .-_~, *, **)`);
    }
    if (pattern.includes("//") || pattern.includes("..")) {
        throw new ProxyRulesValidationError(path, `path pattern must not contain "//" or "..": "${pattern}"`);
    }
}

function validateRule(rule: ProxyRule, path: string): void {
    switch (rule.type) {
        case "require_cookie":
        case "cookie_to_body_field":
        case "inject_cookie":
            assertCookieName(rule.type === "require_cookie" ? rule.name
                : rule.type === "inject_cookie" ? rule.name
                : rule.cookie_name, `${path}.${rule.type === "cookie_to_body_field" ? "cookie_name" : "name"}`);
            break;
        case "require_header":
            assertHeaderName(rule.name, `${path}.name`);
            break;
        case "cookie_to_header":
            assertCookieName(rule.cookie_name, `${path}.cookie_name`);
            assertHeaderName(rule.header_name, `${path}.header_name`);
            break;
        case "inject_header":
            assertHeaderName(rule.name,  `${path}.name`);
            assertInterpolation(rule.value, `${path}.value`);
            break;
        case "extract_json":
            if (rule.action.type === "set_cookie") assertCookieName(rule.action.name, `${path}.action.name`);
            else                                   assertHeaderName(rule.action.name, `${path}.action.name`);
            break;
        case "extract_header_to_cookie":
            assertHeaderName(rule.header_name, `${path}.header_name`);
            assertCookieName(rule.cookie_name, `${path}.cookie_name`);
            break;
        case "strip_body_fields":
        case "rewrite_status":
            break;
    }
}

function validateRuleArray(rules: ProxyRule[] | undefined, path: string): void {
    if (!rules) return;
    rules.forEach((rule, i) => validateRule(rule, `${path}[${i}]`));
}

/**
 * Cross-rule + per-rule semantic validation. Run AFTER `parseRulesConfig`,
 * BEFORE codegen. Catches things the type parser can't: forbidden header
 * names, malformed glob patterns, illegal `${...}` interpolations.
 */
export function validateRules(config: RulesConfig): void {
    if (config.defaults) {
        validateRuleArray(config.defaults.on_request,  "$.defaults.on_request");
        validateRuleArray(config.defaults.on_response, "$.defaults.on_response");
    }
    for (const [pattern, rules] of Object.entries(config.paths)) {
        const base = `$.paths["${pattern}"]`;
        assertPathPattern(pattern, base);
        validateRuleArray(rules.on_request,  `${base}.on_request`);
        validateRuleArray(rules.on_response, `${base}.on_response`);
    }
}
