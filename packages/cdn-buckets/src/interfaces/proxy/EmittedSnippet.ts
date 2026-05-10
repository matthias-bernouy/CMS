import type { ProxyRule, RulePhase } from "./ProxyRule";

/**
 * Lua hook a snippet attaches to inside an OpenResty `location { … }` block.
 * The order is fixed by nginx and matches the request lifecycle:
 *   access (request) → proxy_pass → header_filter (response) → body_filter (response).
 * Native (non-Lua) directives have no hook — they live in the location body.
 */
export type LuaHook = "access" | "header_filter" | "body_filter";

export type NginxDirective = {
    kind:      "nginx";
    phase:     RulePhase;
    /** Raw nginx directive(s), one per line, no trailing newline. */
    directive: string;
};

export type LuaBlock = {
    kind:  "lua";
    phase: RulePhase;
    hook:  LuaHook;
    /** Raw Lua source, no surrounding `*_by_lua_block { … }` wrapper —
     *  the composer adds it. Multiple blocks targeting the same hook
     *  are concatenated in registration order. */
    code: string;
};

/**
 * Body-modification fragment that operates on a `data` table (already
 * decoded JSON) inside a single shared `body_filter_by_lua_block`. The
 * composer is responsible for buffering chunks, decoding once, running
 * every mutation in order, and re-encoding — there is exactly one body
 * filter per nginx location, hence the merge.
 */
export type BodyMutation = {
    kind:  "body_mutation";
    phase: "response";
    code:  string;
};

export type EmittedSnippet = NginxDirective | LuaBlock | BodyMutation;

/**
 * Per-rule emitter. Receives the typed rule and a `CompileContext`
 * carrying the (bucketId, providerId) needed to resolve interpolated
 * env references to deterministic `${SECRET_<hash>}` placeholders.
 */
export type RuleEmitter<R extends ProxyRule> =
    (rule: R, ctx: CompileContext) => EmittedSnippet[];

/**
 * Mutable state shared across one full compilation pass. The
 * `secretIndex` is incremented every time a new `${env:…}` reference is
 * encountered so the resulting placeholder name is unique within a
 * `(bucketId, providerId)` scope.
 */
export type CompileContext = {
    bucketId:    string;
    providerId:  string;
    /** Caller-managed counter. The interpolation resolver bumps it. */
    secretIndex: { next: number };
    /** Resolved env-var → placeholder mapping, populated during emit.
     *  The Phase 4 secret-manifest builder reads this back to know
     *  which env vars to ship through `/edge-api/secrets`. */
    secrets:     Map<string, string>;
};

export function newCompileContext(bucketId: string, providerId: string): CompileContext {
    return { bucketId, providerId, secretIndex: { next: 0 }, secrets: new Map() };
}
