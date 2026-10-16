import { describe, expect, test } from "bun:test";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import type { ContentReader } from "@bernouy/cms-content";

const blocs = ["root-card", "child-card", "side-card", "leaf-badge"].map((id) => ({ id }));

function resolver(views: Record<string, string | null>) {
    const repository = {
        getBlocViewJS: async (tag: string) => views[tag] ?? null,
    } as Pick<ContentReader, "getBlocViewJS">;
    return createBlocUsageResolver(blocs, repository);
}

describe("createBlocUsageResolver", () => {
    test("follows compiled template tags transitively", async () => {
        const resolve = resolver({
            "root-card": 'const t = `<div cms-bloc="child-card"></div>`;',
            "child-card": 'const t = `<div cms-bloc="leaf-badge"></div>`;',
            "leaf-badge": "LEAF();",
        });

        expect(await resolve('<div cms-bloc="root-card"></div>')).toEqual(["child-card", "leaf-badge", "root-card"]);
    });

    test("deduplicates shared dependencies and stops cycles", async () => {
        const resolve = resolver({
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
});
