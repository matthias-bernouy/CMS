import { describe, expect, test } from "bun:test";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { planContractSelections, type ContractSelection } from "@bernouy/cms-repository/providers/selections";
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
