import { describe, test, expect } from "bun:test";
import { assertContentRefsExist } from "@bernouy/cms-content";

function makeSystem(opts: { blocs?: string[] } = {}) {
    const cms: any = {
        getBlocsList: async () => (opts.blocs ?? []).map((id) => ({ id, name: id, group: "", description: "" })),
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
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await assertContentRefsExist(
            cms,
            `<fixture-card></fixture-card><w13c-reserved-example data-id="header"></w13c-reserved-example>`,
        );
    });

    test("checks installed inactive blocs instead of the authoring catalogue", async () => {
        let includeInactive = false;
        const cms = {
            getBlocsList: async (options?: { includeInactive?: boolean }) => {
                includeInactive = options?.includeInactive === true;
                return includeInactive ? [{ id: "basic-button" }] : [];
            },
        };

        await assertContentRefsExist(cms, "<basic-button></basic-button>");
        expect(includeInactive).toBeTrue();
    });

    test("rejects unknown bloc tag", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await expect(assertContentRefsExist(cms, `<fixture-mystery></fixture-mystery>`)).rejects.toThrow(
            /unknown reference\(s\): bloc "fixture-mystery"/,
        );
    });

    test("aggregates multiple missing refs in one error", async () => {
        const cms = makeSystem();
        await expect(
            assertContentRefsExist(
                cms,
                `<fixture-a></fixture-a><fixture-b></fixture-b><w13c-reserved-example data-id="hdr"></w13c-reserved-example>`,
            ),
        ).rejects.toThrow(/bloc "fixture-a".*bloc "fixture-b"/);
    });

    test("ignores reserved system prefixes (w13c-*, cms-*)", async () => {
        const cms = makeSystem();
        await assertContentRefsExist(
            cms,
            `<cms-binding-core></cms-binding-core><w13c-fixed-admin-layout></w13c-fixed-admin-layout>`,
        );
    });

    test("does not query bloc list when content has no bloc refs", async () => {
        let blocCalls = 0;
        const cms: any = {
            getBlocsList: async () => {
                blocCalls++;
                return [];
            },
        };
        await assertContentRefsExist(cms, `<w13c-reserved-example data-id="header"></w13c-reserved-example>`);
        expect(blocCalls).toBe(0);
    });
});
