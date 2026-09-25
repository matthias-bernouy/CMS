import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import { DEFAULT_PROVIDER_MANIFEST_LIMITS } from "cms-repository/providers/manifests/core/limits";
import { InMemoryProviderManifestCatalogue } from "cms-repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { ProviderInstallationLifecycle } from "cms-repository/providers/installations/core/lifecycle/ProviderInstallationLifecycle";
import { InMemoryProviderInstallationStore } from "cms-repository/providers/installations/default-implementation/memory/InMemoryProviderInstallationStore";
import { installationWorkflow } from "./fixtures";

describe("installation boundary snapshots", () => {
    test("propagates explicitly configured manifest limits through preparation, approval and observation", async () => {
        const fixture = await installationWorkflow();
        const manifestLimits = { ...DEFAULT_PROVIDER_MANIFEST_LIMITS, maxAllowedOrigins: 17 };
        const allowedOrigins = Array.from({ length: 17 }, (_, index) => `https://provider${index}.example.com`);
        const admission = await admitProviderManifest(
            { ...fixture.manifest, endpoint: { allowedOrigins } },
            fixture.contracts,
            manifestLimits,
        );
        const catalogue = new InMemoryProviderManifestCatalogue(
            fixture.contracts,
            manifestLimits,
            () => new Date("2026-09-24T09:00:00Z"),
        );
        await catalogue.publish(admission);
        const store = new InMemoryProviderInstallationStore(catalogue, fixture.clock, { manifestLimits });
        const lifecycle = new ProviderInstallationLifecycle(store, catalogue, fixture.clock, { manifestLimits });
        const candidate = { ...fixture.candidate, endpoint: allowedOrigins[0]!, manifestDigest: admission.digest };
        const report = { ...fixture.report, manifest: { ...fixture.report.manifest, digest: admission.digest } };
        const prepared = await lifecycle.prepare(candidate, report);
        const approved = await lifecycle.approve(prepared, "admin:owner");
        expect((await lifecycle.observe(fixture.scope, approved.revision, report)).observation).toBeDefined();
    });

    test("rechecks yanks after asynchronous manifest envelope verification", async () => {
        const { catalogue, lifecycle, candidate, report } = await installationWorkflow();
        const get = catalogue.get.bind(catalogue);
        let calls = 0;
        catalogue.get = async (providerId, version) => {
            const result = await get(providerId, version);
            calls += 1;
            if (calls === 1) {
                await catalogue.setYank(providerId, version, { reason: "Withdrawn during validation" });
            }
            return result;
        };
        await expect(lifecycle.prepare(candidate, report)).rejects.toMatchObject({ code: "manifest_unavailable" });
    });

    test("scope mutations during a pending observation cannot move it to another installation", async () => {
        const { approve, lifecycle, scope, candidate, report, store } = await installationWorkflow();
        await approve();
        const second = await lifecycle.approve(
            await lifecycle.prepare({ ...candidate, id: "installation:2", siteId: "site:2" }, report),
            "admin:second",
        );
        const mutableScope = { ...scope };
        const pending = lifecycle.observe(mutableScope, 1, report);
        mutableScope.installationId = second.installation.id;
        mutableScope.siteId = second.installation.siteId;
        await pending;
        expect((await store.get(scope))!.observation).toBeDefined();
        expect(await store.get(mutableScope)).toEqual(second);
    });

    test("snapshots changes before waiting and supports explicit removal of the local gateway reference", async () => {
        const { approve, lifecycle, scope, report } = await installationWorkflow();
        await approve();
        const observed = await lifecycle.observe(scope, 1, report);
        const changes = { configuration: { locale: "fr" }, gatewayTokenRef: null };
        const preparing = lifecycle.prepareModification(scope, observed.revision, changes, report);
        changes.configuration.locale = "en";
        const prepared = await preparing;
        expect(prepared.candidate.configuration.locale).toBe("fr");
        const modified = await lifecycle.modify(prepared, "admin:owner");
        expect(modified.installation.gatewayTokenRef).toBeUndefined();
        expect(modified.observation).toBeUndefined();
    });
});
