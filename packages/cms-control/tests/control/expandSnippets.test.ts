import { describe, test, expect } from "bun:test";
import { expandSnippets } from "src/control/core/expandSnippets";
import type { ControlCms } from "src/control/ControlCms";
import type { TSnippet } from "src/socle/interfaces/models";

function makeSystem(snippets: Record<string, string>) {
    const fetchLog: string[] = [];
    const cms = {
        repository: {
            getSnippetByIdentifier: async (id: string): Promise<TSnippet | null> => {
                fetchLog.push(id);
                if (id in snippets) {
                    return {
                        id: `snippet-${id}`,
                        identifier: id,
                        name: id,
                        description: "",
                        content: snippets[id]!,
                        category: "",
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                }
                return null;
            },
        },
    } as unknown as ControlCms;
    return { cms, fetchLog };
}

describe("expandSnippets", () => {
    test("returns content unchanged when there are no snippet wrappers", async () => {
        const { cms, fetchLog } = makeSystem({});
        const out = await expandSnippets("<p>hello</p>", cms);
        expect(out).toBe("<p>hello</p>");
        expect(fetchLog).toHaveLength(0);
    });

    test("replaces a single snippet wrapper with its current content", async () => {
        const { cms } = makeSystem({ hero: "<h1>Hi</h1>" });
        const out = await expandSnippets(
            `before<w13c-snippet identifier="hero">stale</w13c-snippet>after`,
            cms
        );
        expect(out).toBe(`before<w13c-snippet identifier="hero"><h1>Hi</h1></w13c-snippet>after`);
    });

    test("replaces multiple distinct snippets independently", async () => {
        const { cms } = makeSystem({ a: "A", b: "B" });
        const out = await expandSnippets(
            `<w13c-snippet identifier="a">x</w13c-snippet><w13c-snippet identifier="b">y</w13c-snippet>`,
            cms
        );
        expect(out).toContain(`identifier="a">A</w13c-snippet>`);
        expect(out).toContain(`identifier="b">B</w13c-snippet>`);
    });

    test("deduplicates repository fetches when the same identifier appears twice", async () => {
        const { cms, fetchLog } = makeSystem({ hero: "H" });
        await expandSnippets(
            `<w13c-snippet identifier="hero">1</w13c-snippet><w13c-snippet identifier="hero">2</w13c-snippet>`,
            cms
        );
        expect(fetchLog).toEqual(["hero"]);
    });

    test("missing snippets expand to empty content", async () => {
        const { cms } = makeSystem({});
        const out = await expandSnippets(
            `<w13c-snippet identifier="ghost">stale</w13c-snippet>`,
            cms
        );
        expect(out).toBe(`<w13c-snippet identifier="ghost"></w13c-snippet>`);
    });

    test("wrapper without identifier attribute is passed through with empty body", async () => {
        const { cms } = makeSystem({});
        const out = await expandSnippets(
            `<w13c-snippet class="hero">stale</w13c-snippet>`,
            cms
        );
        expect(out).toBe(`<w13c-snippet class="hero"></w13c-snippet>`);
    });

    test("matches are case-insensitive on the tag — and output is normalized to lowercase", async () => {
        const { cms } = makeSystem({ a: "A" });
        const out = await expandSnippets(
            `<W13C-SNIPPET identifier="a">x</W13C-SNIPPET>`,
            cms
        );
        // The regex matches the uppercase variant, but the replacement writes
        // `w13c-snippet` in lowercase. Documenting this normalization.
        expect(out).toContain(`<w13c-snippet identifier="a">A</w13c-snippet>`);
    });

    test("single-quoted identifier attribute is recognized", async () => {
        const { cms } = makeSystem({ a: "A" });
        const out = await expandSnippets(
            `<w13c-snippet identifier='a'>x</w13c-snippet>`,
            cms
        );
        expect(out).toContain(`>A</w13c-snippet>`);
    });

    test("does NOT touch unrelated tags", async () => {
        const { cms } = makeSystem({ a: "A" });
        const input = `<article><p>hello</p></article>`;
        const out = await expandSnippets(input, cms);
        expect(out).toBe(input);
    });
});
