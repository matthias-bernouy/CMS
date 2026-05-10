import { describe, test, expect } from "bun:test";

import { parseRulesConfig } from "src/core/proxy/rules/parseRulesConfig";
import { validateRules, ProxyRulesValidationError } from "src/core/proxy/rules/validateRules";

function v(raw: object): void {
    validateRules(parseRulesConfig(raw));
}

describe("validateRules — happy path", () => {
    test("accepts a config with valid headers, cookies, paths, interpolations", () => {
        expect(() => v({
            defaults: { on_request: [
                { type: "inject_header", name: "apikey", value: "${env:SUPABASE_ANON_KEY}" },
            ] },
            paths: {
                "/rest/v1/*": { on_request: [
                    { type: "cookie_to_header", cookie_name: "sb-access-token",
                      header_name: "Authorization", prefix: "Bearer " },
                ] },
                "/auth/v1/**": { on_response: [
                    { type: "extract_json", field: "access_token",
                      action: { type: "set_cookie", name: "sb-access-token" } },
                ] },
            },
        })).not.toThrow();
    });
});

describe("validateRules — forbidden headers", () => {
    test.each([
        "Set-Cookie", "Cookie", "Host", "Content-Length",
        "Transfer-Encoding", "Connection", "Upgrade",
    ])("rejects inject_header on forbidden header %s", (name) => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "inject_header", name, value: "anything" },
        ] } } })).toThrow(ProxyRulesValidationError);
    });

    test("forbidden check is case-insensitive", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "inject_header", name: "set-cookie", value: "x" },
        ] } } })).toThrow(/forbidden/);
    });

    test("rejects cookie_to_header that targets a forbidden header", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "cookie_to_header", cookie_name: "c", header_name: "Host" },
        ] } } })).toThrow(/forbidden/);
    });
});

describe("validateRules — interpolation", () => {
    test("accepts ${env:UPPER_SNAKE} and ${cookie:name}", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "inject_header", name: "X-Tok",
              value: "${env:SUPABASE_ANON_KEY}-${cookie:sb-access-token}" },
        ] } } })).not.toThrow();
    });

    test("rejects lowercase env var", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "inject_header", name: "X", value: "${env:lowercase}" },
        ] } } })).toThrow(/invalid env var name/);
    });

    test("rejects an unknown ${kind:...} prefix", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "inject_header", name: "X", value: "${header:foo}" },
        ] } } })).toThrow(/only \$\{env:.*cookie:/);
    });
});

describe("validateRules — path patterns", () => {
    test.each([
        ["/api/private/*"],
        ["/api/private/**"],
        ["/auth/v1/token"],
        ["/x.y_z-1/*"],
    ])("accepts %s", (p) => {
        expect(() => v({ paths: { [p]: { on_request: [] } } })).not.toThrow();
    });

    test.each([
        ["api/private"],          // no leading slash
        ["/api//private"],        // double slash
        ["/api/../etc"],          // path traversal
        ["/api/?query"],          // unsupported chars
    ])("rejects %s", (p) => {
        expect(() => v({ paths: { [p]: { on_request: [] } } }))
            .toThrow(ProxyRulesValidationError);
    });
});

describe("validateRules — cookie/header name format", () => {
    test("rejects cookie name containing semicolon", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "require_cookie", name: "ba;d",
              on_missing: { type: "status", code: 401 } },
        ] } } })).toThrow(/invalid cookie name/);
    });

    test("rejects header name containing space", () => {
        expect(() => v({ paths: { "/x": { on_request: [
            { type: "inject_header", name: "X Forwarded", value: "y" },
        ] } } })).toThrow(/invalid header name/);
    });
});
