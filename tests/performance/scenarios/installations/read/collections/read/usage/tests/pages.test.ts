import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../../../capabilities/inventory";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { consumerReferences, referenceKey } from "../expected";
import { verifyUsagePages, usagePageInput } from "../pages";
import type { ScenarioClient } from "../../../../../../../harness/clients/session";

const digest = `sha256:${"a".repeat(64)}`;

test("usage cursor traversal verifies all known locations and refuses early EOF, repeats, duplicates and digest changes", async () => {
    const inventory = await performanceCapabilityInventory();
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/cms.installations" &&
            row.definition.id === "list-site-usage",
    )!;
    const references = consumerReferences(inventory);
    const expected = new Map(references.map((row) => [referenceKey(row), row]));
    const traverse = async (pages: Readonly<Record<string, unknown>>) => {
        let calls = 0;
        const client: ScenarioClient = async (_contract, _capability, _binding, input, assert) => {
            calls++;
            validateSchemaValue(target.definition.input, input);
            const output = pages[String(input.cursor ?? "first")];
            validateSchemaValue(target.definition.output, output);
            await assert?.(output);
            return {
                output,
                observation: {
                    traceId: "unit-no-coverage",
                    durationMs: 1,
                    requestBytes: 1,
                    responseBytes: 1,
                    status: 200,
                    validated: true,
                    completed: true,
                    streamConsumed: true,
                },
            };
        };
        await verifyUsagePages(client, expected);
        return { client, calls };
    };
    const base = { complete: true, digest, unknown: [], unknownCount: 0, total: references.length };
    const first = { ...base, references: references.slice(0, 6), cursor: "opaque-next" };
    const last = { ...base, references: references.slice(6) };
    const valid = await traverse({ first, "opaque-next": last });
    expect(valid.calls).toBe(2);
    expect((await usagePageInput(valid.client, expected, 1, 6)).input.cursor).toBe("opaque-next");
    const { cursor: _cursor, ...early } = first;
    await expect(traverse({ first: early })).rejects.toThrow("premature");
    await expect(traverse({ first, "opaque-next": { ...last, references: references } })).rejects.toThrow("cross-page");
    await expect(traverse({ first, "opaque-next": { ...last, cursor: "opaque-next" } })).rejects.toThrow("repeated");
    await expect(traverse({ first, "opaque-next": { ...last, digest: `sha256:${"b".repeat(64)}` } })).rejects.toThrow(
        "digest",
    );
});
