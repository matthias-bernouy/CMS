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
        expect(() => check([component({ slots: { body: { accepts: ["demo-other"] } } })])).toThrow(
            "unknown accepted bloc",
        );
        expect(() => check([component({ slots: { body: { min: 2, max: 1 } } })])).toThrow("min must not exceed max");
        expect(() => check([component({ slots: { body: { min: -1 } } })])).toThrow("integer");
    });

    test("validates bounded settings defaults and case-insensitive host names", () => {
        const settings = {
            schema: { type: "object", properties: { tone: { type: "string", maxLength: 16 } }, required: ["tone"] },
            defaults: { tone: "quiet" },
        };
        expect(() => check([component({ settings })])).not.toThrow();
        expect(() => check([component({ settings: { ...settings, defaults: {} } })])).toThrow("invalid defaults");
        const properties = { ...settings.schema.properties, Tone: { type: "string", maxLength: 16 } };
        expect(() =>
            check([component({ settings: { ...settings, schema: { ...settings.schema, properties } } })]),
        ).toThrow("differ only by case");
    });
});
