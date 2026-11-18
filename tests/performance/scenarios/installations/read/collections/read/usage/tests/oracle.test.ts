import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../../../capabilities/inventory";
import { usageReaderScenarios } from "../plan";
import { consumerReferences, expectedUsage, referenceKey } from "../expected";
import { usagePageOracle } from "../oracle";
import { collectionStateModel } from "../../../tests/model";
import { prepareCollectionCorpus } from "../../../context/corpus";
import { auditPlan, coverageMatrix } from "../../../../../../../capabilities/coverage";

const digest = `sha256:${"a".repeat(64)}`;

test("all six usage variants have exact budgets and omissions fail without fixture-generated credit", async () => {
    const inventory = await performanceCapabilityInventory();
    const definitions = usageReaderScenarios(inventory, "unit-plan").map((row) => row.definition);
    expect(definitions).toHaveLength(6);
    const target = definitions[0]!.obligations[0]!.target;
    const selected = { ...inventory, targets: inventory.targets.filter((row) => row.key === target) };
    const relevant = (variant: string) => ["large", "history", "invalidation"].includes(variant);
    expect(
        auditPlan(selected, definitions).filter((row) => row.obligation && relevant(row.obligation.variant)),
    ).toEqual([]);
    expect(
        auditPlan(selected, definitions.slice(1)).some(
            (row) => row.code === "missing-scenario" && row.obligation && relevant(row.obligation.variant),
        ),
    ).toBe(true);
    expect(coverageMatrix(selected, definitions, []).every((row) => row.status !== "covered")).toBe(true);
});

test("usage expectations come from admitted fixture identities and authored pages, rejecting stale, missing, duplicate and foreign references", async () => {
    const inventory = await performanceCapabilityInventory();
    const { state } = await collectionStateModel(inventory);
    await prepareCollectionCorpus(state, "history");
    const tag = [...state.installed.values()][0]!.release.blocs[0]!.id;
    const pages = [{ id: "owned-page", revision: 2, path: "/usage", content: "unit markup", tags: [tag] }];
    const consumers = consumerReferences(inventory);
    const expected = expectedUsage(state, pages, consumers);
    expect(consumers).toHaveLength(12);
    expect(expected.size).toBe(14);
    expect([...expected.values()].filter((row) => row.scope === "catalogue")).toHaveLength(1);
    expect([...expected.values()].find((row) => row.location === "page:owned-page:/usage/published")?.id).toBe(tag);
    const references = [...expected.values()];
    const output = { complete: true, unknownCount: 0, unknown: [], total: expected.size, references, digest };
    const oracle = usagePageOracle(expected, 500, digest, true);
    expect(() => oracle(output)).not.toThrow();
    for (const invalid of [
        { ...output, references: references.slice(1) },
        { ...output, references: [...references, references[0]] },
        { ...output, references: [{ ...references[0], location: "foreign" }, ...references.slice(1)] },
        { ...output, total: output.total - 1 },
        { ...output, digest: `sha256:${"b".repeat(64)}` },
        { ...output, complete: false },
        { ...output, unknown: ["unknown"], unknownCount: 1 },
        { ...output, cursor: "unexpected-next-page" },
    ]) {
        expect(() => oracle(invalid)).toThrow();
    }
    expect(new Set(references.map(referenceKey)).size).toBe(references.length);
    expect(() => expectedUsage(state, [{ ...pages[0]!, tags: ["foreign-bloc"] }], consumers)).toThrow("owned-page");
});
