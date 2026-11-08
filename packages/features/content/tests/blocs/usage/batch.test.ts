import { expect, test } from "bun:test";
import { createBlocUsageResolver } from "@bernouy/content";

const blocs = [
    { id: "root-card", markupHTML: '<div cms-bloc="child-card"></div>', uses: [] },
    { id: "child-card", markupHTML: "<slot></slot>", uses: [] },
];

test("batch failures remain failures and evict only failed resolver entries before retry", async () => {
    let requests = 0;
    const failure = new Error("store unavailable");
    const resolve = createBlocUsageResolver(blocs, {
        getBlocViewJS: async () => {
            throw new Error("Unexpected scalar load");
        },
        getBlocViewsJS: async (tags) => {
            requests++;
            if (requests === 1) {
                throw failure;
            }
            return Object.fromEntries(tags.map((tag) => [tag, null]));
        },
    });
    await expect(resolve('<div cms-bloc="root-card"></div>')).rejects.toBe(failure);
    expect(await resolve('<div cms-bloc="root-card"></div>')).toEqual(["child-card", "root-card"]);
    expect(requests).toBe(3);
    await resolve('<div cms-bloc="root-card"></div>');
    expect(requests).toBe(3);
});
