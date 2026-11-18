import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { planCollectionInitialization } from "@bernouy/repository/collections/installations";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { ClientFailure } from "../../../../../harness/clients/failure";
import { prepareCollectionTenant } from "../context/tenant";
import { collectionStateModel } from "./model";

test("collection preparation validates the encoded review and sends its approved digest, never an absent DTO field", async () => {
    const inventory = await performanceCapabilityInventory();
    const { state } = await collectionStateModel(inventory);
    const tenant = state.tenant;
    const plan = await planCollectionInitialization(null, [], { selected: [] });
    const evidence = {
        instanceId: tenant.site.instanceId,
        siteId: "default",
        actorId: tenant.session.subjectId,
        expectedRevision: 0,
        systemRevision: 0,
        collectionRevision: 0,
        executionFingerprint: `sha256:${"1".repeat(64)}`,
        plan,
    };
    const digest = `sha256:${createHash("sha256").update(canonicalizeIJson(evidence)).digest("hex")}`;
    let calls = 0;
    const fixture = { planDigest: digest, reviewJson: canonicalizeIJson({ ...evidence, digest }) };
    const bound = {
        ...tenant,
        fixture: async () => fixture,
        client: async (
            _contract: string,
            capability: string,
            binding: string,
            input: Readonly<Record<string, unknown>>,
        ) => {
            calls++;
            expect(capability).toBe("initialization.apply");
            expect(binding).toBe("http");
            expect(input).toEqual({ root: null, planDigest: digest });
            throw new ClientFailure("unit-stop-before-network");
        },
    };
    await expect(prepareCollectionTenant(inventory, bound, "http://registry.localhost")).rejects.toThrow(
        "unit-stop-before-network",
    );
    expect(calls).toBe(1);
    await expect(
        prepareCollectionTenant(
            inventory,
            {
                ...bound,
                fixture: async () => ({ ...fixture, planDigest: "wrong" }),
            },
            "http://registry.localhost",
        ),
    ).rejects.toThrow("tenant-plan-internal");
    expect(calls).toBe(1);
});
