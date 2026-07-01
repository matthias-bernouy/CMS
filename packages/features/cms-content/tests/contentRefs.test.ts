import { describe, test, expect } from "bun:test";
import { assertContentRefsExist } from "@bernouy/cms-content";

function makeSystem(opts: { blocs?: string[] } = {}) {
    const cms: any = {
        getBlocsList: async () => (opts.blocs ?? []).map(id => ({ id, name: id, group: "", description: "" })),
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

    test("passes when every bloc ref is registered", async () => {
        const cms = makeSystem({ blocs: ["cs-card"] });
        await assertContentRefsExist(cms, `<cs-card></cs-card><w13c-reserved-example data-id="header"></w13c-reserved-example>`);
    });

    test("rejects unknown bloc tag", async () => {
        const cms = makeSystem({ blocs: ["cs-card"] });
        await expect(assertContentRefsExist(cms, `<cs-mystery></cs-mystery>`))
            .rejects.toThrow(/unknown reference\(s\): bloc "cs-mystery"/);
    });

    test("aggregates multiple missing refs in one error", async () => {
        const cms = makeSystem();
        await expect(assertContentRefsExist(
            cms,
            `<cs-a></cs-a><cs-b></cs-b><w13c-reserved-example data-id="hdr"></w13c-reserved-example>`,
        )).rejects.toThrow(/bloc "cs-a".*bloc "cs-b"/);
    });

    test("ignores reserved system prefixes (w13c-*, cms-*)", async () => {
        const cms = makeSystem();
        await assertContentRefsExist(cms, `<cms-binding-core></cms-binding-core><w13c-fixed-admin-layout></w13c-fixed-admin-layout>`);
    });

    test("does not query bloc list when content has no bloc refs", async () => {
        let blocCalls = 0;
        const cms: any = {
            getBlocsList: async () => { blocCalls++; return []; },
        };
        await assertContentRefsExist(cms, `<w13c-reserved-example data-id="header"></w13c-reserved-example>`);
        expect(blocCalls).toBe(0);
    });
});
