import type { ProxyRule } from "./ProxyRule";

export type HttpMethod =
    | "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Rules attached to one path pattern. `methods` defaults to "any"; rules
 * are split by phase so the engine doesn't have to dispatch per-rule at
 * runtime.
 */
export type PathRules = {
    methods?:     HttpMethod[];
    on_request?:  ProxyRule[];
    on_response?: ProxyRule[];
};

/** Rules applied before any path-specific rule, on every matching request. */
export type DefaultRules = {
    on_request?:  ProxyRule[];
    on_response?: ProxyRule[];
};

/**
 * Top-level config for one BucketProxy. `paths` is keyed by glob pattern
 * (`*` = single segment, `**` = arbitrary depth — see validateRules.ts).
 * Most-specific path wins on overlap.
 */
export type RulesConfig = {
    defaults?: DefaultRules;
    paths:     Record<string, PathRules>;
};
