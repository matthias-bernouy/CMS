import { expect, test } from "bun:test";
import { createBlocTagFinder } from "content/blocs/core/usage/findUsedBlocTags";
import { createBlocUsageResolver } from "@bernouy/content";

/** Independent oracle retains the previous scanner's exact matching semantics. */
function original(content: string, catalogue: { id: string }[]) {
    const used: string[] = [];
    for (const { id } of catalogue) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        if (new RegExp(`\\bcms-bloc\\s*=\\s*(["'])${escaped}\\1`, "i").test(content)) {
            used.push(id);
        }
    }
    return used;
}

test("prepared scanning preserves declaration order, duplicates, case, quotes and regex metacharacters", () => {
    const catalogue = ["a.b", "a", "A", "a+b", 'quote"id', "[tag]", "a", "λ", "line\nbreak"].map((id) => ({ id }));
    const find = createBlocTagFinder(catalogue);
    const cases = [
        "",
        '<p cms-bloc="unknown"></p>',
        '<p data-cms-bloc="a"></p>',
        'notcms-bloc="a"',
        "<p CMS-BLOC = 'A'></p>",
    ];
    for (const { id } of catalogue) {
        for (const quote of ["'", '"']) {
            cases.push(`<div cms-bloc = ${quote}${id}${quote}></div>`);
            cases.push(`<div cms-bloc=${quote}${id}-extra${quote}></div>`);
            cases.push(`const compiled = \`cms-bloc=${quote}${id.toUpperCase()}${quote}\`;`);
        }
    }
    for (const input of [...cases, cases.join("\n")]) {
        expect(find(input)).toEqual(original(input, catalogue));
    }
});

test("failed views retry and separate catalogue resolvers do not share dependency state", async () => {
    let failed = false;
    const catalogue = [
        { id: "card", markupHTML: "" },
        { id: "child", markupHTML: "" },
    ];
    const resolve = createBlocUsageResolver(catalogue, {
        getBlocViewJS: async (tag) => {
            if (tag === "card" && !failed) {
                failed = true;
                throw new Error("retryable view");
            }
            return tag === "card" ? '<div cms-bloc="child"></div>' : null;
        },
    });
    await expect(resolve('<div cms-bloc="card"></div>')).rejects.toThrow("retryable view");
    expect(await resolve('<div cms-bloc="card"></div>')).toEqual(["card", "child"]);
    const other = createBlocUsageResolver(catalogue, { getBlocViewJS: async () => null });
    expect(await other('<div cms-bloc="card"></div>')).toEqual(["card"]);
});
