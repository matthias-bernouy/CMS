import { describe, expect, test } from "bun:test";
import { resolveRef } from "cms-control/core/data/resolveRef";
import type { ParsedSpec } from "cms-control/core/data/types";

const SPEC: ParsedSpec = {
    info: { title: "T", version: "1" },
    paths: {
        "/users": { get: { summary: "list" } },
    },
    servers: [],
    components: {
        schemas: {
            User:    { type: "object", properties: { id: { type: "string" } } },
            "weird/key": { type: "string" },     // contains slash → escaped as ~1
            "tilde~key":  { type: "boolean" },   // contains tilde → escaped as ~0
        },
    },
};

describe("resolveRef", () => {
    test("resolves a simple component ref", () => {
        const r = resolveRef("#/components/schemas/User", SPEC);
        expect(r).toEqual(SPEC.components.schemas.User);
    });

    test("returns the root for #/", () => {
        expect(resolveRef("#/", SPEC)).toBe(SPEC);
    });

    test("walks deeply into the structure", () => {
        const r = resolveRef("#/components/schemas/User/properties/id/type", SPEC);
        expect(r).toBe("string");
    });

    test("returns null for external refs", () => {
        expect(resolveRef("http://example.com/spec.json", SPEC)).toBe(null);
        expect(resolveRef("./other.json#/foo", SPEC)).toBe(null);
    });

    test("returns null for missing path", () => {
        expect(resolveRef("#/components/schemas/Missing", SPEC)).toBe(null);
        expect(resolveRef("#/foo/bar", SPEC)).toBe(null);
    });

    test("decodes ~1 as / in token", () => {
        const r = resolveRef("#/components/schemas/weird~1key", SPEC);
        expect(r).toEqual({ type: "string" });
    });

    test("decodes ~0 as ~ in token", () => {
        const r = resolveRef("#/components/schemas/tilde~0key", SPEC);
        expect(r).toEqual({ type: "boolean" });
    });

    test("returns null for non-string input", () => {
        // @ts-expect-error — intentional misuse
        expect(resolveRef(undefined, SPEC)).toBe(null);
        // @ts-expect-error — intentional misuse
        expect(resolveRef(42, SPEC)).toBe(null);
    });

    test("returns null when ref doesn't start with #/", () => {
        expect(resolveRef("components/schemas/User", SPEC)).toBe(null);
        expect(resolveRef("#components/schemas/User", SPEC)).toBe(null);
    });
});
