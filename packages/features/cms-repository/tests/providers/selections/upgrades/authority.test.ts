import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import {
    ContractUpgradeService,
    InMemoryContractSelectionStore,
    planContractSelections,
} from "@bernouy/cms-repository/providers/selections";
import { MemorySiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import { graphFixture, installationFor, siteId } from "../fixtures";
import { contractDocument, implementation, requirement } from "../../support/fixtures";

test("global requirements are checked once per participating installation without a co-hosted cycle", async () => {
    for (const optional of [true, false]) {
        const f = await graphFixture();
        const old = (await f.manifests.get(f.installation.providerId, f.installation.approval.manifestVersion))!
            .admission;
        const next = await admitProviderManifest(
            { ...old.manifest, version: "1.1.0", requires: [{ ...requirement("payment", "pay"), optional }] },
            f.releases,
        );
        await f.manifests.publish(next);
        const installation = {
            ...f.installation,
            approval: { ...f.installation.approval, manifestVersion: "1.1.0", manifestDigest: next.digest },
        };
        const context = { ...f.context, installations: [installation] };
        const plan = await planContractSelections(
            siteId,
            [await f.select("payment"), await f.select("emailer")],
            context,
        );
        expect(plan.dependencies.filter(({ source }) => source === "provider")).toHaveLength(1);
        expect(plan.authority.machine).toHaveLength(1);
        if (optional) {
            const absent = await planContractSelections(siteId, [await f.select("emailer")], context);
            expect(absent.dependencies[0]!.present).toBe(false);
            expect(absent.authority.machine).toBeEmpty();
        } else {
            await expect(planContractSelections(siteId, [await f.select("emailer")], context)).rejects.toMatchObject({
                code: "missing_dependency",
            });
        }
    }
});

test("a non-sensitive wildcard expansion changes reviewed authority and cannot be applied using a different grant plan", async () => {
    const f = await graphFixture();
    const currentManifest = (await f.manifests.get(f.installation.providerId, f.installation.approval.manifestVersion))!
        .admission;
    const nextManifest = await admitProviderManifest(
        {
            ...currentManifest.manifest,
            version: "1.1.0",
            implementations: currentManifest.manifest.implementations.map((item) =>
                item.contractId === "commerce" && item.version === "1.0.0"
                    ? {
                          ...item,
                          delegation: {
                              sources: ["*"],
                              allow: [{ contractId: "*", capabilityId: "*", effect: "*", sensitive: false }],
                          },
                      }
                    : item,
            ),
        },
        f.releases,
    );
    await f.manifests.publish(nextManifest);
    const sourceInstallation = {
        ...f.installation,
        approval: { ...f.installation.approval, manifestVersion: "1.1.0", manifestDigest: nextManifest.digest },
    };
    const targets = [];
    for (const [version, sensitive] of [
        ["1.0.0", true],
        ["2.0.0", false],
    ] as const) {
        const document = contractDocument("catalog", "read", version);
        const capability = (document.capabilities as { behavior: Record<string, unknown> }[])[0]!;
        capability.behavior.sensitive = sensitive;
        const release = await admitContractRelease(document);
        await f.releases.publish(release);
        targets.push(release);
    }
    const destination = await installationFor(
        f.releases,
        f.manifests,
        targets.map((release) => implementation("catalog", release.release.version, release.digest)),
        "catalog.provider",
    );
    const context = { ...f.context, installations: [sourceInstallation, destination] };
    let revision = "state-1";
    const dependencies = {
        capture: async () => ({ ...context, revision }),
        isCurrent: async (_site: string, expected: string) => expected === revision,
    };
    const store = new InMemoryContractSelectionStore(dependencies);
    const catalog = (index: number) => ({
        siteId,
        contractId: "catalog",
        version: targets[index]!.release.version,
        digest: targets[index]!.digest,
        installationId: destination.id,
    });
    const base = [await f.select("commerce"), await f.select("payment")];
    await store.replace(siteId, [...base, catalog(0)], 0);
    const service = new ContractUpgradeService(store, dependencies, new MemorySiteUpgradeStorage(), {
        usage: async () => ({ complete: true, revision: "usage-1", requirements: [], unknown: [] }),
        served: async () => ({ available: true, revision: "served-1" }),
    });
    const next = [...base, catalog(1)];
    const plan = await service.plan(siteId, next);
    expect(plan.status).toBe("applicable");
    expect(plan.authorityAdded).toHaveLength(1);
    expect(plan.authorityAdded[0]!.target).toMatchObject({
        contractId: "catalog",
        version: "2.0.0",
        digest: targets[1]!.digest,
        sensitive: false,
    });
    const grants = { default: "allow-selected" as const, denied: [{ contractId: "catalog", capabilityId: "read" }] };
    const denied = await service.plan(siteId, next, grants);
    expect(denied.authorityAdded).toBeEmpty();
    expect(denied.planDigest).not.toBe(plan.planDigest);
    await expect(service.apply(siteId, next, grants, plan.planDigest)).rejects.toMatchObject({ status: 409 });
    revision = "state-2";
    await expect(service.apply(siteId, next, undefined, plan.planDigest)).rejects.toMatchObject({ status: 409 });
});
