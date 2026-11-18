import { expect, test } from "bun:test";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { performanceCapabilityInventory } from "../../../../../../capabilities/inventory";
import { verifyOperationPages } from "../recipe";
import { operationRows } from "./rows";
import type { ScenarioClient } from "../../../../../../harness/clients/session";

test("complete traversal permits filtered terminal pages but refuses early EOF, repeated cursors and cross-page duplicates", async () => {
    const inventory = await performanceCapabilityInventory();
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/cms.installations" &&
            row.definition.id === "list-operations",
    )!;
    const traverse = async (pages: Readonly<Record<string, unknown>>) => {
        let requests = 0;
        const client: ScenarioClient = async (_contract, _capability, _binding, input, assert) => {
            requests++;
            validateSchemaValue(target.definition.input, input);
            const output = pages[String(input.cursor ?? "first")];
            validateSchemaValue(target.definition.output, output);
            await assert?.(output);
            return {
                output,
                observation: {
                    traceId: "unit-only-no-coverage",
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
        // This narrow port fake is used only by the traversal helper, never by a scenario or measurement collector.
        const context = {
            known: new Map(operationRows.map((row) => [row.operationId, row])),
            state: { tenant: { client } },
        };
        await verifyOperationPages(context);
        return requests;
    };
    expect(
        await traverse({
            first: { items: operationRows.slice(0, 2), nextCursor: "next" },
            next: { items: operationRows.slice(2), nextCursor: "filtered-tail" },
            "filtered-tail": { items: [] },
        }),
    ).toBe(3);
    await expect(traverse({ first: { items: operationRows.slice(0, 2) } })).rejects.toThrow("premature");
    await expect(
        traverse({
            first: { items: operationRows.slice(0, 2), nextCursor: "next" },
            next: { items: operationRows.slice(1) },
        }),
    ).rejects.toThrow("duplicate");
    await expect(
        traverse({
            first: { items: operationRows.slice(0, 1), nextCursor: "next" },
            next: { items: operationRows.slice(1, 2), nextCursor: "next" },
        }),
    ).rejects.toThrow("cursor");
});
