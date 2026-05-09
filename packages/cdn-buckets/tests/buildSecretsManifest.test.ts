import { describe, test, expect } from "bun:test";

import { buildSecretsManifest } from "src/core/proxy/buildSecretsManifest";
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

describe("buildSecretsManifest", () => {
    test("type=none produces nothing", () => {
        const m = buildSecretsManifest([proxy({ auth: { type: "none" } })]);
        expect(Object.keys(m)).toHaveLength(0);
    });

    test("type=bearer produces one entry keyed by placeholder(b, p, 0)", () => {
        const m = buildSecretsManifest([proxy({ auth: { type: "bearer", token: "sk_xxx" } })]);
        const key = placeholderName("b1", "stripe", 0);
        expect(m).toEqual({ [key]: "sk_xxx" });
    });

    test("type=headers produces one entry per header, indexed", () => {
        const m = buildSecretsManifest([proxy({
            auth: { type: "headers", headers: [
                { name: "X-API-Key", value: "v1" },
                { name: "X-Other",   value: "v2" },
            ]},
        })]);
        expect(m[placeholderName("b1", "stripe", 0)]).toBe("v1");
        expect(m[placeholderName("b1", "stripe", 1)]).toBe("v2");
        expect(Object.keys(m)).toHaveLength(2);
    });

    test("merges multiple proxies into one map without collisions", () => {
        const m = buildSecretsManifest([
            proxy({ providerId: "stripe",  auth: { type: "bearer", token: "a" } }),
            proxy({ providerId: "weather", auth: { type: "bearer", token: "b" } }),
        ]);
        expect(Object.keys(m)).toHaveLength(2);
        expect(Object.values(m).sort()).toEqual(["a", "b"]);
    });
});
