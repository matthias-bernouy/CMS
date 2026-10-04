import { describe, expect, test } from "bun:test";
import {
    DefaultCollectionViewExecutionAuthority,
    InMemoryCollectionViewExecutionGrantStore,
} from "@bernouy/cms-gateway/execution";
import type { ContractSelectionStore, StoredContractSelections } from "@bernouy/cms-repository/providers/selections";
import { gatewayRoute } from "../fixtures";

const consumer = {
    siteId: "site-a",
    publisherId: "ulvia.official",
    collectionId: "ulvia.official",
    collectionVersion: "1.0.0",
    collectionDigest: `sha256:${"c".repeat(64)}`,
    viewId: "catalog",
    viewGeneration: 1,
} as const;

describe("collection view execution authority", () => {
    test("pins one immutable provider target and authorizes only declared capabilities", async () => {
        const route = await gatewayRoute();
        let stored = selections(route);
        const authority = new DefaultCollectionViewExecutionAuthority(
            { get: async () => stored } as Pick<ContractSelectionStore, "get">,
            { resolve: async () => route, isCurrent: async () => true },
            new InMemoryCollectionViewExecutionGrantStore(),
        );
        const grant = await authority.activate({
            consumer,
            requirements: [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" }],
        });

        expect(grant).toMatchObject({
            revision: 1,
            planDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
            plan: {
                selectionRevision: 1,
                dependencyRevision: "dependencies-1",
                targets: [
                    {
                        contractId: "catalog",
                        capabilityIds: ["item.list"],
                        version: "1.0.0",
                        installationId: "install-a",
                    },
                ],
            },
        });
        await expect(
            authority.authorize({ ...consumer, contractId: "catalog", capabilityId: "item.list" }),
        ).resolves.toMatchObject({ version: "1.0.0", installationId: "install-a" });
        await expect(
            authority.authorize({ ...consumer, contractId: "catalog", capabilityId: "item.write" }),
        ).rejects.toMatchObject({ code: "not_authorized" });

        stored = { ...stored, revision: 2 };
        await expect(
            authority.authorize({ ...consumer, contractId: "catalog", capabilityId: "item.list" }),
        ).rejects.toMatchObject({ code: "stale_route" });
    });

    test("rejects incompatible selections and keeps grants for collection releases independent", async () => {
        const route = await gatewayRoute();
        const authority = new DefaultCollectionViewExecutionAuthority(
            { get: async () => selections(route) },
            { resolve: async () => route, isCurrent: async () => true },
            new InMemoryCollectionViewExecutionGrantStore(),
        );
        await expect(
            authority.activate({
                consumer,
                requirements: [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^2.0.0" }],
            }),
        ).rejects.toMatchObject({ code: "not_selected" });

        await authority.activate({
            consumer,
            requirements: [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" }],
        });
        const target = {
            ...consumer,
            collectionVersion: "2.0.0",
            collectionDigest: `sha256:${"d".repeat(64)}`,
            viewGeneration: 2,
        } as const;
        await expect(
            authority.authorize({ ...target, contractId: "catalog", capabilityId: "item.list" }),
        ).rejects.toMatchObject({ code: "not_authorized" });
        await authority.activate({
            consumer: target,
            requirements: [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" }],
        });
        await expect(
            authority.authorize({ ...consumer, contractId: "catalog", capabilityId: "item.list" }),
        ).resolves.toMatchObject({ version: "1.0.0" });
        await expect(
            authority.authorize({ ...target, contractId: "catalog", capabilityId: "item.list" }),
        ).resolves.toMatchObject({ version: "1.0.0" });
    });
});

function selections(route: Awaited<ReturnType<typeof gatewayRoute>>): StoredContractSelections {
    return {
        siteId: "site-a",
        revision: 1,
        dependencyRevision: "dependencies-1",
        plan: {
            siteId: "site-a",
            selections: [route.selection],
            dependencies: [],
            structurallyValid: true,
            runtimeReadiness: "not-evaluated",
        },
    };
}
