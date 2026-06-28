import { describe, expect, test } from "bun:test";
import { deref } from "@bernouy/cms-sources";
import type { ParsedSpec } from "@bernouy/cms-sources";

const SPEC = (over: Partial<ParsedSpec["components"]["schemas"]> = {}): ParsedSpec => ({
    info: { title: "T", version: "1" },
    paths: {},
    servers: [],
    components: {
        schemas: {
            User:    { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
            Address: { type: "object", properties: { city: { type: "string" } } },
            UserWithAddress: {
                type: "object",
                properties: {
                    id:      { type: "string" },
                    address: { $ref: "#/components/schemas/Address" },
                },
            },
            // Cycle: Node references itself via children
            Node:    { type: "object", properties: { id: { type: "string" }, child: { $ref: "#/components/schemas/Node" } } },
            ...over,
        },
    },
});

describe("deref", () => {
    test("returns the schema unchanged when there is no $ref", () => {
        const spec = SPEC();
        const s = { type: "object", properties: { x: { type: "string" } } } as const;
        expect(deref(s, spec)).toEqual(s);
    });

    test("resolves a single-level $ref", () => {
        const spec = SPEC();
        const out = deref({ $ref: "#/components/schemas/User" }, spec);
        expect(out.type).toBe("object");
        expect(out.properties?.id?.type).toBe("string");
    });

    test("recurses into nested properties with refs", () => {
        const spec = SPEC();
        const out = deref({ $ref: "#/components/schemas/UserWithAddress" }, spec);
        expect(out.properties?.address?.type).toBe("object");
        expect(out.properties?.address?.properties?.city?.type).toBe("string");
    });

    test("recurses into array items", () => {
        const spec = SPEC();
        const out = deref(
            { type: "array", items: { $ref: "#/components/schemas/User" } },
            spec,
        );
        expect(out.items?.type).toBe("object");
        expect(out.items?.properties?.id?.type).toBe("string");
    });

    test("recurses into allOf / anyOf / oneOf", () => {
        const spec = SPEC();
        const out = deref(
            { allOf: [{ $ref: "#/components/schemas/User" }, { type: "object", properties: { extra: { type: "string" } } }] },
            spec,
        );
        expect(out.allOf?.[0]?.type).toBe("object");
        expect(out.allOf?.[0]?.properties?.id?.type).toBe("string");
        expect(out.allOf?.[1]?.properties?.extra?.type).toBe("string");
    });

    test("preserves unresolved $ref on cycle", () => {
        const spec = SPEC();
        const out = deref({ $ref: "#/components/schemas/Node" }, spec);
        // First level: resolved into the object
        expect(out.type).toBe("object");
        // The recursive child is left as $ref because it'd cycle
        expect(out.properties?.child?.$ref).toBe("#/components/schemas/Node");
    });

    test("returns input when ref is unresolvable", () => {
        const spec = SPEC();
        const input = { $ref: "#/components/schemas/Missing" };
        expect(deref(input, spec)).toEqual(input);
    });

    test("respects depth cap on long chains", () => {
        const schemas: Record<string, any> = {};
        for (let i = 0; i < 20; i++) {
            schemas[`S${i}`] = { type: "object", properties: { next: { $ref: `#/components/schemas/S${i + 1}` } } };
        }
        schemas.S20 = { type: "object", properties: { leaf: { type: "string" } } };
        const spec = SPEC(schemas);
        const out = deref({ $ref: "#/components/schemas/S0" }, spec);
        // Doesn't throw, returns something — exact depth boundary tested by walking
        expect(out.type).toBe("object");
    });
});
