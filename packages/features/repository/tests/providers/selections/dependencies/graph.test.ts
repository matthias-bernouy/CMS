import { describe, expect, test } from "bun:test";
import { InMemoryProviderManifestCatalogue } from "repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { planContractSelections, type ContractSelection } from "@bernouy/ulvia-providers/selections";
import { contractDocument, implementation, releaseCatalogue, requirement } from "../../support/fixtures";
import { graphFixture, installationFor, siteId } from "../fixtures";

describe("full selection dependency graph", () => {
    test("checks additional mandatory implementation capabilities and exact capability IDs", async () => {
        const { context, select } = await graphFixture([requirement("ulvia/emailer", "send", "^1.0.0 || ^2.0.0")]);
        const selected = [await select("ulvia/commerce"), await select("ulvia/payment")];
        await expect(planContractSelections(siteId, selected, context)).rejects.toMatchObject({
            code: "missing_dependency",
            dependencyPath: ["ulvia/commerce", "ulvia/emailer:send"],
        });
        await expect(
            planContractSelections(siteId, [...selected, await select("ulvia/emailer", "2.0.0")], context),
        ).rejects.toMatchObject({
            code: "incompatible_dependency",
            dependencyPath: ["ulvia/commerce", "ulvia/emailer:send"],
        });
        expect(
            (await planContractSelections(siteId, [...selected, await select("ulvia/emailer")], context))
                .structurallyValid,
        ).toBe(true);
    });

    test("optional requirements remain absent unless their contract is selected, then must match", async () => {
        const { context, select } = await graphFixture([{ ...requirement("ulvia/emailer", "send"), optional: true }]);
        const selected = [await select("ulvia/commerce"), await select("ulvia/payment")];
        const absent = await planContractSelections(siteId, selected, context);
        expect(absent.dependencies.find((dependency) => dependency.optional)).toMatchObject({ present: false });
        const present = await planContractSelections(siteId, [...selected, await select("ulvia/emailer")], context);
        expect(present.dependencies.find((dependency) => dependency.optional)).toMatchObject({ present: true });
        await expect(
            planContractSelections(siteId, [...selected, await select("ulvia/emailer", "2.0.0")], context),
        ).rejects.toMatchObject({ code: "incompatible_dependency" });
    });

    test("validates implementation requirements independently from capability definitions", async () => {
        const document = contractDocument("ulvia/commerce", "checkout");
        const capabilities = document.capabilities as Record<string, unknown>[];
        capabilities.push({
            ...capabilities[0],
            id: "refund",
            bindings: [{ id: "http", ...(capabilities[0]!.bindings[0] as object), path: "/refund" }],
        });
        const releases = await releaseCatalogue(contractDocument("ulvia/payment", "pay"), document);
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const commerce = (await releases.get("ulvia/commerce", "1.0.0"))!.admission;
        const installation = await installationFor(releases, manifests, [
            implementation("ulvia/commerce", "1.0.0", commerce.digest, [requirement("ulvia/payment", "pay")]),
        ]);
        await expect(
            planContractSelections(
                siteId,
                [
                    {
                        siteId,
                        contractId: "ulvia/commerce",
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
            ...["ulvia/alpha", "ulvia/bravo", "ulvia/charlie"].map((id) => contractDocument(id, "run")),
        );
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const selections: ContractSelection[] = [];
        const installations = [];
        for (const [contractId, target] of [
            ["ulvia/alpha", "ulvia/bravo"],
            ["ulvia/bravo", "ulvia/charlie"],
            ["ulvia/charlie", "ulvia/alpha"],
        ]) {
            const record = (await releases.get(contractId!, "1.0.0"))!.admission;
            const installation = await installationFor(
                releases,
                manifests,
                [implementation(contractId!, "1.0.0", record.digest, [requirement(target!, "run")])],
                `ulvia/provider-${contractId!.split("/")[1]}`,
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
            dependencyPath: ["ulvia/alpha", "ulvia/bravo", "ulvia/charlie", "ulvia/alpha"],
        });
        await expect(planContractSelections(siteId, selections.slice(0, 2), context)).rejects.toMatchObject({
            code: "missing_dependency",
            dependencyPath: ["ulvia/alpha", "ulvia/bravo", "ulvia/charlie:run"],
        });
    });
});
