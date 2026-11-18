import { beforeAll, expect, test } from "bun:test";
import { inventoryFixture } from "../../../../fixtures/inventory";
import { publicationCollection } from "../../../repository/resources/collection";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan } from "../../../../capabilities/coverage";
import { assessmentScenarios } from "../../../plan";
import { exampleReadScenarios } from "../plan";
import { exampleListOracle, exampleDocumentOracle } from "../oracle";
import { exampleSources } from "../resource/source";
import { unitExampleOutput } from "./reader";
import type { ExampleResource } from "../resource/publish";

let resource: ExampleResource;
beforeAll(async () => {
    const fixture = await inventoryFixture();
    const suffix = "examples-oracle";
    const id = `performance-unit/fixture-collection-${suffix}`;
    resource = await publicationCollection("performance-unit", fixture.target.release, exampleSources(id, "1.0.0"), {
        suffix,
    });
});

test("example page and document oracles reject stale revisions, translations, truncated HTML, wrong order and cursors", () => {
    const input = { collectionId: resource.id, locale: "fr", limit: 16 };
    const page = unitExampleOutput(resource, 7, "examples.list", input);
    const assert = exampleListOracle(resource, 7, "fr", 0);
    expect(() => assert(page)).not.toThrow();
    const row = page as Readonly<Record<string, unknown>>;
    const items = row.items as readonly Readonly<Record<string, unknown>>[];
    for (const output of [
        { ...row, revision: 6 },
        { ...row, nextCursor: "17" },
        { ...row, total: 64 },
        { ...row, items: [...items].reverse() },
        { ...row, locale: "en" },
        { ...row, items: [{ ...items[0], label: "Stale label" }, ...items.slice(1)] },
        { ...row, items: [items[0], ...items.slice(0, 15)] },
    ]) {
        expect(() => assert(output)).toThrow("example-exact-page");
    }
    expect(() =>
        exampleListOracle(
            resource,
            7,
            "fr",
            65,
        )(unitExampleOutput(resource, 7, "examples.list", { ...input, cursor: "65" })),
    ).not.toThrow();
    const document = unitExampleOutput(resource, 7, "examples.get", {
        collectionId: resource.id,
        exampleId: "example-000",
    });
    expect(() => exampleDocumentOracle(resource, "example-000")(document)).not.toThrow();
    expect(() =>
        exampleDocumentOracle(resource, "example-000")({ ...document, document: { html: "Truncated" } }),
    ).toThrow();
});

test("both native Example readers have every current HTTP/MCP variant and omitted cases remain blocking", async () => {
    const inventory = await performanceCapabilityInventory();
    const advanced = exampleReadScenarios(inventory, "unit");
    expect(advanced).toHaveLength(8);
    const keys = new Set(advanced.flatMap((row) => row.definition.obligations.map((item) => item.target)));
    const targets = inventory.targets.filter((target) => keys.has(target.key));
    const plan = assessmentScenarios(inventory, "unit")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((item) => keys.has(item.target)));
    expect(auditPlan({ ...inventory, targets }, plan)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets },
            plan.filter((row) => row.id !== advanced[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
