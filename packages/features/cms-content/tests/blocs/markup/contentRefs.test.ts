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
                root: { accepts: ["div"] },
                ...(opts.managed?.[id]
                    ? {
                          slots: {
                              "": {
                                  accepts: [{ kind: "native-element", accepts: opts.managed[id] }],
                                  min: 1,
                                  max: 1,
                              },
                          },
                      }
                    : {}),
            })),
    };
    return cms;
}

async function assertFixtureContentRefsExist(repository: any, content: string): Promise<void> {
    await assertContentRefsExist(
        {
            getBlocsList: async (options) =>
                (await repository.getBlocsList(options)).map((bloc: Record<string, unknown>) => {
                    const slots = (bloc.slots ?? {}) as Record<string, unknown>;
                    const projectedSlots = Object.keys(slots)
                        .map((name) => (name ? `<slot name="${name}"></slot>` : "<slot></slot>"))
                        .join("");
                    return {
                        kind: "component" as const,
                        markupHTML: projectedSlots || "<slot></slot>",
                        ...bloc,
                    };
                }),
        },
        content,
    );
}

describe("assertContentRefsExist", () => {
    test("noop on empty content", async () => {
        await assertFixtureContentRefsExist(makeSystem(), "");
    });

    test("rejects native Page roots", async () => {
        await expect(assertFixtureContentRefsExist(makeSystem(), "<p>hello</p><div>x</div>")).rejects.toThrow(
            "cannot be a Page root",
        );
    });

    test("passes when every bloc ref is registered", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await assertFixtureContentRefsExist(cms, `<div cms-bloc=\"fixture-card\"></div>`);
    });

    test("rejects hidden Blocs as Page roots", async () => {
        let includeHidden = false;
        const cms = {
            getBlocsList: async (options?: { includeHidden?: boolean }) => {
                includeHidden = options?.includeHidden === true;
                return includeHidden ? [{ id: "basic-button" }] : [];
            },
        };

        await expect(assertFixtureContentRefsExist(cms, '<div cms-bloc="basic-button"></div>')).rejects.toThrow(
            "available cms-bloc identity",
        );
        expect(includeHidden).toBeTrue();
    });

    test("allows a hidden implementation Bloc only in an explicitly typed parent slot", async () => {
        const visible = [
            {
                id: "fixture-file-input",
                root: { accepts: ["div"] },
                slots: {
                    control: {
                        accepts: [{ kind: "component", tag: "fixture-native-file" }],
                        min: 1,
                        max: 1,
                    },
                },
            },
            {
                id: "fixture-generic",
                root: { accepts: ["div"] },
                slots: { content: { accepts: [{ kind: "any-component" }] } },
            },
        ];
        const hidden = { id: "fixture-native-file", root: { accepts: ["div"] }, slots: {} };
        const cms: any = {
            getBlocsList: async (options?: { includeHidden?: boolean }) =>
                options?.includeHidden ? [...visible, hidden] : visible,
        };

        await assertFixtureContentRefsExist(
            cms,
            '<div cms-bloc="fixture-file-input"><div cms-bloc="fixture-native-file" slot="control"></div></div>',
        );
        await expect(
            assertFixtureContentRefsExist(
                cms,
                '<div cms-bloc="fixture-generic"><div cms-bloc="fixture-native-file" slot="content"></div></div>',
            ),
        ).rejects.toThrow("must be nested in a slot that explicitly accepts it");
    });

    test("rejects unknown bloc tag", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await expect(assertFixtureContentRefsExist(cms, `<div cms-bloc=\"fixture-mystery\"></div>`)).rejects.toThrow(
            /unknown or hidden reference\(s\): bloc "fixture-mystery"/,
        );
    });

    test("accepts exactly one direct managed native child", async () => {
        const cms = makeSystem({ managed: { "fixture-action": ["button", "a"] } });
        await assertFixtureContentRefsExist(
            cms,
            `<div cms-bloc=\"fixture-action\"><button type="button">Save</button></div>`,
        );
        await assertFixtureContentRefsExist(cms, `<div cms-bloc=\"fixture-action\"><a href="/about">About</a></div>`);
    });

    test("rejects missing, duplicated, slotted, or indirect managed native children", async () => {
        const cms = makeSystem({ managed: { "fixture-action": ["button", "a"] } });
        for (const content of [
            `<div cms-bloc=\"fixture-action\"></div>`,
            `<div cms-bloc=\"fixture-action\"><a href="/one">One</a><button type="button">Two</button></div>`,
            `<div cms-bloc=\"fixture-action\"><a slot="link" href="/">Link</a></div>`,
            `<div cms-bloc=\"fixture-action\"><span><a href="/">Link</a></span></div>`,
            `<div cms-bloc=\"fixture-action\"><p>Wrong</p></div>`,
        ]) {
            await expect(assertFixtureContentRefsExist(cms, content)).rejects.toThrow();
        }
    });

    test("rejects managed native children with incompatible structural attributes", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-checkbox",
                    root: { accepts: ["div"] },
                    slots: {
                        "": {
                            accepts: [
                                {
                                    kind: "native-element",
                                    accepts: ["input"],
                                    attributes: { type: { required: true, values: ["checkbox"] } },
                                },
                            ],
                            min: 1,
                            max: 1,
                        },
                    },
                },
            ],
        };
        await assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-checkbox\"><input type="checkbox"></div>');
        await expect(
            assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-checkbox\"><input type="text"></div>'),
        ).rejects.toThrow(/native attribute "type" must be one of "checkbox"/);
    });

    test("requires real link semantics and rejects nested interactive content", async () => {
        const cms = makeSystem({
            blocs: ["fixture-card"],
            managed: { "fixture-link": ["a"] },
        });
        await assertFixtureContentRefsExist(
            cms,
            '<div cms-bloc=\"fixture-link\"><a href="/about" aria-label="About"><div cms-bloc=\"fixture-card\"></div></a></div>',
        );
        await expect(
            assertFixtureContentRefsExist(
                cms,
                '<div cms-bloc=\"fixture-link\"><a aria-label="About"><div cms-bloc=\"fixture-card\"></div></a></div>',
            ),
        ).rejects.toThrow("declare href");
        for (const content of [
            '<div cms-bloc=\"fixture-link\"><a href="/about" aria-label="About"><button type="button">Open</button></a></div>',
            '<div cms-bloc=\"fixture-link\"><a href="/about" aria-label="About"><div cms-bloc=\"fixture-card\"><a href="/other">Other</a></div></a></div>',
        ]) {
            await expect(assertFixtureContentRefsExist(cms, content)).rejects.toThrow(
                "cannot nest interactive content",
            );
        }
    });

    test("aggregates multiple missing refs in one error", async () => {
        const cms = makeSystem();
        await expect(
            assertFixtureContentRefsExist(
                cms,
                `<div cms-bloc=\"fixture-a\"></div><div cms-bloc=\"fixture-b\"></div><div cms-bloc=\"w13c-reserved-example\" data-id="hdr"></div>`,
            ),
        ).rejects.toThrow(/bloc "fixture-a".*bloc "fixture-b"/);
    });

    test("rejects reserved system elements as Page roots", async () => {
        const cms = makeSystem();
        await expect(assertFixtureContentRefsExist(cms, `<div cms-bloc=\"cms-binding-core\"></div>`)).rejects.toThrow(
            "available cms-bloc identity",
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
            assertFixtureContentRefsExist(cms, `<div cms-bloc=\"w13c-reserved-example\" data-id="header"></div>`),
        ).rejects.toThrow();
        expect(blocCalls).toBe(2);
    });

    test("enforces named slot accepts and cardinality", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-card",
                    root: { accepts: ["div"] },
                    slots: {
                        title: { accepts: [{ kind: "native-content", profile: "inline" }], min: 1, max: 1 },
                        actions: { accepts: [{ kind: "any-component" }], max: 1 },
                    },
                },
                { id: "fixture-action", root: { accepts: ["div"] }, slots: {} },
                {
                    id: "fixture-composition",
                    root: { accepts: ["div"] },
                    kind: "composition" as const,
                    markupHTML: '<div cms-bloc="fixture-action"></div>',
                    slots: {},
                },
            ],
        };
        await assertFixtureContentRefsExist(
            cms,
            '<div cms-bloc=\"fixture-card\"><h2 slot="title">Title</h2><div cms-bloc=\"fixture-action\" slot="actions"></div></div>',
        );
        await expect(
            assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-card\"><p slot="missing">Text</p></div>'),
        ).rejects.toThrow("does not declare slot");
        await expect(
            assertFixtureContentRefsExist(
                cms,
                '<div cms-bloc=\"fixture-card\"><div cms-bloc=\"fixture-action\" slot="title"></div></div>',
            ),
        ).rejects.toThrow("does not accept Bloc");
        await expect(
            assertFixtureContentRefsExist(
                cms,
                '<div cms-bloc=\"fixture-card\"><div cms-bloc=\"fixture-composition\" slot="actions"></div></div>',
            ),
        ).rejects.toThrow("does not accept Bloc");
        await expect(assertFixtureContentRefsExist(cms, '<div cms-bloc="fixture-card"></div>')).rejects.toThrow(
            "requires at least 1 item",
        );
    });

    test("enforces the expanded Page heading outline without requiring an h1", async () => {
        const heading = {
            id: "fixture-heading",
            root: { accepts: ["h1", "h2", "h3", "h4", "h5", "h6"] },
            slots: { "": { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1 } },
        };
        const stack = {
            id: "fixture-stack",
            root: { accepts: ["div"] },
            slots: { items: { accepts: [{ kind: "component" as const, tag: "fixture-heading" }] } },
        };
        const cms: any = { getBlocsList: async () => [heading, stack] };

        await assertFixtureContentRefsExist(
            cms,
            '<div cms-bloc="fixture-stack"><h2 cms-bloc="fixture-heading" slot="items">Section</h2><h3 cms-bloc="fixture-heading" slot="items">Detail</h3></div>',
        );
        await expect(
            assertFixtureContentRefsExist(
                cms,
                '<div cms-bloc="fixture-stack"><h1 cms-bloc="fixture-heading" slot="items">One</h1><h1 cms-bloc="fixture-heading" slot="items">Two</h1></div>',
            ),
        ).rejects.toThrow("at most one h1");
        await expect(
            assertFixtureContentRefsExist(
                cms,
                '<div cms-bloc="fixture-stack"><h2 cms-bloc="fixture-heading" slot="items">Section</h2><h4 cms-bloc="fixture-heading" slot="items">Skipped</h4></div>',
            ),
        ).rejects.toThrow("skips from h2 to h4");
    });

    test("checks heading hierarchy introduced by a composition", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-heading",
                    root: { accepts: ["h2", "h4"] },
                    slots: { "": { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1 } },
                },
                {
                    id: "fixture-outline",
                    root: { accepts: ["div"] },
                    slots: {},
                    kind: "composition" as const,
                    markupHTML:
                        '<h2 cms-bloc="fixture-heading">Section</h2><h4 cms-bloc="fixture-heading">Skipped</h4>',
                },
            ],
        };

        await expect(assertFixtureContentRefsExist(cms, '<div cms-bloc="fixture-outline"></div>')).rejects.toThrow(
            "skips from h2 to h4",
        );
    });

    test("rejects undeclared Bloc host attributes and root slot targets", async () => {
        const cms = makeSystem({ blocs: ["fixture-card"] });
        await expect(
            assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-card\" mystery="value"></div>'),
        ).rejects.toThrow("neither a declared setting");
        await expect(
            assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-card\" slot="ghost"></div>'),
        ).rejects.toThrow("cannot target a slot");
    });

    test("accepts only declared settings on Bloc hosts", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-card",
                    root: { accepts: ["div"] },
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
        await assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-card\" tone="loud"></div>');
        await expect(
            assertFixtureContentRefsExist(cms, '<div cms-bloc=\"fixture-card\" tone="too-long"></div>'),
        ).rejects.toThrow("settings are invalid");
    });

    test("validates dynamic Bloc attributes against declared setting types", async () => {
        const cms: any = {
            getBlocsList: async () => [
                {
                    id: "fixture-card",
                    root: { accepts: ["div"] },
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

        await assertFixtureContentRefsExist(
            cms,
            '<div cms-bloc=\"fixture-card\" expanded="{{ item.open }}" tone="{{ item.tone }}" count="{{ item.count }}"></div>',
        );
        await assertFixtureContentRefsExist(
            cms,
            '<div cms-bloc="fixture-card" expanded="{{ item.state === \'open\' }}"></div>',
        );
        for (const content of [
            '<div cms-bloc=\"fixture-card\" expanded="prefix {{ item.open }}"></div>',
            '<div cms-bloc=\"fixture-card\" expanded="{{ item.open | string }}"></div>',
            '<div cms-bloc=\"fixture-card\" count="{{ item.open === true }}"></div>',
            '<div cms-bloc=\"fixture-card\" tone="{{ item.open === true }}"></div>',
            '<div cms-bloc=\"fixture-card\" mystery="{{ item.value }}"></div>',
        ]) {
            await expect(assertFixtureContentRefsExist(cms, content)).rejects.toThrow();
        }
    });
});
