import { describe, expect, test } from "bun:test";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import {
    CatalogueSelectionDependencies,
    planContractSelections,
    type ContractSelection,
} from "@bernouy/cms-repository/providers/selections";
import { contractDocument, implementation, releaseCatalogue, requirement } from "../support/fixtures";
import { graphFixture, installationFor, siteId } from "./fixtures";

describe("full selection dependency graph", () => {
    test("checks additional mandatory implementation capabilities and exact capability IDs", async () => {
        const { context, select } = await graphFixture([requirement("emailer", "send", "^1.0.0 || ^2.0.0")]);
        const selected = [await select("commerce"), await select("payment")];
        await expect(planContractSelections(siteId, selected, context)).rejects.toMatchObject({
            code: "missing_dependency",
            dependencyPath: ["commerce", "emailer:send"],
        });
        await expect(
            planContractSelections(siteId, [...selected, await select("emailer", "2.0.0")], context),
        ).rejects.toMatchObject({ code: "incompatible_dependency", dependencyPath: ["commerce", "emailer:send"] });
        expect(
            (await planContractSelections(siteId, [...selected, await select("emailer")], context)).structurallyValid,
        ).toBe(true);
    });

    test("optional requirements remain absent unless their contract is selected, then must match", async () => {
        const { context, select } = await graphFixture([{ ...requirement("emailer", "send"), optional: true }]);
        const selected = [await select("commerce"), await select("payment")];
        const absent = await planContractSelections(siteId, selected, context);
        expect(absent.dependencies.find((dependency) => dependency.optional)).toMatchObject({ present: false });
        const present = await planContractSelections(siteId, [...selected, await select("emailer")], context);
        expect(present.dependencies.find((dependency) => dependency.optional)).toMatchObject({ present: true });
        await expect(
            planContractSelections(siteId, [...selected, await select("emailer", "2.0.0")], context),
        ).rejects.toMatchObject({ code: "incompatible_dependency" });
    });

    test("validates requirements of every capability in a selected release", async () => {
        const document = contractDocument("commerce", "checkout");
        const capabilities = document.capabilities as Record<string, unknown>[];
        capabilities.push({
            ...capabilities[0],
            id: "refund",
            binding: { ...(capabilities[0]!.binding as object), path: "/refund" },
            requires: [{ contractId: "payment", capabilityId: "pay", versionRange: "^1.0.0" }],
        });
        const releases = await releaseCatalogue(contractDocument("payment", "pay"), document);
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const commerce = (await releases.get("commerce", "1.0.0"))!.admission;
        const installation = await installationFor(releases, manifests, [
            implementation("commerce", "1.0.0", commerce.digest, [requirement("payment", "pay")]),
        ]);
        await expect(
            planContractSelections(
                siteId,
                [
                    {
                        siteId,
                        contractId: "commerce",
                        version: "1.0.0",
                        digest: commerce.digest,
                        installationId: installation.id,
                    },
                ],
                { releases, manifests, installations: [installation] },
            ),
        ).rejects.toMatchObject({ code: "missing_dependency" });
    });

    test("detects cycles crossing approved manifests and preserves a transitive conflict path", async () => {
        const releases = await releaseCatalogue(
            ...["alpha", "bravo", "charlie"].map((id) => contractDocument(id, "run")),
        );
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const selections: ContractSelection[] = [];
        const installations = [];
        for (const [contractId, target] of [
            ["alpha", "bravo"],
            ["bravo", "charlie"],
            ["charlie", "alpha"],
        ]) {
            const record = (await releases.get(contractId!, "1.0.0"))!.admission;
            const installation = await installationFor(
                releases,
                manifests,
                [implementation(contractId!, "1.0.0", record.digest, [requirement(target!, "run")])],
                `ulvia.${contractId}`,
            );
            installations.push(installation);
            selections.push({
                siteId,
                contractId: contractId!,
                version: "1.0.0",
                digest: record.digest,
                installationId: installation.id,
            });
        }
        const context = { releases, manifests, installations };
        await expect(planContractSelections(siteId, selections, context)).rejects.toMatchObject({
            code: "dependency_cycle",
            dependencyPath: ["alpha", "bravo", "charlie", "alpha"],
        });
        await expect(planContractSelections(siteId, selections.slice(0, 2), context)).rejects.toMatchObject({
            code: "missing_dependency",
            dependencyPath: ["alpha", "bravo", "charlie:run"],
        });
    });
});

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
    await fixture.releases.setYank("payment", "1.0.0", { reason: "retired" });
    expect(await dependencies.isCurrent(siteId, afterInstallation.revision)).toBe(false);
    const afterRelease = await dependencies.capture(siteId);
    await fixture.manifests.setYank("ulvia.example", "1.0.0", { reason: "retired" });
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
