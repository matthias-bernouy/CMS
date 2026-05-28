import { describe, test, expect } from "bun:test";
import { assertContentRefsExist } from "cms-control/core/validation/contentRefs";

function makeSystem(opts: { blocs?: string[]; snippets?: string[] } = {}) {
    const cms: any = {
        repository: {
            getBlocsList: async () => (opts.blocs ?? []).map(id => ({ id, name: id, group: "", description: "" })),
            getSnippetsMetadata: async () => (opts.snippets ?? []).map(identifier => ({
                id: `id-${identifier}`, identifier, name: identifier, category: "", updatedAt: "",
            })),
        },
    };
    return cms;
}

describe("assertContentRefsExist", () => {
    test("noop on empty content", async () => {
        await assertContentRefsExist(makeSystem(), "");
    });

    test("noop when content has no custom-element refs", async () => {
        await assertContentRefsExist(makeSystem(), "<p>hello</p><div>x</div>");
    });

    test("passes when every bloc + snippet ref is registered", async () => {
        const cms = makeSystem({ blocs: ["cs-card"], snippets: ["header"] });
        await assertContentRefsExist(cms, `<cs-card></cs-card><w13c-snippet identifier="header"></w13c-snippet>`);
    });

    test("rejects unknown bloc tag", async () => {
        const cms = makeSystem({ blocs: ["cs-card"] });
        await expect(assertContentRefsExist(cms, `<cs-mystery></cs-mystery>`))
            .rejects.toThrow(/unknown reference\(s\): bloc "cs-mystery"/);
    });

    test("rejects unknown snippet identifier", async () => {
        const cms = makeSystem({ snippets: ["header"] });
        await expect(assertContentRefsExist(cms, `<w13c-snippet identifier="ghost"></w13c-snippet>`))
            .rejects.toThrow(/unknown reference\(s\): snippet "ghost"/);
    });

    test("aggregates multiple missing refs in one error", async () => {
        const cms = makeSystem();
        await expect(assertContentRefsExist(
            cms,
            `<cs-a></cs-a><cs-b></cs-b><w13c-snippet identifier="hdr"></w13c-snippet>`,
        )).rejects.toThrow(/bloc "cs-a".*bloc "cs-b".*snippet "hdr"/);
    });

    test("ignores reserved system prefixes (w13c-* except snippet, cms-*)", async () => {
        const cms = makeSystem();
        await assertContentRefsExist(cms, `<cms-fetch></cms-fetch><w13c-fixed-admin-layout></w13c-fixed-admin-layout>`);
    });

    test("does not query bloc list when content has no bloc refs", async () => {
        let blocCalls = 0;
        const cms: any = {
            repository: {
                getBlocsList:        async () => { blocCalls++; return []; },
                getSnippetsMetadata: async () => [{ id: "x", identifier: "header", name: "h", category: "", updatedAt: "" }],
            },
        };
        await assertContentRefsExist(cms, `<w13c-snippet identifier="header"></w13c-snippet>`);
        expect(blocCalls).toBe(0);
    });
});
