import { describe, test, expect } from "bun:test";
import { assertContentRefsExist } from "@bernouy/cms-content";

function makeSystem(opts: { blocs?: string[]; managed?: Record<string, string[]> } = {}) {
    const cms: any = {
        getBlocsList: async () =>
            [...(opts.blocs ?? []), ...Object.keys(opts.managed ?? {})].map((id) => ({
                id,
                name: id,
                group: "",
                description: "",
                ...(opts.managed?.[id] ? { nativeElement: { accepts: opts.managed[id] } } : {}),
            })),
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

    test("accepts exactly one direct managed native child", async () => {
        const cms = makeSystem({ managed: { "fixture-action": ["button", "a"] } });
        await assertContentRefsExist(cms, `<fixture-action><button type="button">Save</button></fixture-action>`);
        await assertContentRefsExist(cms, `<fixture-action><a href="/about">About</a></fixture-action>`);
    });

    test("rejects missing, duplicated, slotted, or indirect managed native children", async () => {
        const cms = makeSystem({ managed: { "fixture-action": ["button", "a"] } });
        for (const content of [
            `<fixture-action></fixture-action>`,
            `<fixture-action><a href="/one">One</a><button type="button">Two</button></fixture-action>`,
            `<fixture-action><a slot="link" href="/">Link</a></fixture-action>`,
            `<fixture-action><span><a href="/">Link</a></span></fixture-action>`,
            `<fixture-action><p>Wrong</p></fixture-action>`,
        ]) {
            await expect(assertContentRefsExist(cms, content)).rejects.toThrow(
                /requires exactly one direct, un-slotted accepted native child \(<button>, <a>\)/,
            );
        }
    });

    test("rejects managed native children with incompatible structural attributes", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-checkbox",
                    nativeElement: {
                        accepts: ["input"],
                        attributes: { type: { required: true, values: ["checkbox"] } },
                    },
                },
            ],
        };
        await assertContentRefsExist(cms, '<fixture-checkbox><input type="checkbox"></fixture-checkbox>');
        await expect(
            assertContentRefsExist(cms, '<fixture-checkbox><input type="text"></fixture-checkbox>'),
        ).rejects.toThrow(/requires exactly one direct/);
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
