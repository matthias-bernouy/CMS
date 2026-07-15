import { describe, test, expect } from "bun:test";
import {
    createBlocUsageResolver,
    findUsedBlocTags,
    type ContentReader,
} from "@bernouy/cms-content";

describe("findUsedBlocTags", () => {
    test("returns empty when the bloc list is empty", () => {
        expect(findUsedBlocTags("<p>hi</p>", [])).toEqual([]);
    });

    test("returns empty when no registered tag appears in content", () => {
        expect(findUsedBlocTags("<p>hi</p>", [{ id: "my-card" }])).toEqual([]);
    });

    test("detects a single used tag", () => {
        expect(findUsedBlocTags("<my-card></my-card>", [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("detects self-closing usage", () => {
        expect(findUsedBlocTags("<my-card />", [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("detects tags with attributes", () => {
        expect(findUsedBlocTags(`<my-card foo="bar"></my-card>`, [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("is case-insensitive", () => {
        expect(findUsedBlocTags("<MY-CARD></MY-CARD>", [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("does NOT match a tag that only appears as a substring of another", () => {
        // `<my-card-extra>` must not match `my-card`.
        expect(findUsedBlocTags("<my-card-extra></my-card-extra>", [{ id: "my-card" }])).toEqual([]);
    });

    test("returns every registered tag that appears", () => {
        const used = findUsedBlocTags(
            "<my-card></my-card><other-bloc></other-bloc>",
            [
                { id: "my-card" },
                { id: "other-bloc" },
                { id: "unused" },
            ],
        );
        expect(used.sort()).toEqual(["my-card", "other-bloc"]);
    });
});

const compositionBlocs = [
    "root-card",
    "child-card",
    "side-card",
    "leaf-badge",
    "missing-card",
].map(id => ({ id }));

function compositionResolver(
    views: Record<string, string | null>,
    onRead: (tag: string) => void = () => undefined,
) {
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
            "root-card": "const t = `<child-card></child-card>`;",
            "child-card": "const t = `<leaf-badge></leaf-badge>`;",
            "leaf-badge": "LEAF();",
        });

        expect(await resolve("<root-card></root-card>")).toEqual([
            "child-card",
            "leaf-badge",
            "root-card",
        ]);
    });

    test("deduplicates shared dependencies and stops cycles", async () => {
        const resolve = compositionResolver({
            "root-card": "const t = `<child-card/><side-card/>`;",
            "child-card": "const t = `<leaf-badge/><root-card/>`;",
            "side-card": "const t = `<leaf-badge/>`;",
            "leaf-badge": "const t = `<child-card/>`;",
        });

        expect(await resolve("<root-card/><root-card/>")).toEqual([
            "child-card",
            "leaf-badge",
            "root-card",
            "side-card",
        ]);
    });

    test("keeps registered missing views and ignores unknown tags", async () => {
        const resolve = compositionResolver({
            "root-card": "const t = `<missing-card/><unknown-card/>`;",
        });

        expect(await resolve("<root-card/>")).toEqual([
            "missing-card",
            "root-card",
        ]);
    });

    test("reads each compiled view once while the resolver is reused", async () => {
        const reads: string[] = [];
        const resolve = compositionResolver({
            "root-card": "const t = `<child-card/>`;",
            "child-card": "CHILD();",
        }, tag => reads.push(tag));

        await resolve("<root-card/>");
        await resolve("<root-card/><child-card/>");

        expect(reads.sort()).toEqual(["child-card", "root-card"]);
    });
});
