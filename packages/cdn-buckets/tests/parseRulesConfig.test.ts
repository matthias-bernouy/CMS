import { describe, test, expect } from "bun:test";

import { parseRulesConfig } from "src/core/proxy/rules/parseRulesConfig";
import { ProxyRulesParseError } from "src/core/proxy/rules/parseHelpers";

const SUPABASE_FIXTURE = {
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
                  on_missing: { type: "redirect", url: "/.cms/data/supabase/login?redirectTo={original}" } },
                { type: "cookie_to_header", cookie_name: "sb-access-token",
                  header_name: "Authorization", prefix: "Bearer " },
            ],
        },
    },
};

describe("parseRulesConfig — happy path", () => {
    test("parses the Supabase fixture end-to-end", () => {
        const cfg = parseRulesConfig(SUPABASE_FIXTURE);
        expect(cfg.defaults?.on_request).toHaveLength(1);
        expect(cfg.paths["/auth/v1/token"]?.methods).toEqual(["POST"]);
        expect(cfg.paths["/auth/v1/token"]?.on_response).toHaveLength(3);
        expect(cfg.paths["/rest/v1/*"]?.on_request).toHaveLength(2);
    });

    test("extract_json carries optional strip_from_body when present", () => {
        const cfg = parseRulesConfig({
            paths: { "/x": { on_response: [
                { type: "extract_json", field: "tok", strip_from_body: false,
                  action: { type: "set_cookie", name: "c" } },
            ] } },
        });
        const rule = cfg.paths["/x"]?.on_response?.[0];
        expect(rule).toMatchObject({ type: "extract_json", strip_from_body: false });
    });
});

describe("parseRulesConfig — error paths", () => {
    test("rejects non-object root", () => {
        expect(() => parseRulesConfig(42)).toThrow(ProxyRulesParseError);
    });

    test("rejects missing paths", () => {
        expect(() => parseRulesConfig({})).toThrow(/\$\.paths/);
    });

    test("rejects unknown rule type with the offending path in the message", () => {
        try {
            parseRulesConfig({ paths: { "/x": { on_request: [{ type: "frobnicate" }] } } });
        } catch (e) {
            expect(e).toBeInstanceOf(ProxyRulesParseError);
            expect((e as Error).message).toContain('$.paths["/x"].on_request[0].type');
            return;
        }
        throw new Error("expected throw");
    });

    test("rejects a response-phase rule placed under on_request", () => {
        expect(() => parseRulesConfig({
            paths: { "/x": { on_request: [
                { type: "extract_json", field: "f", action: { type: "set_cookie", name: "c" } },
            ] } },
        })).toThrow(/extract_json.*not allowed under on_request/);
    });

    test("rejects missing required field with the precise path", () => {
        expect(() => parseRulesConfig({
            paths: { "/x": { on_request: [{ type: "require_cookie", name: "c" }] } },
        })).toThrow(/\$\.paths\["\/x"\]\.on_request\[0\]\.on_missing/);
    });

    test("rejects unknown HTTP method", () => {
        expect(() => parseRulesConfig({
            paths: { "/x": { methods: ["FROB"], on_request: [] } },
        })).toThrow(/\$\.paths\["\/x"\]\.methods\[0\]/);
    });

    test("rejects empty path pattern key", () => {
        expect(() => parseRulesConfig({ paths: { "": { on_request: [] } } }))
            .toThrow(/\$\.paths/);
    });
});
