import { describe, expect, test } from "bun:test";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import type { ContentReader } from "@bernouy/cms-content";

const blocs = ["root-card", "child-card", "side-card", "leaf-badge"].map(id => ({ id }));

function resolver(views: Record<string, string | null>) {
    const repository = {
        getBlocViewJS: async (tag: string) => views[tag] ?? null,
    } as Pick<ContentReader, "getBlocViewJS">;
    return createBlocUsageResolver(blocs, repository);
}

describe("createBlocUsageResolver", () => {
    test("follows compiled template tags transitively", async () => {
        const resolve = resolver({
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
        const resolve = resolver({
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
});
