import { describe, expect, test } from "bun:test";
import { DEFAULT_COLLECTION_LIMITS as limits } from "../../src/collections/core/limits";
import { parseBlocs } from "../../src/collections/core/parsing/blocs/parseBlocs";
import { checkDemoBlocs as check, demoComponent as component, demoComposition as composition } from "./fixtures";

describe("collection bloc admission", () => {
    test("accepts component and composition variants with normalized declarations", () => {
        const blocs = check([composition(), component({ thumbnail: "preview" })], new Set(["preview"]));
        expect(blocs.map((bloc) => bloc.id)).toEqual(["demo-card", "demo-page"]);
        expect(blocs[0]?.uses).toEqual([]);
        expect(parseBlocs([component({ id: "demo.widgets-card" })], "demo.widgets", limits)[0]?.id).toBe(
            "demo.widgets-card",
        );
    });

    test.each(["settings", "style", "shadowdom", "behaviour", "behaviourJS"])("refuses composition %s", (key) => {
        expect(() => check([composition({ [key]: {} })])).toThrow("unknown property");
    });

    test.each(["uses", "requires", "slots"])("does not normalize explicit null %s into omission", (key) => {
        expect(() => check([component({ [key]: null })])).toThrow();
    });

    test("enforces IDs, booleans, finite lists and markup bounds", () => {
        expect(() => check([component({ id: "foreign-card" })])).toThrow("prefixed");
        expect(() => check([component({ internal: "true" })])).toThrow("boolean");
        expect(() => parseBlocs([component(), component()], "demo", { ...limits, maxBlocs: 1 })).toThrow("at most 1");
        expect(() => parseBlocs([component()], "demo", { ...limits, maxMarkupLength: 2 })).toThrow("at most 2");
    });

    test("checks duplicates, local references, thumbnails and cycles", () => {
        expect(() => check([component(), component()])).toThrow("duplicate");
        expect(() => check([component({ uses: ["demo-other", "demo-other"] })])).toThrow("duplicate");
        expect(() => check([component({ uses: ["demo-other"] })])).toThrow("unknown local bloc");
        expect(() => check([component({ thumbnail: "missing" })])).toThrow("thumbnail");
        expect(() => check([component({ uses: ["demo-page"] }), composition({ uses: ["demo-card"] })])).toThrow(
            "cyclic",
        );
    });

    test("checks accepted blocs and slot cardinality", () => {
        expect(() =>
            check([component({ slots: { body: { accepts: [{ kind: "component", tag: "demo-other" }] } } })]),
        ).toThrow("unknown accepted bloc");
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
        expect(() => check([component({ settings: [tone, tone] })])).toThrow("duplicate");
        expect(() => check([component({ settings: [{ ...tone, id: "Tone" }] })])).toThrow("safe, lowercase");
        expect(() => check([component({ settings: [{ ...tone, default: "invalid" }] })])).toThrow("invalid defaults");
        expect(() => check([component({ settings: [{ ...tone, default: "quietly-too-long" }] })])).toThrow();
        expect(() => check([component({ settings: [{ ...tone, type: "integer" }] })])).toThrow("string and boolean");
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

    test("admits declarative controls and rich slot acceptance", () => {
        const parsed = check([
            component({
                slots: {
                    body: {
                        accepts: [{ kind: "any-component" }, { kind: "media", accept: ["image", "svg"] }],
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
                        control: { kind: "textarea", placeholder: "Short summary", rows: 4 },
                    },
                    {
                        id: "destination",
                        label: "Destination",
                        type: "string",
                        default: "/",
                        maxLength: 512,
                        control: { kind: "page-link", allowPage: true, allowExternal: true },
                    },
                ],
            }),
        ])[0];
        expect(parsed?.slots.body?.accepts).toHaveLength(2);
        expect(parsed?.kind === "component" ? parsed.settings?.[0]?.control.kind : undefined).toBe("textarea");
    });
});
