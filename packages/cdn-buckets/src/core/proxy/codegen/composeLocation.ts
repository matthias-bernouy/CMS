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

export function composeLocation(opts: ComposeLocationOptions): string {
    const { nginxReq, nginxRes, luaAccess, luaHeaderF, bodyMut } = partition(opts.snippets);

    const lines: string[] = [`${opts.locationDirective} {`];

    const access = luaHookBlock("access_by_lua_block", luaAccess);
    if (access)                       lines.push(indent(access, INDENT));
    for (const d of dedup(nginxReq))  lines.push(INDENT + d.directive);
    lines.push(INDENT + `proxy_pass ${opts.proxyPass};`);

    const headerF = luaHookBlock("header_filter_by_lua_block", luaHeaderF);
    if (headerF)                      lines.push(indent(headerF, INDENT));
    const bodyF   = bodyFilterBlock(bodyMut);
    if (bodyF)                        lines.push(indent(bodyF, INDENT));
    for (const d of dedup(nginxRes))  lines.push(INDENT + d.directive);

    lines.push("}");
    return lines.join("\n");
}
