import { describe, test, expect } from "bun:test";

import { renderProxyLocations } from "src/core/proxy/renderProxyLocations";
import type { BucketProxy } from "src/interfaces/entities/BucketProxy";
import type { RulesConfig } from "src/interfaces/proxy/RulesConfig";

const EMPTY_RULES: RulesConfig = { paths: {} };

const proxy = (overrides: Partial<BucketProxy>): BucketProxy => ({
    bucketId:   "b1",
    providerId: "stripe",
    server:     "https://api.stripe.com/v1",
    rules:      EMPTY_RULES,
    secrets:    {},
    createdAt:  new Date(),
    updatedAt:  new Date(),
    ...overrides,
});

describe("renderProxyLocations — fallback location (no rules)", () => {
    test("empty list produces empty string", () => {
        expect(renderProxyLocations([])).toBe("");
    });

    test("emits a fallback location forwarding to upstream root", () => {
        const out = renderProxyLocations([proxy({})]);
        expect(out).toContain("location /.cms/data/stripe/ {");
        expect(out).toContain("proxy_pass https://api.stripe.com/v1/;");
    });

    test("plaintext never appears in the output (no Authorization staging without rules)", () => {
        const out = renderProxyLocations([proxy({})]);
        expect(out).not.toContain("Authorization");
        expect(out).not.toContain("Bearer");
    });

    test("appends trailing slash to proxy_pass when missing", () => {
        const out = renderProxyLocations([proxy({ server: "https://api.example.com" })]);
        expect(out).toContain("proxy_pass https://api.example.com/;");
    });

    test("does not double the trailing slash when already present", () => {
        const out = renderProxyLocations([proxy({ server: "https://api.example.com/" })]);
        expect(out).toContain("proxy_pass https://api.example.com/;");
        expect(out).not.toContain("//;");
    });

    test("multiple proxies emit one block each", () => {
        const out = renderProxyLocations([
            proxy({ providerId: "stripe" }),
            proxy({ providerId: "weather", server: "https://api.openweathermap.org" }),
        ]);
        expect(out).toContain("location /.cms/data/stripe/ {");
        expect(out).toContain("location /.cms/data/weather/ {");
    });
});

describe("renderProxyLocations — baseline directives", () => {
    test("cookie scoping rewrites Set-Cookie Path to the proxy prefix", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_cookie_path   ~^(/.*)$ /.cms/data/stripe/$1;");
        expect(out).toContain("proxy_cookie_domain ~.+ $host;");
    });

    test("X-Forwarded-* + http/1.1 baseline applied", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_http_version 1.1;");
        expect(out).toContain("proxy_set_header X-Real-IP          $remote_addr;");
        expect(out).toContain("proxy_set_header X-Forwarded-Proto  $scheme;");
        expect(out).toContain("proxy_set_header X-Forwarded-Host   $host;");
        expect(out).toContain("proxy_set_header X-Forwarded-Prefix /.cms/data/stripe;");
        expect(out).not.toContain("proxy_set_header Host ");
    });

    test("WebSocket upgrade headers reference the parent map $connection_upgrade", () => {
        const out = renderProxyLocations([proxy({})]);
        expect(out).toContain("proxy_set_header Upgrade            $http_upgrade;");
        expect(out).toContain("proxy_set_header Connection         $connection_upgrade;");
    });

    test("streaming + body-size directives are present", () => {
        const out = renderProxyLocations([proxy({})]);
        expect(out).toContain("proxy_buffering          off;");
        expect(out).toContain("proxy_request_buffering  off;");
        expect(out).toContain("client_max_body_size     50m;");
    });

    test("3xx Location rewrites stay inside the proxy surface", () => {
        const out = renderProxyLocations([proxy({})]);
        expect(out).toContain("proxy_redirect      ~^/(.*)$ /.cms/data/stripe/$1;");
    });
});

describe("renderProxyLocations — with rules", () => {
    const STRIPE_RULES: RulesConfig = {
        defaults: { on_request: [
            { type: "inject_header", name: "Authorization", value: "Bearer ${env:STRIPE_KEY}" },
        ] },
        paths: {
            "/v1/charges": { on_request: [] },
        },
    };

    test("rule location appears BEFORE the fallback (more specific first)", () => {
        const out = renderProxyLocations([proxy({ rules: STRIPE_RULES, secrets: { STRIPE_KEY: "sk" } })]);
        const ruleIdx     = out.indexOf("location = /.cms/data/stripe/v1/charges");
        const fallbackIdx = out.indexOf("location /.cms/data/stripe/ {");
        expect(ruleIdx).toBeGreaterThanOrEqual(0);
        expect(fallbackIdx).toBeGreaterThan(ruleIdx);
    });

    test("rule location carries the baseline (proxy_set_header isn't inherited from a parent)", () => {
        const out = renderProxyLocations([proxy({ rules: STRIPE_RULES, secrets: { STRIPE_KEY: "sk" } })]);
        const ruleBlock = out.split("location /.cms/data/stripe/ {")[0]!;
        expect(ruleBlock).toContain("proxy_set_header X-Forwarded-Host   $host;");
        expect(ruleBlock).toContain("proxy_cookie_path   ~^(/.*)$ /.cms/data/stripe/$1;");
    });

    test("plaintext never appears in the rendered fragment — secret read via cms_secrets table", () => {
        const out = renderProxyLocations([proxy({ rules: STRIPE_RULES, secrets: { STRIPE_KEY: "sk_LIVE" } })]);
        expect(out).not.toContain("sk_LIVE");
        expect(out).toMatch(/set_by_lua_block \$cms_secret_[0-9a-f]+ \{ return cms_secrets\["SECRET_[0-9A-F]+"\] or "" \}/);
    });
});
