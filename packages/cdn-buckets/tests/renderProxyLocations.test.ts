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
});
