import { describe, expect, test } from "bun:test";
import { DEFAULT_COLLECTION_LIMITS as limits } from "../../src/collections/core/limits";
import { parseBlocs } from "../../src/collections/core/parsing/blocs/parseBlocs";
import { checkDemoBlocs as check, demoComponent as component, demoComposition as composition } from "./fixtures";

describe("collection bloc admission", () => {
    test("accepts component and composition variants with normalized declarations", () => {
        const blocs = check(
            [composition(), component({ thumbnail: "preview", category: "Content", order: 20 })],
            new Set(["preview"]),
        );
        expect(blocs.map((bloc) => bloc.id)).toEqual(["demo-card", "demo-page"]);
        expect(blocs[0]?.uses).toEqual([]);
        expect(blocs[0]).toMatchObject({ category: "Content", order: 20 });
        expect(() => check([component({ order: -1 })])).toThrow("integer");
    });

    test("requires platform-safe namespaced custom-element tags", () => {
        expect(() => parseBlocs([component({ id: "demo.widgets-card" })], "demo", limits)).toThrow("custom-element");
        expect(() => parseBlocs([component({ id: "font-face" })], "font", limits)).toThrow("custom-element");
        expect(() => parseBlocs([component({ id: "cms-card" })], "cms", limits)).toThrow("reserved");
        expect(() => parseBlocs([component({ id: "demo-card" })], "other", limits)).toThrow(
            "other- collection namespace",
        );
    });

    test.each(["settings", "style", "shadowdom", "behaviour", "behaviourJS", "nativeElement"])(
        "refuses composition %s",
        (key) => {
            expect(() => check([composition({ [key]: {} })])).toThrow("unknown property");
        },
    );

    test("admits bounded polymorphic native-element contracts", () => {
        const nativeElement = { accepts: ["button", "a"] };
        const parsed = check([
            component({
                nativeElement,
                shadowdom: "<span><slot></slot></span>",
                slots: {},
                defaultContent: '<button type="button">Action</button>',
            }),
        ])[0];
        expect(parsed?.kind === "component" ? parsed.nativeElement : undefined).toEqual(nativeElement);
        expect(() => check([component({ nativeElement: "button" })])).toThrow("object");
        expect(() => check([component({ nativeElement: { accepts: [] } })])).toThrow("at least one");
        expect(() => check([component({ nativeElement: { accepts: ["a", "a"] } })])).toThrow("duplicate");
        expect(() => check([component({ nativeElement: { accepts: ["div"] } })])).toThrow("must be one of");
        expect(() =>
            check([
                component({
                    nativeElement: { accepts: ["button"] },
                    shadowdom: "<slot></slot>",
                    slots: {},
                    defaultContent: '<button type="button"></button>',
                }),
            ]),
        ).toThrow("requires text content or a non-empty aria-label");
        expect(() =>
            check([
                component({
                    nativeElement: { accepts: ["button"] },
                    shadowdom: "<slot></slot>",
                    slots: {},
                    defaultContent: '<button type="button" aria-label="Save"></button>',
                }),
            ]),
        ).not.toThrow();
        const checkbox = {
            accepts: ["input"],
            attributes: { type: { required: true, values: ["checkbox"] } },
        };
        expect(
            check([
                component({
                    nativeElement: checkbox,
                    shadowdom: "<slot></slot>",
                    slots: {},
                    defaultContent: '<input type="checkbox">',
                }),
            ])[0],
        ).toMatchObject({ nativeElement: checkbox });
        expect(() =>
            check([
                component({
                    nativeElement: checkbox,
                    shadowdom: "<slot></slot>",
                    slots: {},
                    defaultContent: '<input type="radio">',
                }),
            ]),
        ).toThrow("native attribute");
        expect(() =>
            check([
                component({
                    nativeElement,
                    shadowdom: "<slot></slot>",
                    lightdom: "<a>Fixed</a>",
                    slots: {},
                    defaultContent: "<a>Action</a>",
                }),
            ]),
        ).toThrow("cannot declare fixed lightdom");
    });

    test.each(["uses", "requires", "slots"])("does not normalize explicit null %s into omission", (key) => {
        expect(() => check([component({ [key]: null })])).toThrow();
    });

    test("enforces IDs, booleans, finite lists and markup bounds", () => {
        expect(() => check([component({ id: "foreign-card" })])).toThrow("collection namespace");
        expect(() => check([component({ internal: "true" })])).toThrow("boolean");
        expect(() => parseBlocs([component(), component()], "demo", { ...limits, maxBlocs: 1 })).toThrow("at most 1");
        expect(() => parseBlocs([component()], "demo", { ...limits, maxMarkupLength: 2 })).toThrow("at most 2");
    });

    test("checks duplicates, local references, thumbnails and cycles", () => {
        expect(() => check([component(), component()])).toThrow("duplicate");
        expect(() => check([component({ uses: ["demo-other", "demo-other"] })])).toThrow("duplicate");
        expect(() => check([component({ uses: ["demo-other"] })])).toThrow("neither local nor imported");
        expect(() => check([component({ thumbnail: "missing" })])).toThrow("thumbnail");
        expect(() => check([component({ uses: ["demo-page"] }), composition({ uses: ["demo-card"] })])).toThrow(
            "cyclic",
        );
    });

    test("checks accepted blocs and slot cardinality", () => {
        expect(() =>
            check([component({ slots: { body: { accepts: [{ kind: "component", tag: "demo-other" }] } } })]),
        ).toThrow("neither local nor imported");
        expect(() => check([component({ slots: { body: { min: 2, max: 1 } } })])).toThrow("min must not exceed max");
        expect(() => check([component({ slots: { body: { min: -1 } } })])).toThrow("integer");
    });

    test("validates grouped setting items and their defaults", () => {
        const tone = {
            id: "tone",
            label: "Tone",
            group: "Appearance",
            type: "string",
            control: {
                kind: "select",
                options: [
                    { value: "quiet", label: "Quiet" },
                    { value: "accent", label: "Accent" },
                ],
            },
            maxLength: 16,
            default: "quiet",
        };
        const compact = {
            id: "compact",
            label: "Compact",
            group: "Layout",
            type: "boolean",
            default: false,
            control: { kind: "toggle" },
        };
        const parsed = check([component({ settings: [tone, compact] })])[0];
        expect(parsed?.kind === "component" ? parsed.settings : undefined).toEqual([tone, compact]);
        const inferred = check([component({ settings: [{ ...tone, maxLength: undefined }] })])[0];
        expect(inferred?.kind === "component" ? inferred.settings?.[0]?.maxLength : undefined).toBe(6);
        const hyphenated = { ...compact, id: "full-width" };
        const parsedHyphenated = check([component({ settings: [hyphenated] })])[0];
        expect(parsedHyphenated?.kind === "component" ? parsedHyphenated.settings : undefined).toEqual([hyphenated]);
        expect(() => check([component({ settings: [tone, tone] })])).toThrow("duplicate");
        expect(() => check([component({ settings: [{ ...tone, id: "Tone" }] })])).toThrow("safe, lowercase");
        expect(() => check([component({ settings: [{ ...tone, default: "invalid" }] })])).toThrow("invalid defaults");
        expect(() => check([component({ settings: [{ ...tone, default: "quietly-too-long" }] })])).toThrow();
        expect(() => check([component({ settings: [{ ...tone, type: "object" }] })])).toThrow(
            "string, boolean, number and integer",
        );
        expect(() => check([component({ settings: [{ ...tone, id: "onclick" }] })])).toThrow("safe, lowercase");
        expect(() => check([component({ settings: [{ ...compact, maxLength: 10 }] })])).toThrow("boolean settings");
        expect(() => check([component({ settings: [{ id: "missing", label: "Missing", type: "boolean" }] })])).toThrow(
            "default value",
        );
    });

    test("validates item visibility against finite settings", () => {
        const mode = {
            id: "mode",
            label: "Mode",
            group: "Appearance",
            type: "string",
            control: {
                kind: "select",
                options: [
                    { value: "quiet", label: "Quiet" },
                    { value: "accent", label: "Accent" },
                ],
            },
            default: "quiet",
        };
        const compact = {
            id: "compact",
            label: "Compact",
            group: "Layout",
            type: "boolean",
            default: false,
            visibleWhen: { setting: "mode", equals: "accent" },
        };
        const parsed = check([component({ settings: [mode, compact] })])[0];
        expect(parsed?.kind === "component" ? parsed.settings?.[1]?.visibleWhen : undefined).toEqual([
            { setting: "mode", equals: "accent" },
        ]);
        const detail = {
            id: "detail",
            label: "Detail",
            type: "string",
            default: "text",
            visibleWhen: [
                { setting: "compact", equals: true },
                { setting: "mode", notEquals: "quiet" },
            ],
        };
        const withBoolean = check([component({ settings: [mode, compact, detail] })])[0];
        expect(withBoolean?.kind === "component" ? withBoolean.settings?.[2]?.visibleWhen : undefined).toEqual(
            detail.visibleWhen,
        );
        expect(() =>
            check([component({ settings: [mode, { ...compact, visibleWhen: { setting: "missing", equals: true } }] })]),
        ).toThrow("unknown setting");
        expect(() =>
            check([component({ settings: [mode, { ...compact, visibleWhen: { setting: "compact", equals: true } }] })]),
        ).toThrow("own visibility");
        expect(() =>
            check([component({ settings: [mode, { ...compact, visibleWhen: { setting: "mode", equals: "other" } }] })]),
        ).toThrow("declared option");
        expect(() =>
            check([component({ settings: [mode, { ...compact, visibleWhen: { setting: "mode", equals: true } }] })]),
        ).toThrow("declared option");
        expect(() =>
            check([
                component({
                    settings: [mode, compact, { ...detail, visibleWhen: { setting: "compact", equals: "true" } }],
                }),
            ]),
        ).toThrow("true or false");
        expect(() =>
            check([component({ settings: [{ ...mode, visibleWhen: { setting: "compact", equals: true } }, compact] })]),
        ).toThrow("cyclic");
        expect(() => check([component({ settings: [{ ...mode, control: { kind: "text" } }, compact] })])).toThrow(
            "enumerated setting",
        );
    });

    test("admits bounded numeric settings and their authoring controls", () => {
        const columns = {
            id: "columns",
            label: "Columns",
            type: "integer",
            default: 3,
            minimum: 1,
            maximum: 6,
            control: { kind: "range", step: 1, suffix: "columns" },
        };
        const opacity = {
            id: "opacity",
            label: "Opacity",
            type: "number",
            default: 0.5,
            minimum: 0,
            maximum: 1,
            control: { kind: "number", step: 0.1 },
        };
        const parsed = check([component({ settings: [columns, opacity] })])[0];
        expect(parsed?.kind === "component" ? parsed.settings : undefined).toEqual([columns, opacity]);
        expect(() => check([component({ settings: [{ ...columns, default: 7 }] })])).toThrow("invalid defaults");
        expect(() => check([component({ settings: [{ ...columns, default: 1.5 }] })])).toThrow("safe integer");
        expect(() => check([component({ settings: [{ ...columns, minimum: 8 }] })])).toThrow();
        expect(() => check([component({ settings: [{ ...columns, control: { kind: "range", step: 0.5 } }] })])).toThrow(
            "safe integers",
        );
        expect(() => check([component({ settings: [{ ...columns, control: { kind: "text" } }] })])).toThrow(
            "number or range",
        );
        expect(() =>
            check([component({ settings: [{ ...opacity, maximum: undefined, control: { kind: "range" } }] })]),
        ).toThrow("require minimum and maximum");
    });

    test("admits focused string controls and editorial slot acceptance", () => {
        const parsed = check([
            component({
                slots: {
                    body: {
                        accepts: [
                            { kind: "any-component" },
                            { kind: "plain-text" },
                            { kind: "rich-text", profile: "prose" },
                        ],
                    },
                },
                settings: [
                    {
                        id: "summary",
                        label: "Summary",
                        help: "Shown below the title.",
                        type: "string",
                        default: "",
                        maxLength: 500,
                        control: { kind: "text", placeholder: "Short summary" },
                    },
                    {
                        id: "destination",
                        label: "Destination",
                        type: "string",
                        default: "/",
                        maxLength: 512,
                        control: { kind: "page-link", allowPage: true, allowExternal: true },
                    },
                    {
                        id: "image",
                        label: "Image",
                        type: "string",
                        default: "",
                        control: { kind: "media-picker", accept: ["image", "svg"] },
                    },
                    {
                        id: "background",
                        label: "Background",
                        type: "string",
                        default: "",
                        control: { kind: "theme-token-picker", accept: ["color"] },
                    },
                ],
            }),
        ])[0];
        expect(parsed?.slots.body?.accepts).toHaveLength(3);
        expect(() =>
            check([
                component({
                    slots: { body: { accepts: [{ kind: "media", accept: ["image"] }] as never } },
                }),
            ]),
        ).toThrow("slot acceptance kind must be component, any-component, plain-text or rich-text");
        expect(parsed?.kind === "component" ? parsed.settings?.map(({ control }) => control.kind) : undefined).toEqual([
            "text",
            "page-link",
            "media-picker",
            "theme-token-picker",
        ]);
        expect(() =>
            check([
                component({
                    slots: { body: { accepts: [{ kind: "rich-text", profile: "arbitrary" }] } },
                }),
            ]),
        ).toThrow("inline, prose");
        for (const kind of ["textarea", "endpoint-picker"]) {
            expect(() =>
                check([
                    component({
                        settings: [{ id: "legacy", label: "Legacy", type: "string", default: "", control: { kind } }],
                    }),
                ]),
            ).toThrow("unsupported string setting control");
        }
    });
});
