import { describe, expect, test } from "bun:test";
import { compareProviderManifests } from "@bernouy/cms-repository/providers/compatibility";
import { getProviderInstallationReadiness } from "@bernouy/cms-repository/providers/installations";
import { candidate, providerSite, report, scope, siteId } from "./fixtures";

describe("provider approval and site upgrade boundaries", () => {
    test("approves a new manifest without upgrading the site, then replaces a compatible full graph explicitly", async () => {
        const site = await providerSite();
        const preparation = await site.lifecycle.prepare(candidate(site.previous), report(site.previous));
        const approved = await site.lifecycle.approve(preparation, "admin:OWNER");
        expect(getProviderInstallationReadiness(approved, site.clock(), 60_000).status).toBe("unobserved");

        const previousPins = [site.pin("commerce", "1.0.0"), site.pin("payment", "1.0.0")];
        const selected = await site.selections.replace(siteId, previousPins, 0);
        expect(selected.plan.runtimeReadiness).toBe("not-evaluated");
        site.tick();
        const observed = await site.lifecycle.observe(scope, approved.revision, report(site.previous));
        expect(getProviderInstallationReadiness(observed, site.clock(), 60_000).readyImplementations).toHaveLength(2);

        await expect(site.lifecycle.observe(scope, observed.revision, report(site.next))).rejects.toThrow();
        expect((await site.installations.get(scope))!.installation.approval.manifestDigest).toBe(site.previous.digest);
        expect((await site.selections.get(siteId))!.revision).toBe(selected.revision);

        const comparison = await compareProviderManifests(site.previous, site.next);
        expect(comparison.requiresApproval).toBe(true);
        expect(
            comparison.changes.some((change) => change.category === "implementation" && change.kind === "added"),
        ).toBe(true);
        site.tick();
        const modification = await site.lifecycle.prepareModification(
            scope,
            observed.revision,
            {
                manifestVersion: site.next.manifest.version,
                manifestDigest: site.next.digest,
            },
            report(site.next),
        );
        const updated = await site.lifecycle.modify(modification, "admin:OWNER");
        expect(updated.installation.approval.manifestDigest).toBe(site.next.digest);
        expect(updated.observation).toBeUndefined();
        expect((await site.selections.get(siteId))!.plan.selections).toEqual(selected.plan.selections);

        await expect(
            site.selections.replace(
                siteId,
                [site.pin("commerce", "1.0.0"), site.pin("payment", "2.0.0")],
                selected.revision,
            ),
        ).rejects.toThrow();
        expect((await site.selections.get(siteId))!.revision).toBe(selected.revision);
        const upgraded = await site.selections.replace(
            siteId,
            [site.pin("commerce", "1.1.0"), site.pin("payment", "2.0.0")],
            selected.revision,
        );
        expect(upgraded.revision).toBe(selected.revision + 1);
        expect(upgraded.plan.selections.map((pin) => `${pin.contractId}@${pin.version}`)).toEqual([
            "commerce@1.1.0",
            "payment@2.0.0",
        ]);
    });

    test("revokes the local connection without rewriting historical site pins or claiming remote cleanup", async () => {
        const site = await providerSite();
        const preparation = await site.lifecycle.prepare(candidate(site.previous), report(site.previous));
        const approved = await site.lifecycle.approve(preparation, "admin:OWNER");
        const pins = [site.pin("commerce", "1.0.0"), site.pin("payment", "1.0.0")];
        const selected = await site.selections.replace(siteId, pins, 0);
        site.tick();
        const revoked = await site.lifecycle.revoke(scope, approved.revision);
        expect(getProviderInstallationReadiness(revoked, site.clock(), 60_000)).toEqual({
            status: "revoked",
            readyImplementations: [],
        });
        expect((await site.selections.get(siteId))!.plan.selections).toEqual(selected.plan.selections);
        await expect(site.selections.replace(siteId, pins, selected.revision)).rejects.toThrow();
        await expect(site.lifecycle.enable(scope, revoked.revision)).rejects.toThrow();
        await expect(site.lifecycle.observe(scope, revoked.revision, report(site.previous))).rejects.toThrow();
    });
});
