import type { ProxyRule } from "../../../interfaces/proxy/ProxyRule";
import type { CompileContext, EmittedSnippet } from "../../../interfaces/proxy/EmittedSnippet";
import type { PathRules, RulesConfig } from "../../../interfaces/proxy/RulesConfig";
import { newCompileContext } from "../../../interfaces/proxy/EmittedSnippet";
import { emitRule } from "./emitterRegistry";
import { composeLocation } from "./composeLocation";

const REGEX_META_RE = /[.+?^${}()|[\]\\]/g;
function escapeRegex(s: string): string { return s.replace(REGEX_META_RE, "\\$&"); }

/**
 * Translate one user pattern to a regex (for the nginx `location ~` body)
 * + the proxy_pass path with named-capture references. Single `*` matches
 * one segment, `**` matches arbitrary depth.
 */
function translatePattern(pattern: string, capCount: { n: number }): { regex: string; proxyPath: string } {
    let regex = "", proxy = "", i = 0;
    while (i < pattern.length) {
        if (pattern.slice(i, i + 2) === "**") {
            const name = `deep${capCount.n++}`;
            regex += `(?<${name}>.+)`; proxy += `$${name}`; i += 2;
        } else if (pattern[i] === "*") {
            const name = `seg${capCount.n++}`;
            regex += `(?<${name}>[^/]+)`; proxy += `$${name}`; i += 1;
        } else {
            const c = pattern[i]!;
            regex += escapeRegex(c); proxy += c; i += 1;
        }
    }
    return { regex, proxyPath: proxy };
}

/** Higher = more specific. Drives the order in which `location ~` regex
 *  blocks are emitted (nginx picks the first matching regex). */
function specificity(pattern: string): number {
    const wildcards = (pattern.match(/\*/g) ?? []).length;
    return pattern.length - 10 * wildcards;
}

function buildLocationAndProxyPass(pattern: string, prefix: string, server: string): { directive: string; proxyPass: string } {
    if (!pattern.includes("*")) {
        return { directive: `location = ${prefix}${pattern}`, proxyPass: `${server}${pattern}` };
    }
    const { regex, proxyPath } = translatePattern(pattern, { n: 0 });
    return { directive: `location ~ ^${escapeRegex(prefix)}${regex}$`, proxyPass: `${server}${proxyPath}` };
}

function emitMethods(methods: string[] | undefined, indent: string): string | null {
    if (!methods || methods.length === 0) return null;
    return `${indent}limit_except ${methods.join(" ")} { deny all; }`;
}

function emitRulesArray(rules: ProxyRule[] | undefined, ctx: CompileContext): EmittedSnippet[] {
    if (!rules) return [];
    return rules.flatMap(r => emitRule(r, ctx));
}

function compileOnePath(pattern: string, rules: PathRules, prefix: string, server: string,
                       defaults: RulesConfig["defaults"], baseline: EmittedSnippet[],
                       ctx: CompileContext): string {
    const { directive, proxyPass } = buildLocationAndProxyPass(pattern, prefix, server);
    const snippets: EmittedSnippet[] = [
        ...baseline,
        ...emitRulesArray(defaults?.on_request,  ctx),
        ...emitRulesArray(rules.on_request,      ctx),
        ...emitRulesArray(rules.on_response,     ctx),
        ...emitRulesArray(defaults?.on_response, ctx),
    ];
    const block   = composeLocation({ locationDirective: directive, proxyPass, snippets });
    const methods = emitMethods(rules.methods, "    ");
    // Inject `limit_except` as the first inner line, right after the opening brace.
    return methods ? block.replace(/^(.+?\{\n)/, `$1${methods}\n`) : block;
}

export type CompileRulesOptions = {
    bucketId:   string;
    providerId: string;
    /** Upstream origin, no trailing slash (e.g. `https://hnsut…supabase.co`). */
    server:     string;
    /** Nginx directives prepended to every generated location block.
     *  `proxy_set_header` etc. don't inherit from a parent location in
     *  nginx, so the baseline (X-Forwarded-*, proxy_cookie_domain, …)
     *  must be repeated in each child. Render layer fills this in. */
    baseline?:  string[];
    /** When true, append a plain-prefix catch-all `location <prefix>/`
     *  forwarding to the upstream root, with `defaults.on_request /
     *  on_response` applied. Same shared CompileContext, so secrets
     *  referenced by defaults reuse the placeholder names allocated for
     *  the per-path locations. */
    emitFallback?: boolean;
};

export type CompiledRules = {
    /** The nginx fragment ready to be `include`d under the parent server block. */
    nginx:   string;
    /** envName → SECRET_<hash> mapping populated by interpolation, used by
     *  the secret-manifest builder to know which env vars to ship. */
    secrets: Map<string, string>;
};

function compileFallback(prefix: string, server: string, defaults: RulesConfig["defaults"],
                        baseline: EmittedSnippet[], ctx: CompileContext): string {
    const target = server.endsWith("/") ? server : server + "/";
    const snippets: EmittedSnippet[] = [
        ...baseline,
        ...emitRulesArray(defaults?.on_request,  ctx),
        ...emitRulesArray(defaults?.on_response, ctx),
    ];
    return composeLocation({
        locationDirective: `location ${prefix}/`,
        proxyPass:         target,
        snippets,
    });
}

export function compileRulesConfig(config: RulesConfig, opts: CompileRulesOptions): CompiledRules {
    const ctx      = newCompileContext(opts.bucketId, opts.providerId);
    const prefix   = `/.cms/data/${opts.providerId}`;
    const baseline: EmittedSnippet[] = (opts.baseline ?? []).map(d => ({
        kind: "nginx", phase: "request", directive: d,
    }));
    const sorted = Object.entries(config.paths).sort(([a], [b]) => specificity(b) - specificity(a));
    const blocks = sorted.map(([pattern, rules]) =>
        compileOnePath(pattern, rules, prefix, opts.server, config.defaults, baseline, ctx),
    );
    if (opts.emitFallback) {
        blocks.push(compileFallback(prefix, opts.server, config.defaults, baseline, ctx));
    }
    return { nginx: blocks.join("\n\n"), secrets: ctx.secrets };
}
