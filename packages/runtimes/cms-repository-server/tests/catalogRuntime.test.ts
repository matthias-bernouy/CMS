import { describe, expect, test } from "bun:test";
import {
    createIntegrationRegistryCatalogSnapshot,
    type IntegrationRegistryCatalogSnapshot,
} from "@bernouy/cms-integration-registry";
import { RepositoryCatalogRuntime } from "../src/core/catalogRuntime";

describe("RepositoryCatalogRuntime", () => {
    test("is unready until the first valid snapshot is applied", async () => {
        const catalog = new RepositoryCatalogRuntime(fixedClock());

        expect(catalog.status()).toMatchObject({ status: "unready", ready: false, revision: 0 });
        expect(() => catalog.current()).toThrow("not ready");

        const failed = await catalog.refresh(async () => {
            throw new Error("filesystem unavailable");
        });
        expect(failed.applied).toBe(false);
        expect(failed.status).toMatchObject({ status: "unready", ready: false, lastRefreshFailed: true });

        const applied = await catalog.refresh(async () => snapshot());
        expect(applied.applied).toBe(true);
        expect(applied.status).toMatchObject({ status: "healthy", ready: true, revision: 1 });
    });

    test("retains the last valid snapshot and degrades after a refresh failure", async () => {
        const catalog = new RepositoryCatalogRuntime(fixedClock());
        const initial = snapshot();
        await catalog.refresh(async () => initial);

        const failed = await catalog.refresh(async () => {
            throw new Error("scan failed");
        });

        expect(failed.applied).toBe(false);
        expect(catalog.current()).toBe(initial);
        expect(catalog.status()).toMatchObject({
            status: "degraded",
            ready: true,
            revision: 1,
            lastRefreshFailed: true,
        });
    });

    test("reports a valid quarantined snapshot as ready but degraded", async () => {
        const catalog = new RepositoryCatalogRuntime(fixedClock());
        await catalog.refresh(async () =>
            snapshot({
                diagnostics: [
                    {
                        code: "invalid-structure",
                        stage: "discovery",
                        source: "redacted-by-health-response",
                        message: "invalid package",
                    },
                ],
                quarantined: [{ source: "invalid", diagnosticCodes: ["invalid-structure"] }],
            }),
        );

        expect(catalog.status()).toMatchObject({
            status: "degraded",
            ready: true,
            snapshotHealth: "degraded",
            diagnostics: 1,
            quarantined: 1,
        });
    });
});

function snapshot(
    overrides: Pick<Parameters<typeof createIntegrationRegistryCatalogSnapshot>[0], "diagnostics" | "quarantined"> = {},
): IntegrationRegistryCatalogSnapshot {
    return createIntegrationRegistryCatalogSnapshot({ entries: [], ...overrides });
}

function fixedClock(): () => Date {
    let tick = 0;
    return () => new Date(Date.UTC(2026, 6, 26, 10, 0, tick++));
}
