import type { BodyMutation, EmittedSnippet, LuaBlock, NginxDirective } from "../../../interfaces/proxy/EmittedSnippet";

const INDENT = "    ";

function indent(lines: string, prefix: string): string {
    return lines.split("\n").map(l => l ? prefix + l : l).join("\n");
}

/**
 * Sort snippets into the buckets the nginx execution order needs.
 * Body-mutations get coalesced into one envelope; nginx native
 * directives keep their relative order; lua hooks concatenate.
 */
function partition(snippets: EmittedSnippet[]): {
    nginxReq:    NginxDirective[];
    nginxRes:    NginxDirective[];
    luaAccess:   LuaBlock[];
    luaHeaderF:  LuaBlock[];
    bodyMut:     BodyMutation[];
} {
    const out = { nginxReq: [] as NginxDirective[], nginxRes: [] as NginxDirective[],
                  luaAccess: [] as LuaBlock[], luaHeaderF: [] as LuaBlock[], bodyMut: [] as BodyMutation[] };
    for (const s of snippets) {
        if (s.kind === "nginx" && s.phase === "request")  out.nginxReq.push(s);
        else if (s.kind === "nginx")                      out.nginxRes.push(s);
        else if (s.kind === "lua" && s.hook === "access") out.luaAccess.push(s);
        else if (s.kind === "lua" && s.hook === "header_filter") out.luaHeaderF.push(s);
        else if (s.kind === "body_mutation")              out.bodyMut.push(s);
        // body_filter LuaBlock not emitted by current rules — see CLAUDE.md
    }
    return out;
}

function luaHookBlock(name: string, blocks: LuaBlock[]): string {
    if (blocks.length === 0) return "";
    const code = blocks.map(b => b.code).join("\n");
    return `${name} {\n${indent(code, INDENT)}\n}`;
}

/**
 * Body-filter envelope: buffer chunks until eof, decode JSON once, run
 * every mutation against `data`, re-encode. Pass through unchanged if
 * decoding fails (non-JSON / malformed body).
 */
function bodyFilterBlock(mutations: BodyMutation[]): string {
    if (mutations.length === 0) return "";
    const inner = mutations.map(m => m.code).join("\n");
    const body  = `ngx.ctx.body_buf = (ngx.ctx.body_buf or "") .. (ngx.arg[1] or "")
if not ngx.arg[2] then
    ngx.arg[1] = nil
    return
end
local cjson = require "cjson.safe"
local data = cjson.decode(ngx.ctx.body_buf)
if data then
${indent(inner, INDENT)}
    ngx.arg[1] = cjson.encode(data)
else
    ngx.arg[1] = ngx.ctx.body_buf
end`;
    return `body_filter_by_lua_block {\n${indent(body, INDENT)}\n}`;
}

export type ComposeLocationOptions = {
    /** Full nginx location prefix, e.g. `location ~ ^/.cms/data/supabase/rest/v1/`. */
    locationDirective: string;
    /** Already-sanitized `proxy_pass` target including trailing slash if needed. */
    proxyPass:         string;
    snippets:          EmittedSnippet[];
};

/**
 * Assemble one nginx `location { … }` block in the order required by
 * the openresty execution model. Empty hooks are omitted to keep the
 * generated config readable.
 */
/** Drop textually-identical directives in registration order (e.g. two
 *  emitters both staging the same `set_by_lua_block` for a shared
 *  secret). Kept stable so the first occurrence wins. */
function dedup(directives: NginxDirective[]): NginxDirective[] {
    const seen = new Set<string>();
    return directives.filter(d => seen.has(d.directive) ? false : (seen.add(d.directive), true));
}

/**
 * `body_filter_by_lua_block` cannot mutate `ngx.header.*` once the
 * response headers have been flushed to the client (per OpenResty docs:
 * "undefined behavior" — internally `r->header_sent` blocks the write).
 * With the baseline's `proxy_buffering off;`, headers ARE flushed as soon
 * as upstream sends them, so an `extract_json + set_cookie` rule's
 * Set-Cookie write would silently no-op.
 *
 * When any rule emits a body mutation, we therefore:
 *   - strip the baseline's `proxy_buffering off;`
 *   - emit `proxy_buffering on;` + generous buffer sizes so the typical
 *     auth response (~few KB JSON) fits in memory and the headers stay
 *     queued until the body filter is done.
 *
 * Caveat: this is best-effort. If the upstream response is bigger than
 * the buffer pool, nginx may start flushing chunks before body_filter
 * finishes, and the Set-Cookie write may still no-op. The robust fix
 * is to switch from `proxy_pass` to `content_by_lua_block +
 * ngx.location.capture` for these locations, which is a larger refactor.
 */
const PROXY_BUFFERING_OFF_RE = /^\s*proxy_buffering\s+off\s*;?\s*$/;

function bufferingOverride(needs: boolean, nginxReq: NginxDirective[]): { cleaned: NginxDirective[]; prepended: string[] } {
    if (!needs) return { cleaned: nginxReq, prepended: [] };
    const cleaned = nginxReq.filter(d => !PROXY_BUFFERING_OFF_RE.test(d.directive));
    return { cleaned, prepended: [
        "proxy_buffering on;",
        "proxy_buffer_size 16k;",
        "proxy_buffers     8 16k;",
    ] };
}

export function composeLocation(opts: ComposeLocationOptions): string {
    const { nginxReq, nginxRes, luaAccess, luaHeaderF, bodyMut } = partition(opts.snippets);
    const { cleaned, prepended } = bufferingOverride(bodyMut.length > 0, nginxReq);

    const lines: string[] = [`${opts.locationDirective} {`];

    const access = luaHookBlock("access_by_lua_block", luaAccess);
    if (access)                       lines.push(indent(access, INDENT));
    for (const directive of prepended) lines.push(INDENT + directive);
    for (const d of dedup(cleaned))   lines.push(INDENT + d.directive);
    lines.push(INDENT + `proxy_pass ${opts.proxyPass};`);

    const headerF = luaHookBlock("header_filter_by_lua_block", luaHeaderF);
    if (headerF)                      lines.push(indent(headerF, INDENT));
    const bodyF   = bodyFilterBlock(bodyMut);
    if (bodyF)                        lines.push(indent(bodyF, INDENT));
    for (const d of dedup(nginxRes))  lines.push(INDENT + d.directive);

    lines.push("}");
    return lines.join("\n");
}
