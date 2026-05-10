import { describe, test, expect } from "bun:test";

import { renderProxyLocations } from "src/core/proxy/renderProxyLocations";
import { placeholderName } from "src/core/proxy/placeholderName";
import type { BucketProxy } from "src/interfaces/entities/BucketProxy";

const proxy = (overrides: Partial<BucketProxy>): BucketProxy => ({
    bucketId:   "b1",
    providerId: "stripe",
    server:     "https://api.stripe.com/v1",
    auth:       { type: "none" },
    createdAt:  new Date(),
    updatedAt:  new Date(),
    ...overrides,
});

describe("renderProxyLocations", () => {
    test("empty list produces empty string", () => {
        expect(renderProxyLocations([])).toBe("");
    });

    test("type=none emits a location without proxy_set_header Authorization", () => {
        const out = renderProxyLocations([proxy({ auth: { type: "none" } })]);
        expect(out).toContain("location /.cms/data/stripe/ {");
        expect(out).toContain("proxy_pass https://api.stripe.com/v1/;");
        expect(out).not.toContain("Authorization");
    });

    test("type=bearer references a placeholder, never the plaintext", () => {
        const out = renderProxyLocations([proxy({ auth: { type: "bearer", token: "VERY_SECRET" } })]);
        expect(out).not.toContain("VERY_SECRET");
        const ref = "${" + placeholderName("b1", "stripe", 0) + "}";
        expect(out).toContain(`proxy_set_header Authorization "Bearer ${ref}";`);
    });

    test("type=headers emits one proxy_set_header per entry, all placeholdered", () => {
        const out = renderProxyLocations([proxy({
            auth: { type: "headers", headers: [
                { name: "X-API-Key", value: "VAL_A" },
                { name: "X-Other",   value: "VAL_B" },
            ]},
        })]);
        expect(out).not.toContain("VAL_A");
        expect(out).not.toContain("VAL_B");
        const ref0 = "${" + placeholderName("b1", "stripe", 0) + "}";
        const ref1 = "${" + placeholderName("b1", "stripe", 1) + "}";
        expect(out).toContain(`proxy_set_header X-API-Key "${ref0}";`);
        expect(out).toContain(`proxy_set_header X-Other "${ref1}";`);
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

    test("multiple proxies are joined with a blank line", () => {
        const out = renderProxyLocations([
            proxy({ providerId: "stripe" }),
            proxy({ providerId: "weather", server: "https://api.openweathermap.org" }),
        ]);
        expect(out).toContain("location /.cms/data/stripe/ {");
        expect(out).toContain("location /.cms/data/weather/ {");
    });

    test("emits cookie scoping directives that re-scope Set-Cookie to the proxy path", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        // Catches every upstream Path including `/`, `/api`, etc., prefixing
        // `/.cms/data/stripe` so cookies stay scoped to this provider's
        // surface — no cross-provider leak on the same alias.
        expect(out).toContain("proxy_cookie_path   ~^(/.*)$ /.cms/data/stripe/$1;");
        // Domain attribute (if any) gets rewritten to the visible alias so
        // the browser actually accepts the cookie.
        expect(out).toContain("proxy_cookie_domain ~.+ $host;");
    });

    test("emits standard X-Forwarded-* headers + http/1.1", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_http_version 1.1;");
        expect(out).toContain("proxy_set_header X-Real-IP          $remote_addr;");
        expect(out).toContain("proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;");
        expect(out).toContain("proxy_set_header X-Forwarded-Proto  $scheme;");
        expect(out).toContain("proxy_set_header X-Forwarded-Host   $host;");
        // Host request header is intentionally NOT overridden — nginx
        // default is the upstream's hostname, which is what most APIs
        // expect for routing / URL generation.
        expect(out).not.toContain("proxy_set_header Host ");
    });

    test("emits X-Forwarded-Prefix without trailing slash so proxy-aware frameworks build correct URLs", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_set_header X-Forwarded-Prefix /.cms/data/stripe;");
        // Trailing-slash variant would build URLs with a double slash on
        // the boundary (e.g. `/.cms/data/stripe//foo`).
        expect(out).not.toContain("X-Forwarded-Prefix /.cms/data/stripe/;");
    });

    test("emits proxy_redirect to keep relative-path 3xx responses inside the proxy", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_redirect      ~^/(.*)$ /.cms/data/stripe/$1;");
    });

    test("emits WebSocket upgrade headers — Connection wired to the parent map $connection_upgrade", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_set_header Upgrade            $http_upgrade;");
        expect(out).toContain("proxy_set_header Connection         $connection_upgrade;");
    });

    test("emits streaming + body-size directives so SSE / large uploads pass through", () => {
        const out = renderProxyLocations([proxy({ providerId: "stripe" })]);
        expect(out).toContain("proxy_buffering          off;");
        expect(out).toContain("proxy_request_buffering  off;");
        expect(out).toContain("client_max_body_size     50m;");
    });
});
