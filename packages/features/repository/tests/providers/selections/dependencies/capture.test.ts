import { describe, expect, test } from "bun:test";
import { InMemoryProviderManifestCatalogue } from "repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { planContractSelections, type ContractSelection } from "@bernouy/ulvia-providers/selections";
import { contractDocument, implementation, releaseCatalogue, requirement } from "../../support/fixtures";
import { graphFixture, installationFor, siteId } from "../fixtures";

test("catalogue dependency revision tracks release, manifest, and installation changes", async () => {
    const fixture = await graphFixture();
    let installationRevision = 1;
    let installation = fixture.installation;
    const installationStore = {
        list: async () => [{ installation, revision: installationRevision }],
    } as unknown as ProviderInstallationStore;
    const dependencies = new CatalogueSelectionDependencies(fixture.releases, fixture.manifests, installationStore);
    const original = await dependencies.capture(siteId);
    expect(await dependencies.isCurrent(siteId, original.revision)).toBe(true);
    installationRevision += 1;
    expect(await dependencies.isCurrent(siteId, original.revision)).toBe(true);
    installation = { ...installation, status: "disabled" };
    expect(await dependencies.isCurrent(siteId, original.revision)).toBe(false);
    const afterInstallation = await dependencies.capture(siteId);
    await fixture.releases.setYank("ulvia/payment", "1.0.0", { reason: "retired" });
    expect(await dependencies.isCurrent(siteId, afterInstallation.revision)).toBe(false);
    const afterRelease = await dependencies.capture(siteId);
    await fixture.manifests.setYank("ulvia/ulvia.example", "1.0.0", { reason: "retired" });
    expect(await dependencies.isCurrent(siteId, afterRelease.revision)).toBe(false);
});

test("metadata revisions fence changes without loading catalogue artifacts on the gateway path", async () => {
    let releaseRevision = "release-1";
    let listCalls = 0;
    const releases = {
        revision: async () => releaseRevision,
        list: async () => {
            listCalls += 1;
            return [];
        },
    } as unknown as ConstructorParameters<typeof CatalogueSelectionDependencies>[0];
    const manifests = {
        revision: async () => "manifest-1",
        list: async () => {
            listCalls += 1;
            return [];
        },
    } as unknown as ConstructorParameters<typeof CatalogueSelectionDependencies>[1];
    const installations = {
        selectionRevision: async () => "installation-1",
        list: async () => {
            listCalls += 1;
            return [];
        },
    } as unknown as ConstructorParameters<typeof CatalogueSelectionDependencies>[2];
    const dependencies = new CatalogueSelectionDependencies(releases, manifests, installations);
    const revision = await dependencies.revision(siteId);
    expect(listCalls).toBe(0);
    expect(await dependencies.isCurrent(siteId, revision)).toBe(true);
    expect(listCalls).toBe(0);
    const snapshot = await dependencies.capture(siteId);
    expect(snapshot.revision).toBe(revision);
    expect(listCalls).toBe(3);
    releaseRevision = "release-2";
    expect(await dependencies.isCurrent(siteId, revision)).toBe(false);
    expect(listCalls).toBe(3);
});
