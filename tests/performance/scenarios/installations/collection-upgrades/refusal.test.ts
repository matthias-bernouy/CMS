import { expect, test } from "bun:test";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { COLLECTION_UPGRADE_SCHEMA_INVALID_ID } from "./context";

test("the collection reader negative-probe fixture violates the real admitted input schema", async () => {
    const inventory = await performanceCapabilityInventory();
    const target = inventory.targets.find(
        (entry) =>
            entry.release.contractId === "ulvia/cms.installations" &&
            entry.definition.id === "get-collection-upgrade" &&
            !entry.retained,
    );
    if (!target) {
        throw new Error("The current collection upgrade reader is missing");
    }
    const schema = target.definition.input;
    expect(() => validateSchemaValue(schema, { upgradeId: `sha256:${"1".repeat(64)}` })).not.toThrow();
    // Empty input is a valid lookup key under this contract; it cannot prove schema rejection.
    expect(() => validateSchemaValue(schema, { upgradeId: "" })).not.toThrow();
    expect(() => validateSchemaValue(schema, { upgradeId: COLLECTION_UPGRADE_SCHEMA_INVALID_ID })).toThrow();
    const http = target.definition.bindings.find((binding) => binding.transport === "http");
    if (!http || http.transport !== "http") {
        throw new Error("The reader HTTP binding is missing");
    }
    expect(http.response.errorStatuses.NOT_FOUND).toBe(404);
});
