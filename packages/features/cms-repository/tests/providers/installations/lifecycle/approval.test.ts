import { describe, expect, test } from "bun:test";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS } from "cms-repository/providers/installations/core/limits";
import { getProviderInstallationReadiness } from "cms-repository/providers/installations/core/lifecycle/readiness";
import { installationWorkflow } from "./fixtures";

describe("provider installation preparation and approval", () => {
    test("requires an explicit action after independent immutable preparation", async () => {
        const fixture = await installationWorkflow();
        const { lifecycle, store, candidate, report, scope } = fixture;
        const prepared = await lifecycle.prepare(candidate, report);
        expect(await store.get(scope)).toBeNull();
        expect(Object.isFrozen(candidate.configuration)).toBe(false);
        expect(Object.isFrozen(prepared.candidate.configuration)).toBe(true);
        candidate.configuration.locale = "fr";
        report.account.label = "Changed by caller";
        expect(prepared.candidate.configuration.locale).toBe("en");
        expect(prepared.observation.report.account.label).toBe("Shared account");
        await expect(lifecycle.approve(structuredClone(prepared), "admin:owner")).rejects.toMatchObject({
            code: "invalid_preparation",
        });
        const stored = await lifecycle.approve(prepared, "admin:owner");
        expect(stored.installation.status).toBe("enabled");
        expect(stored.installation.approval.approvedBy).toBe("admin:owner");
        expect(stored.observation).toBeUndefined();
        expect(getProviderInstallationReadiness(stored, fixture.clock(), 1000).status).toBe("unobserved");
        await expect(lifecycle.approve(prepared, "admin:owner")).rejects.toMatchObject({ code: "invalid_preparation" });
    });

    test("does not treat parsed persisted records or mismatched reports as approval commands", async () => {
        const { lifecycle, store, candidate, report, approve } = await installationWorkflow();
        for (const patch of [
            { accountId: "account:other" },
            { providerTokenRef: "raw-token" },
            { configuration: { locale: "de" } },
            { endpoint: "https://outside.example.com" },
            { manifestDigest: `sha256:${"f".repeat(64)}` },
            { status: "enabled" },
        ]) {
            await expect(lifecycle.prepare({ ...candidate, ...patch }, report)).rejects.toThrow();
        }
        const stored = await approve();
        await expect(store.approve(stored.installation as never)).rejects.toThrow();
    });

    test("independent sites can explicitly approve the same remote account", async () => {
        const { lifecycle, candidate, report, store, approve } = await installationWorkflow();
        const first = await approve();
        const second = await lifecycle.approve(
            await lifecycle.prepare({ ...candidate, id: "installation:2", siteId: "site:2" }, report),
            "admin:second",
        );
        expect(second.installation.accountId).toBe(first.installation.accountId);
        expect(await store.list("site:1")).toEqual([first]);
        expect(await store.list("site:2")).toEqual([second]);
    });

    test("rejects stale preparations, future clocks and yanks before approval", async () => {
        const fixture = await installationWorkflow({ maxPreparationAgeMs: 1000 });
        const { lifecycle, candidate, report, catalogue } = fixture;
        const prepared = await lifecycle.prepare(candidate, report);
        fixture.setTime("2026-09-24T10:00:02Z");
        await expect(lifecycle.approve(prepared, "admin:owner")).rejects.toMatchObject({ code: "stale_timestamp" });
        fixture.setTime("2026-09-24T09:59:59Z");
        await expect(lifecycle.approve(prepared, "admin:owner")).rejects.toMatchObject({ code: "stale_timestamp" });
        fixture.setTime("2026-09-24T10:00:00Z");
        await catalogue.setYank(candidate.providerId, candidate.manifestVersion, { reason: "Withdrawn" });
        await expect(lifecycle.approve(prepared, "admin:owner")).rejects.toMatchObject({
            code: "manifest_unavailable",
        });
    });

    test("enforces configurable input budgets", async () => {
        const { lifecycle, candidate, report } = await installationWorkflow({
            limits: { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxDocumentBytes: 64 },
        });
        await expect(lifecycle.prepare(candidate, report)).rejects.toMatchObject({ code: "body_limit_exceeded" });
    });
});
