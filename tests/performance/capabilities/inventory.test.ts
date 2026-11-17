import { expect, test } from "bun:test";
import { inventoryFixture } from "../fixtures/inventory";
import { inventoryFromBuilds, officialCapabilityInventory, scopedInventory } from "./inventory";

test("the compiled inventory resolves inheritance, exact pins and non-executable templates separately", async () => {
    const { inventory, build } = await inventoryFixture();
    expect(inventory.targets.map((target) => target.definition.id).toSorted()).toEqual(["inherited", "read"]);
    const inherited = inventory.targets.find((target) => target.definition.id === "inherited")!;
    expect(inherited.release.contractId).toBe("performance/child");
    expect(inherited.owner.contractId).toBe("performance/parent");
    expect(inventory.templates.map((entry) => entry.release.contractId)).toEqual(["performance/template"]);
    expect(inventoryFromBuilds(build, [build]).targets).toHaveLength(2);
    expect(inventoryFromBuilds(build).fingerprint).toBe(inventory.fingerprint);
});

test("a changed binding changes the inventory fingerprint and unresolved implementation claims refuse", async () => {
    const { build, inventory } = await inventoryFixture();
    const view = build.implementedContracts[0]!;
    const changed = {
        ...build,
        implementedContracts: [
            {
                ...view,
                capabilities: view.capabilities.map((capability) => ({
                    ...capability,
                    definition: { ...capability.definition, bindings: capability.definition.bindings.slice(0, 1) },
                })),
            },
        ],
    };
    expect(inventoryFromBuilds(changed).fingerprint).not.toBe(inventory.fingerprint);
    expect(() => inventoryFromBuilds({ ...build, implementedContracts: [] })).toThrow("no resolved execution view");
    expect(() =>
        inventoryFromBuilds({ ...build, implementations: [...build.implementations, ...build.implementations] }),
    ).toThrow("Duplicate executable capability");
});

test("the official executable matrix includes current and retained pins without claiming the discovery template", async () => {
    const inventory = await officialCapabilityInventory();
    expect(inventory.targets.some((target) => target.retained)).toBe(true);
    expect(
        inventory.targets.some(
            (target) =>
                target.release.contractId === "ulvia/cms.emailer.smtp" &&
                target.owner.contractId === "ulvia/cms.emailer",
        ),
    ).toBe(true);
    expect(inventory.targets.some((target) => target.release.contractId === "ulvia/provider.cms-instances")).toBe(
        false,
    );
    expect(
        inventory.templates.find((entry) => entry.release.contractId === "ulvia/provider.cms-instances")?.capabilityIds,
    ).toEqual(["get-current", "list"]);
});

test("a focused inventory preserves the exact target and both bindings without claiming global coverage", async () => {
    const { inventory, target } = await inventoryFixture();
    const focused = scopedInventory(inventory, {
        contractId: target.release.contractId,
        capabilityId: target.definition.id,
    });
    expect(focused.targets).toEqual([target]);
    expect(focused.templates).toEqual([]);
    expect(focused.targets[0]!.definition.bindings).toHaveLength(2);
    expect(focused.fingerprint).not.toBe(inventory.fingerprint);
    expect(() => scopedInventory(inventory, { contractId: "absent/contract", capabilityId: "read" })).toThrow();
});
