import { describe, expect, test } from "bun:test";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import type { RateLimiter } from "@bernouy/rate-limiter";
import { RepositoryCms, type PublicPackageDownloadProtection } from "@bernouy/cms-repository";
import { json, TestRunner } from "./testRunner";

const PACKAGE_PATH = "/api/integrations/package?kind=demo&version=1.0.0";

describe("public integration package download protection", () => {
    test("rejects active protection without a limiter at composition time", () => {
        expect(
            () =>
                new RepositoryCms({
                    runner: new TestRunner(),
                    integrationCatalog: emptyCatalog(),
                    integrationPackages: { getPackage: async () => null },
                    packageDownloadProtection: { clientAddressPolicy: { mode: "direct" } },
                }),
        ).toThrow(/requires a rate limiter/);
    });

    test("returns 429 before consulting the package source", async () => {
        const fixture = setup({
            clientAddressPolicy: { mode: "direct" },
            rateLimiter: limiter({ allowed: false, retryAfterSeconds: 17 }),
        });

        const response = await fixture.runner.handle(PACKAGE_PATH, {}, "198.51.100.4");

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("17");
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(await json(response)).toMatchObject({ code: "rate_limited" });
        expect(fixture.keys).toEqual(["repository-package-download:198.51.100.4"]);
        expect(fixture.sourceCalls).toHaveLength(0);
    });

    test("rejects malformed forwarding chains before limiter and source work", async () => {
        const fixture = setup({
            clientAddressPolicy: { mode: "trusted-proxy", trustedProxyHops: 1 },
            rateLimiter: limiter({ allowed: true }),
        });

        const response = await fixture.runner.handle(
            PACKAGE_PATH,
            { headers: { "x-forwarded-for": "not-an-ip" } },
            "10.0.0.2",
        );

        expect(response.status).toBe(400);
        expect(await json(response)).toMatchObject({ code: "invalid_forwarded_chain" });
        expect(fixture.keys).toHaveLength(0);
        expect(fixture.sourceCalls).toHaveLength(0);
    });

    test("uses a dedicated loopback key before inspecting forwarding headers", async () => {
        const fixture = setup({
            clientAddressPolicy: { mode: "trusted-proxy", trustedProxyHops: 1 },
            rateLimiter: limiter({ allowed: true }),
        });

        await fixture.runner.handle(PACKAGE_PATH, { headers: { "x-forwarded-for": "invalid" } }, "127.0.0.1");

        expect(fixture.keys).toEqual(["repository-package-download:loopback"]);
        expect(fixture.sourceCalls).toEqual(["demo@1.0.0"]);
    });

    test("keeps HEAD outside the budget while still validating exact identity", async () => {
        const fixture = setup({
            clientAddressPolicy: { mode: "direct" },
            rateLimiter: limiter({ allowed: false }),
        });

        const head = await fixture.runner.handle(PACKAGE_PATH, { method: "HEAD" });
        const invalid = await fixture.runner.handle("/api/integrations/package?kind=demo", { method: "HEAD" });

        expect(head.status).toBe(404);
        expect(invalid.status).toBe(400);
        expect(fixture.keys).toHaveLength(0);
        expect(fixture.sourceCalls).toEqual(["demo@1.0.0"]);
    });

    test("fails closed when an active runner did not record the TCP peer", async () => {
        const fixture = setup({
            clientAddressPolicy: { mode: "direct" },
            rateLimiter: limiter({ allowed: true }),
        });

        const response = await fixture.runner.handle(PACKAGE_PATH);

        expect(response.status).toBe(503);
        expect(await json(response)).toMatchObject({ code: "client_address_unavailable" });
        expect(fixture.keys).toHaveLength(0);
        expect(fixture.sourceCalls).toHaveLength(0);
    });
});

function setup(protection: PublicPackageDownloadProtection) {
    const runner = new TestRunner();
    const keys: string[] = [];
    const sourceCalls: string[] = [];
    const configuredLimiter = protection.rateLimiter;
    const integrationPackages: IntegrationPackageSource = {
        getPackage: async (kind, version) => {
            sourceCalls.push(`${kind}@${version}`);
            return null;
        },
    };
    new RepositoryCms({
        runner,
        integrationCatalog: emptyCatalog(),
        integrationPackages,
        packageDownloadProtection: {
            ...protection,
            ...(configuredLimiter
                ? {
                      rateLimiter: {
                          ...configuredLimiter,
                          hit: async (key) => {
                              keys.push(key);
                              return await configuredLimiter.hit(key);
                          },
                      },
                  }
                : {}),
        },
    });
    return { runner, keys, sourceCalls };
}

function limiter(result: Awaited<ReturnType<RateLimiter["hit"]>>): RateLimiter {
    return { hit: async () => result, reset: async () => undefined };
}

function emptyCatalog(): IntegrationDefinitionRepository {
    return {
        list: async () => [],
        getIndex: async () => null,
        listVersions: async () => [],
        get: async () => null,
    };
}
