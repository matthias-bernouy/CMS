import { describe, expect, test } from "bun:test";
import { getProviderInstallationReadiness } from "cms-repository/providers/installations/core/lifecycle/readiness";
import { installationWorkflow } from "./fixtures";

describe("CMS-owned runtime observations", () => {
    test("stores immutable observations without promoting pins or administrative status", async () => {
        const { approve, lifecycle, scope, report, clock, store } = await installationWorkflow();
        const approved = await approve();
        const observed = await lifecycle.observe(scope, 1, report);
        expect(observed.observation!.observedAt).toBe(clock());
        expect(observed.installation).toEqual(approved.installation);
        expect(approved.observation).toBeUndefined();
        report.implementations[0]!.status = "unavailable";
        expect(observed.observation!.report.implementations[0]!.status).toBe("ready");
        expect(Object.isFrozen(report.implementations[0])).toBe(false);
        expect(Object.isFrozen(observed.observation!.report.implementations[0])).toBe(true);
        const unavailable = await lifecycle.observe(scope, observed.revision, report);
        expect(unavailable.installation.status).toBe("enabled");
        expect(getProviderInstallationReadiness(unavailable, clock(), 1000).readyImplementations).toEqual([]);
        const disabled = await lifecycle.disable(scope, unavailable.revision);
        expect(disabled.observation).toBeUndefined();
        const reportWhileDisabled = await lifecycle.observe(scope, disabled.revision, report);
        expect(getProviderInstallationReadiness(reportWhileDisabled, clock(), 1000).status).toBe("disabled");
        expect((await store.get(scope))!.installation.approval).toEqual(approved.installation.approval);
    });

    test("only fresh observations expose ready exact releases and never freeze handwritten inputs", async () => {
        const { approve, lifecycle, scope, report, clock } = await installationWorkflow();
        const approved = await approve();
        expect(getProviderInstallationReadiness(approved, clock(), 1000).readyImplementations).toEqual([]);
        const observed = await lifecycle.observe(scope, 1, report);
        const mutable = structuredClone(observed);
        const readiness = getProviderInstallationReadiness(mutable, clock(), 1000);
        expect(readiness.readyImplementations).toHaveLength(1);
        expect(Object.isFrozen(mutable.observation!.report.implementations[0])).toBe(false);
        expect(Object.isFrozen(readiness.readyImplementations[0])).toBe(true);
        expect(getProviderInstallationReadiness(observed, "2026-09-24T10:00:01.001Z", 1000).status).toBe("stale");
        expect(getProviderInstallationReadiness(observed, "2026-09-24T09:59:59Z", 1000).status).toBe("stale");
        const empty = await lifecycle.observe(scope, observed.revision, { ...report, implementations: [] });
        expect(getProviderInstallationReadiness(empty, clock(), 1000).readyImplementations).toEqual([]);
    });

    test("rejects report authority changes, provider timestamps and a regressing CMS clock", async () => {
        const { approve, lifecycle, scope, report, setTime } = await installationWorkflow();
        await approve();
        for (const patch of [
            { observedAt: "2099-01-01T00:00:00Z" },
            { providerId: "other.provider" },
            { account: { ...report.account, id: "account:other" } },
            { manifest: { ...report.manifest, version: "2.0.0" } },
            { implementations: [{ ...report.implementations[0], version: "2.0.0" }] },
        ]) {
            await expect(lifecycle.observe(scope, 1, { ...report, ...patch })).rejects.toThrow();
        }
        setTime("2026-09-24T10:00:01Z");
        const observed = await lifecycle.observe(scope, 1, report);
        setTime("2026-09-24T10:00:00Z");
        await expect(lifecycle.observe(scope, observed.revision, report)).rejects.toMatchObject({
            code: "stale_timestamp",
        });
        await expect(lifecycle.disable(scope, observed.revision)).rejects.toMatchObject({ code: "stale_timestamp" });
    });

    test("an existing manifest yank blocks reapproval but preserves observations of the existing pin", async () => {
        const { approve, lifecycle, scope, report, candidate, catalogue } = await installationWorkflow();
        await approve();
        await catalogue.setYank(candidate.providerId, candidate.manifestVersion, { reason: "No new connections" });
        const observed = await lifecycle.observe(scope, 1, report);
        expect(observed.observation!.report.manifest.digest).toBe(candidate.manifestDigest);
        await expect(lifecycle.prepareModification(scope, observed.revision, {}, report)).rejects.toMatchObject({
            code: "manifest_unavailable",
        });
    });
});
