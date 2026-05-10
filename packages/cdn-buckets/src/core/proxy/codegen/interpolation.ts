import type { CompileContext } from "../../../interfaces/proxy/EmittedSnippet";
import { placeholderName } from "../placeholderName";

const INTERP_RE = /\$\{(env|cookie):([^}]+)\}/g;

export type ResolvedSecretVar = {
    /** Nginx variable name without the `$` prefix. */
    varName:     string;
    /** SECRET_<HEX> placeholder. The Phase 3 manifest builder uses this
     *  as the key in the JSON file shipped to edges; an
     *  `init_by_lua_block` reads the file at config-load time and
     *  populates a `cms_secrets` Lua table. Plaintext never reaches the
     *  rendered nginx fragment. */
    placeholder: string;
};

export type Resolved = {
    /** Form for embedding in nginx directives (e.g. `proxy_set_header`).
     *  Env refs become `$cms_secret_<X>` (caller must emit `set_by_lua_block`
     *  staging via `setByLuaForSecret(v)` for each `vars` entry). */
    nginxValue: string;
    /** Lua expression form for embedding inside `*_by_lua_block` code.
     *  Env refs become `os.getenv(...)`, cookie refs `ngx.var.cookie_*`. */
    luaExpr:    string;
    vars:       ResolvedSecretVar[];
};

/**
 * Resolve `${env:VAR}` and `${cookie:NAME}` interpolations in a value
 * string. Idempotent per env name within one CompileContext: repeated
 * `${env:KEY}` map to the same placeholder so the manifest carries it
 * once. Cookie names with dashes become underscores (nginx convention
 * for `$cookie_*`).
 */
export function resolveInterpolations(value: string, ctx: CompileContext): Resolved {
    const vars: ResolvedSecretVar[] = [];
    const luaParts:   string[] = [];
    let nginxValue = "";
    let lastIdx    = 0;
    INTERP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INTERP_RE.exec(value)) !== null) {
        const literal = value.slice(lastIdx, m.index);
        if (literal) {
            nginxValue += literal;
            luaParts.push(JSON.stringify(literal));
        }
        const [, kind, name] = m as unknown as [string, string, string];
        if (kind === "env") {
            const placeholder = ctx.secrets.get(name) ?? mintPlaceholder(name, ctx);
            const varName     = "cms_secret_" + placeholder.slice("SECRET_".length).toLowerCase();
            vars.push({ varName, placeholder });
            nginxValue += "$" + varName;
            luaParts.push(`(cms_secrets[${JSON.stringify(placeholder)}] or "")`);
        } else {
            const cookieVar = "cookie_" + name.replace(/-/g, "_");
            nginxValue += "$" + cookieVar;
            luaParts.push(`(ngx.var.${cookieVar} or "")`);
        }
        lastIdx = m.index + m[0].length;
    }
    if (lastIdx < value.length) {
        const trailing = value.slice(lastIdx);
        nginxValue += trailing;
        luaParts.push(JSON.stringify(trailing));
    }
    return { nginxValue, vars, luaExpr: luaParts.length === 0 ? '""' : luaParts.join(" .. ") };
}

function mintPlaceholder(envVarName: string, ctx: CompileContext): string {
    const idx  = ctx.secretIndex.next++;
    const name = placeholderName(ctx.bucketId, ctx.providerId, idx);
    ctx.secrets.set(envVarName, name);
    return name;
}

/**
 * Same conversion as the cookie branch of `resolveInterpolations` but
 * exposed for emitters that need the bare nginx variable name (without
 * `$`) — e.g. for `set $foo $cookie_bar;` constructs.
 */
export function nginxCookieVar(cookieName: string): string {
    return "cookie_" + cookieName.replace(/-/g, "_");
}

/**
 * Emit the `set_by_lua_block` directive that reads a secret from the
 * `cms_secrets` Lua table populated by an upstream `init_by_lua_block`
 * (defined in the main nginx.conf, which reads the JSON manifest file
 * shipped via /edge-api/secrets). Plaintext never appears in the
 * generated nginx fragment — only the placeholder name (which is a
 * hash, not the value).
 */
export function setByLuaForSecret(v: ResolvedSecretVar): string {
    return `set_by_lua_block $${v.varName} { return cms_secrets["${v.placeholder}"] or "" }`;
}
