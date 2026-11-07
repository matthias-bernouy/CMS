import { describe, expect, test } from "bun:test";
import { InMemoryProviderManifestCatalogue } from "cms-repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import type { ProviderInstallationStore } from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";
import { CatalogueSelectionDependencies } from "cms-repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { planContractSelections, type ContractSelection } from "@bernouy/ulvia-providers/selections";
import { contractDocument, implementation, releaseCatalogue, requirement } from "../support/fixtures";
import { graphFixture, installationFor, siteId } from "./fixtures";

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

    test("lets one specialized selection satisfy consumers of its parent", async () => {
        const releases = new InMemoryReleaseCatalogue();
        const emailer = await admitContractRelease(contractDocument("ulvia/emailer", "send"));
        await releases.publish(emailer);
        const smtpDocument = contractDocument("ulvia/emailer.smtp", "send");
        smtpDocument.extends = {
            contractId: "ulvia/emailer",
            version: "1.0.0",
            digest: emailer.digest,
        };
        smtpDocument.capabilities = [
            {
                ...(smtpDocument.capabilities as Record<string, unknown>[])[0],
                id: "smtp.configure",
                bindings: [
                    {
                        id: "http",
                        ...((smtpDocument.capabilities as Record<string, unknown>[])[0]!.bindings[0] as object),
                        path: "/v1/smtp/configuration",
                    },
                ],
            },
        ];
        const smtp = await admitContractRelease(smtpDocument);
        await releases.publish(smtp);
        const commerceDocument = contractDocument("ulvia/commerce", "checkout");
        const commerce = await admitContractRelease(commerceDocument);
        await releases.publish(commerce);
        const manifests = new InMemoryProviderManifestCatalogue(releases);
        const installation = await installationFor(releases, manifests, [
            implementation("ulvia/commerce", "1.0.0", commerce.digest, [requirement("ulvia/emailer", "send")]),
            implementation("ulvia/emailer.smtp", "1.0.0", smtp.digest),
        ]);
        const baseInstallation = await installationFor(
            releases,
            manifests,
            [implementation("ulvia/emailer", "1.0.0", emailer.digest)],
            "ulvia.base-email",
        );
        const selection = (
            contractId: string,
            digest: `sha256:${string}`,
            installationId = installation.id,
        ): ContractSelection => ({
            siteId,
            contractId,
            version: "1.0.0",
            digest,
            installationId,
        });
        const context = { releases, manifests, installations: [installation, baseInstallation] };

        const plan = await planContractSelections(
            siteId,
            [selection("ulvia/commerce", commerce.digest), selection("ulvia/emailer.smtp", smtp.digest)],
            context,
        );

        expect(plan.structurallyValid).toBe(true);
        expect(plan.dependencies).toContainEqual(
            expect.objectContaining({ contractId: "ulvia/emailer", present: true }),
        );
        await expect(
            planContractSelections(
                siteId,
                [
                    selection("ulvia/emailer", emailer.digest, baseInstallation.id),
                    selection("ulvia/emailer.smtp", smtp.digest),
                ],
                context,
            ),
        ).rejects.toMatchObject({ code: "duplicate_selection" });
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
