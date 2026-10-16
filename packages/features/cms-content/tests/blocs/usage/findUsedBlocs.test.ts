import { describe, test, expect } from "bun:test";
import { createBlocUsageResolver, findUsedBlocTags, type ContentReader } from "@bernouy/cms-content";

describe("findUsedBlocTags", () => {
    test("returns empty when the bloc list is empty", () => {
        expect(findUsedBlocTags("<p>hi</p>", [])).toEqual([]);
    });

    test("returns empty when no registered tag appears in content", () => {
        expect(findUsedBlocTags("<p>hi</p>", [{ id: "my-card" }])).toEqual([]);
    });

    test("detects a single used tag", () => {
        expect(findUsedBlocTags('<div cms-bloc="my-card"></div>', [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("detects self-closing usage", () => {
        expect(findUsedBlocTags('<div cms-bloc="my-card" />', [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("detects tags with attributes", () => {
        expect(findUsedBlocTags(`<div cms-bloc=\"my-card\" foo="bar"></div>`, [{ id: "my-card" }])).toEqual([
            "my-card",
        ]);
    });

    test("is case-insensitive", () => {
        expect(findUsedBlocTags('<div CMS-BLOC="MY-CARD"></div>', [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("does NOT match a tag that only appears as a substring of another", () => {
        // `<div cms-bloc=\"my-card-extra\">` must not match `my-card`.
        expect(findUsedBlocTags('<div cms-bloc="my-card-extra"></div>', [{ id: "my-card" }])).toEqual([]);
    });

    test("returns every registered tag that appears", () => {
        const used = findUsedBlocTags('<div cms-bloc="my-card"></div><div cms-bloc="other-bloc"></div>', [
            { id: "my-card" },
            { id: "other-bloc" },
            { id: "unused" },
        ]);
        expect(used.sort()).toEqual(["my-card", "other-bloc"]);
    });
});

const compositionBlocs = ["root-card", "child-card", "side-card", "leaf-badge", "missing-card"].map((id) => ({ id }));

function compositionResolver(views: Record<string, string | null>, onRead: (tag: string) => void = () => undefined) {
    const repository = {
        getBlocViewJS: async (tag: string) => {
            onRead(tag);
            return views[tag] ?? null;
        },
    } as Pick<ContentReader, "getBlocViewJS">;
    return createBlocUsageResolver(compositionBlocs, repository);
}

describe("createBlocUsageResolver", () => {
    test("follows compiled template tags transitively", async () => {
        const resolve = compositionResolver({
            "root-card": 'const t = `<div cms-bloc="child-card"></div>`;',
            "child-card": 'const t = `<div cms-bloc="leaf-badge"></div>`;',
            "leaf-badge": "LEAF();",
        });

        expect(await resolve('<div cms-bloc="root-card"></div>')).toEqual(["child-card", "leaf-badge", "root-card"]);
    });

    test("deduplicates shared dependencies and stops cycles", async () => {
        const resolve = compositionResolver({
            "root-card": 'const t = `<div cms-bloc="child-card"></div><div cms-bloc="side-card"></div>`;',
            "child-card": 'const t = `<div cms-bloc="leaf-badge"></div><div cms-bloc="root-card"></div>`;',
            "side-card": 'const t = `<div cms-bloc="leaf-badge"></div>`;',
            "leaf-badge": 'const t = `<div cms-bloc="child-card"></div>`;',
        });

        expect(await resolve('<div cms-bloc="root-card"></div><div cms-bloc="root-card"></div>')).toEqual([
            "child-card",
            "leaf-badge",
            "root-card",
            "side-card",
        ]);
    });

    test("keeps registered missing views and ignores unknown tags", async () => {
        const resolve = compositionResolver({
            "root-card": 'const t = `<div cms-bloc="missing-card"></div><div cms-bloc="unknown-card"></div>`;',
        });

        expect(await resolve('<div cms-bloc="root-card"></div>')).toEqual(["missing-card", "root-card"]);
    });

    test("reads each compiled view once while the resolver is reused", async () => {
        const reads: string[] = [];
        const resolve = compositionResolver(
            {
                "root-card": 'const t = `<div cms-bloc="child-card"></div>`;',
                "child-card": "CHILD();",
            },
            (tag) => reads.push(tag),
        );

        await resolve('<div cms-bloc="root-card"></div>');
        await resolve('<div cms-bloc="root-card"></div><div cms-bloc="child-card"></div>');

        expect(reads.sort()).toEqual(["child-card", "root-card"]);
    });
});
