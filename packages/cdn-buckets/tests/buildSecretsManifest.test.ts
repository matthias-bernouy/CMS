import { describe, test, expect } from "bun:test";

import { buildSecretsManifest } from "src/core/proxy/buildSecretsManifest";
import { placeholderName } from "src/core/proxy/placeholderName";
import type { BucketProxy } from "src/interfaces/entities/BucketProxy";
import type { RulesConfig } from "src/interfaces/proxy/RulesConfig";

const proxy = (overrides: Partial<BucketProxy>): BucketProxy => ({
    bucketId:   "b1",
    providerId: "stripe",
    server:     "https://api.stripe.com/v1",
    rules:      { paths: {} },
    secrets:    {},
    createdAt:  new Date(),
    updatedAt:  new Date(),
    ...overrides,
});

const oneEnvHeader = (envName: string): RulesConfig => ({
    defaults: { on_request: [
        { type: "inject_header", name: "Authorization", value: `Bearer \${env:${envName}}` },
    ] },
    paths: { "/v1/*": { on_request: [] } },
});

describe("buildSecretsManifest", () => {
    test("rules with no env interpolation produce nothing", () => {
        const m = buildSecretsManifest([proxy({})]);
        expect(Object.keys(m)).toHaveLength(0);
    });

    test("one ${env:X} → one manifest entry keyed by placeholder(bucket, provider, 0)", () => {
        const m = buildSecretsManifest([proxy({
            rules:   oneEnvHeader("STRIPE_KEY"),
            secrets: { STRIPE_KEY: "sk_xxx" },
        })]);
        expect(m).toEqual({ [placeholderName("b1", "stripe", 0)]: "sk_xxx" });
    });

    test("two distinct env vars → two indexed entries on the same proxy", () => {
        const rules: RulesConfig = {
            defaults: { on_request: [
                { type: "inject_header", name: "X-A", value: "${env:A}" },
                { type: "inject_header", name: "X-B", value: "${env:B}" },
            ] },
            paths: { "/v1/*": { on_request: [] } },
        };
        const m = buildSecretsManifest([proxy({ rules, secrets: { A: "v1", B: "v2" } })]);
        expect(m[placeholderName("b1", "stripe", 0)]).toBe("v1");
        expect(m[placeholderName("b1", "stripe", 1)]).toBe("v2");
        expect(Object.keys(m)).toHaveLength(2);
    });

    test("merges multiple proxies into one map; same env across proxies = different placeholders", () => {
        const m = buildSecretsManifest([
            proxy({ providerId: "stripe",  rules: oneEnvHeader("KEY"), secrets: { KEY: "a" } }),
            proxy({ providerId: "weather", rules: oneEnvHeader("KEY"), secrets: { KEY: "b" } }),
        ]);
        expect(Object.keys(m)).toHaveLength(2);
        expect(Object.values(m).sort()).toEqual(["a", "b"]);
    });

    test("throws if a referenced ${env:X} has no entry in proxy.secrets", () => {
        expect(() => buildSecretsManifest([proxy({
            rules:   oneEnvHeader("MISSING"),
            secrets: {},
        })])).toThrow(/MISSING.*proxy\.secrets/);
    });
});
