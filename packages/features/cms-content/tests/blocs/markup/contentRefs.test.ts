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

    test("rejects native Page roots", async () => {
        await expect(assertContentRefsExist(makeSystem(), "<p>hello</p><div>x</div>")).rejects.toThrow(
            "cannot be a Page root",
        );
    });

    test("passes when every bloc ref is registered", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await assertContentRefsExist(cms, `<fixture-card></fixture-card>`);
    });

    test("rejects inactive Blocs outside the authoring catalogue", async () => {
        let includeInactive = false;
        const cms = {
            getBlocsList: async (options?: { includeInactive?: boolean }) => {
                includeInactive = options?.includeInactive === true;
                return includeInactive ? [{ id: "basic-button" }] : [];
            },
        };

        await expect(assertContentRefsExist(cms, "<basic-button></basic-button>")).rejects.toThrow(
            "unknown or inactive",
        );
        expect(includeInactive).toBeFalse();
    });

    test("rejects unknown bloc tag", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await expect(assertContentRefsExist(cms, `<fixture-mystery></fixture-mystery>`)).rejects.toThrow(
            /unknown or inactive reference\(s\): bloc "fixture-mystery"/,
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

    test("requires real link semantics and rejects nested interactive content", async () => {
        const cms = makeSystem({
            blocs: ["fixture-card"],
            managed: { "fixture-link": ["a"] },
        });
        await assertContentRefsExist(
            cms,
            '<fixture-link><a href="/about" aria-label="About"><fixture-card></fixture-card></a></fixture-link>',
        );
        await expect(
            assertContentRefsExist(
                cms,
                '<fixture-link><a aria-label="About"><fixture-card></fixture-card></a></fixture-link>',
            ),
        ).rejects.toThrow("declare href");
        for (const content of [
            '<fixture-link><a href="/about" aria-label="About"><button type="button">Open</button></a></fixture-link>',
            '<fixture-link><a href="/about" aria-label="About"><fixture-card><a href="/other">Other</a></fixture-card></a></fixture-link>',
        ]) {
            await expect(assertContentRefsExist(cms, content)).rejects.toThrow("cannot nest interactive content");
        }
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

    test("rejects reserved system elements as Page roots", async () => {
        const cms = makeSystem();
        await expect(assertContentRefsExist(cms, `<cms-binding-core></cms-binding-core>`)).rejects.toThrow(
            "unavailable Page root Bloc",
        );
    });

    test("queries the active catalogue for every non-empty Page", async () => {
        let blocCalls = 0;
        const cms: any = {
            getBlocsList: async () => {
                blocCalls++;
                return [];
            },
        };
        await expect(
            assertContentRefsExist(cms, `<w13c-reserved-example data-id="header"></w13c-reserved-example>`),
        ).rejects.toThrow();
        expect(blocCalls).toBe(1);
    });

    test("enforces named slot accepts and cardinality", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-card",
                    slots: {
                        title: { accepts: [{ kind: "rich-text", profile: "inline" }], min: 1, max: 1 },
                        actions: { accepts: [{ kind: "any-component" }], max: 1 },
                    },
                },
                { id: "fixture-action", slots: {} },
                {
                    id: "fixture-composition",
                    compositionHTML: "<fixture-action></fixture-action>",
                    slots: {},
                },
            ],
        };
        await assertContentRefsExist(
            cms,
            '<fixture-card><h2 slot="title">Title</h2><fixture-action slot="actions"></fixture-action></fixture-card>',
        );
        await expect(
            assertContentRefsExist(cms, '<fixture-card><p slot="missing">Text</p></fixture-card>'),
        ).rejects.toThrow("does not declare slot");
        await expect(
            assertContentRefsExist(cms, '<fixture-card><fixture-action slot="title"></fixture-action></fixture-card>'),
        ).rejects.toThrow("does not accept Bloc");
        await expect(
            assertContentRefsExist(
                cms,
                '<fixture-card><fixture-composition slot="actions"></fixture-composition></fixture-card>',
            ),
        ).rejects.toThrow("does not accept Bloc");
        await expect(assertContentRefsExist(cms, "<fixture-card></fixture-card>")).rejects.toThrow(
            "requires at least 1 item",
        );
    });

    test("rejects undeclared Bloc host attributes and root slot targets", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await expect(assertContentRefsExist(cms, '<fixture-card mystery="value"></fixture-card>')).rejects.toThrow(
            "not a declared setting",
        );
        await expect(assertContentRefsExist(cms, '<fixture-card slot="ghost"></fixture-card>')).rejects.toThrow(
            "cannot target a slot",
        );
    });

    test("accepts only declared settings on Bloc hosts", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-card",
                    settings: [
                        {
                            id: "tone",
                            label: "Tone",
                            type: "string",
                            default: "quiet",
                            maxLength: 5,
                            control: { kind: "text" },
                        },
                    ],
                },
            ],
        };
        await assertContentRefsExist(cms, '<fixture-card tone="loud"></fixture-card>');
        await expect(assertContentRefsExist(cms, '<fixture-card tone="too-long"></fixture-card>')).rejects.toThrow(
            "settings are invalid",
        );
    });

    test("validates dynamic Bloc attributes against declared setting types", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-card",
                    settings: [
                        {
                            id: "expanded",
                            label: "Expanded",
                            type: "boolean",
                            default: false,
                            control: { kind: "toggle" },
                        },
                        {
                            id: "tone",
                            label: "Tone",
                            type: "string",
                            default: "quiet",
                            control: { kind: "text" },
                        },
                        {
                            id: "count",
                            label: "Count",
                            type: "integer",
                            default: 0,
                            control: { kind: "number" },
                        },
                    ],
                },
            ],
        };

        await assertContentRefsExist(
            cms,
            '<fixture-card expanded="{{ item.open }}" tone="{{ item.tone }}" count="{{ item.count }}"></fixture-card>',
        );
        await assertContentRefsExist(cms, "<fixture-card expanded=\"{{ item.state === 'open' }}\"></fixture-card>");
        for (const content of [
            '<fixture-card expanded="prefix {{ item.open }}"></fixture-card>',
            '<fixture-card expanded="{{ item.open | string }}"></fixture-card>',
            '<fixture-card count="{{ item.open === true }}"></fixture-card>',
            '<fixture-card tone="{{ item.open === true }}"></fixture-card>',
            '<fixture-card mystery="{{ item.value }}"></fixture-card>',
        ]) {
            await expect(assertContentRefsExist(cms, content)).rejects.toThrow();
        }
    });
});
