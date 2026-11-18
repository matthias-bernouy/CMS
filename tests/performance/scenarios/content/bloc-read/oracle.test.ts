import { expect, test } from "bun:test";
import { assertBlocRead } from "./oracle";
import { blocReadScenarios } from "./plan";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { assessmentScenarios } from "../../plan";
import { auditPlan } from "../../../capabilities/coverage";

test("Bloc reader oracles distinguish drafts, publications, retained archives and stale details", () => {
    const marker = "site-perf-unit";
    const published = {
        tag: `${marker}-a`,
        name: "A",
        group: "Group",
        description: "Owned",
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: 1,
        createdAt: "2026-11-18T00:00:00.000Z",
        updatedAt: "2026-11-18T00:00:01.000Z",
    };
    const archived = { ...published, tag: `${marker}-b`, name: "B", lifecycle: "archived", publishedRevision: null };
    const rows = [published, archived];
    const editor = {
        id: published.tag,
        name: published.name,
        group: published.group,
        description: published.description,
        kind: "composition",
        ownership: "site-builder",
        order: 0,
        defaultContent: "",
        authoringJson: '{"root":{"accepts":["div"]},"settings":[],"slots":{}}',
    };
    expect(() => assertBlocRead("site-blocs.list", { items: rows }, rows, marker)).not.toThrow();
    expect(() => assertBlocRead("site-blocs.get", published, rows, marker, published.tag)).not.toThrow();
    expect(() => assertBlocRead("pages.editor-catalogue", { items: [editor] }, rows, marker)).not.toThrow();
    for (const items of [[], [published], [published, published], [archived, published]]) {
        expect(() => assertBlocRead("site-blocs.list", { items }, rows, marker)).toThrow();
    }
    for (const output of [
        { ...published, publishedRevision: null },
        { ...published, lifecycle: "archived" },
        { ...published, updatedAt: "2026-11-18T00:00:00.000Z" },
    ]) {
        expect(() => assertBlocRead("site-blocs.get", output, rows, marker, published.tag)).toThrow();
    }
    for (const items of [
        [],
        [editor, editor],
        [{ ...editor, ownership: "code-managed" }],
        [{ ...editor, authoringJson: "{}" }],
        [editor, { ...editor, id: archived.tag, name: "B" }],
    ]) {
        expect(() => assertBlocRead("pages.editor-catalogue", { items }, rows, marker)).toThrow();
    }
    // Archiving a published composition retains its publication artifact in the current implementation.
    expect(() =>
        assertBlocRead(
            "pages.editor-catalogue",
            { items: [editor] },
            [{ ...published, lifecycle: "archived" }, archived],
            marker,
        ),
    ).not.toThrow();
});

test("all three native Bloc readers have every required current HTTP/MCP variant", async () => {
    const inventory = await performanceCapabilityInventory();
    const advanced = blocReadScenarios(inventory, "unit");
    expect(advanced).toHaveLength(14);
    const keys = new Set(advanced.flatMap((row) => row.definition.obligations.map((item) => item.target)));
    const targets = inventory.targets.filter((target) => keys.has(target.key));
    const plan = assessmentScenarios(inventory, "unit")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((item) => keys.has(item.target)));
    expect(targets).toHaveLength(3);
    expect(auditPlan({ ...inventory, targets }, plan)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets },
            plan.filter((row) => row.id !== advanced[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
