import { describe, test, expect } from "bun:test";

import { parseRulesConfig } from "src/core/proxy/rules/parseRulesConfig";
import { compileRulesConfig } from "src/core/proxy/codegen/compileRulesConfig";
import { newCompileContext } from "src/interfaces/proxy/EmittedSnippet";
import { emitRule } from "src/core/proxy/codegen/emitterRegistry";

const SUPABASE = {
    defaults: {
        on_request: [
            { type: "inject_header", name: "apikey", value: "${env:SUPABASE_ANON_KEY}" },
        ],
    },
    paths: {
        "/auth/v1/token": {
            methods: ["POST"],
            on_response: [
                { type: "extract_json", field: "access_token",
                  action: { type: "set_cookie", name: "sb-access-token",
                            attributes: { max_age: 3600, http_only: true, secure: true, same_site: "Lax", path: "/" } } },
                { type: "extract_json", field: "refresh_token",
                  action: { type: "set_cookie", name: "sb-refresh-token",
                            attributes: { max_age: 2592000, http_only: true, secure: true, same_site: "Lax", path: "/" } } },
                { type: "strip_body_fields", fields: ["access_token", "refresh_token"] },
            ],
        },
        "/rest/v1/*": {
            on_request: [
                { type: "require_cookie", name: "sb-access-token",
                  on_missing: { type: "redirect", url: "/.cms/data/supabase/login?redirectTo={original_url}" } },
                { type: "cookie_to_header", cookie_name: "sb-access-token",
                  header_name: "Authorization", prefix: "Bearer " },
            ],
        },
    },
};

const OPTS = { bucketId: "tenant-a", providerId: "supabase",
               server: "https://hnsutcetdsetjrubdhjl.supabase.co" };

describe("compileRulesConfig — Supabase fixture", () => {
    const cfg = parseRulesConfig(SUPABASE);
    const out = compileRulesConfig(cfg, OPTS);

    test("emits a location per path pattern", () => {
        const matches = out.nginx.match(/^location /gm) ?? [];
        expect(matches.length).toBe(2);
    });

    test("exact path uses `location =`, glob uses `location ~`", () => {
        expect(out.nginx).toContain("location = /.cms/data/supabase/auth/v1/token");
        expect(out.nginx).toContain("location ~ ^/\\.cms/data/supabase/rest/v1/(?<seg0>[^/]+)$");
    });

    test("methods restriction uses limit_except", () => {
        expect(out.nginx).toContain("limit_except POST { deny all; }");
    });

    test("inject_header reads the secret via the cms_secrets Lua table (no plaintext on disk)", () => {
        // The secret is staged via a per-location set_by_lua_block that
        // reads the global `cms_secrets` table populated once at config
        // load by an init_by_lua_block in the main nginx.conf.
        expect(out.nginx).toMatch(/set_by_lua_block \$cms_secret_[0-9a-f]{16} \{ return cms_secrets\["SECRET_[0-9A-F]{16}"\] or "" \}/);
        expect(out.nginx).toMatch(/proxy_set_header apikey "\$cms_secret_[0-9a-f]{16}"/);
        expect(out.secrets.get("SUPABASE_ANON_KEY")).toMatch(/^SECRET_[0-9A-F]{16}$/);
    });

    test("the staging set_by_lua_block is deduped per location", () => {
        // SUPABASE_ANON_KEY is referenced via the `defaults`, applied to both
        // locations — each location should carry exactly ONE staging line.
        const [tokenLoc, restLoc] = out.nginx.split("\n\n");
        const re = /set_by_lua_block \$cms_secret_/g;
        expect((tokenLoc!.match(re) ?? []).length).toBe(1);
        expect((restLoc !.match(re) ?? []).length).toBe(1);
    });

    test("body filter is a single block aggregating extract_json + strip_body_fields", () => {
        const bodyFilters = out.nginx.match(/body_filter_by_lua_block/g) ?? [];
        expect(bodyFilters.length).toBe(1);
        expect(out.nginx).toContain('data["access_token"]');
        expect(out.nginx).toContain('data["refresh_token"] = nil');
    });

    test("require_cookie redirect splices request_uri via ngx.escape_uri", () => {
        expect(out.nginx).toContain("local v = ngx.var.cookie_sb_access_token");
        expect(out.nginx).toContain("ngx.escape_uri(ngx.var.request_uri)");
    });

    test("cookie_to_header prefixes with Bearer correctly", () => {
        expect(out.nginx).toContain('proxy_set_header Authorization "Bearer $cookie_sb_access_token"');
    });

    test("most-specific path is emitted first", () => {
        const tokenIdx = out.nginx.indexOf("/auth/v1/token");
        const restIdx  = out.nginx.indexOf("/rest/v1/");
        expect(tokenIdx).toBeGreaterThanOrEqual(0);
        expect(restIdx).toBeGreaterThanOrEqual(0);
        expect(tokenIdx).toBeLessThan(restIdx);
    });

    test("interpolation is shared across references — same env var = same SECRET name", () => {
        const cfg2 = parseRulesConfig({
            paths: { "/x": { on_request: [
                { type: "inject_header", name: "A", value: "${env:KEY}" },
                { type: "inject_header", name: "B", value: "${env:KEY}-suffix" },
            ] } },
        });
        const out2 = compileRulesConfig(cfg2, OPTS);
        // Both directives reference the SAME nginx variable (single secret in ctx).
        const refs = [...out2.nginx.matchAll(/\$cms_secret_[0-9a-f]{16}/g)].map(x => x[0]);
        expect(new Set(refs).size).toBe(1);
        expect(out2.secrets.size).toBe(1);
    });
});

describe("emitRule — per-primitive smoke", () => {
    const ctx = () => newCompileContext("b", "p");

    test("inject_header with cookie interpolation emits $cookie_*", () => {
        const out = emitRule({ type: "inject_header", name: "X-Tok", value: "${cookie:tok}" }, ctx());
        // No env vars → no staging snippets, just the proxy_set_header.
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ kind: "nginx",
            directive: 'proxy_set_header X-Tok "$cookie_tok";' });
    });

    test("require_header on_missing status emits ngx.exit", () => {
        const out = emitRule({ type: "require_header", name: "Authorization",
                               on_missing: { type: "status", code: 401 } }, ctx());
        const code = (out[0] as { code: string }).code;
        expect(code).toContain("ngx.var.http_authorization");
        expect(code).toContain("ngx.exit(401)");
    });

    test("extract_header_to_cookie emits add_header Set-Cookie always", () => {
        const out = emitRule({ type: "extract_header_to_cookie",
                               header_name: "X-Auth-Token", cookie_name: "session" }, ctx());
        expect((out[0] as { directive: string }).directive)
            .toMatch(/^add_header Set-Cookie "session=\$upstream_http_x_auth_token; .* always;$/);
    });

    test("rewrite_status without if_body_field uses header_filter hook", () => {
        const out = emitRule({ type: "rewrite_status", from: 200, to: 401 }, ctx());
        expect(out[0]).toMatchObject({ kind: "lua", hook: "header_filter" });
    });

    test("rewrite_status with if_body_field becomes a body_mutation", () => {
        const out = emitRule({ type: "rewrite_status", from: 200, to: 401, if_body_field: "error" }, ctx());
        expect(out[0]).toMatchObject({ kind: "body_mutation" });
    });
});
