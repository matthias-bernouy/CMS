import { describe, expect, test } from "bun:test";
import { parseSpec } from "@bernouy/cms-gateway";
import { SpecParseError } from "@bernouy/cms-gateway";

const minimal = (over: Record<string, unknown> = {}) => JSON.stringify({
    openapi: "3.0.0",
    info:    { title: "Hub", version: "1.0.0" },
    paths:   {},
    ...over,
});

describe("parseSpec", () => {
    test("parses a minimal valid 3.0 spec", () => {
        const parsed = parseSpec(minimal());
        expect(parsed.info.title).toBe("Hub");
        expect(parsed.info.version).toBe("1.0.0");
        expect(parsed.paths).toEqual({});
        expect(parsed.components.schemas).toEqual({});
    });

    test("accepts 3.1 specs", () => {
        const parsed = parseSpec(minimal({ openapi: "3.1.0" }));
        expect(parsed.info.title).toBe("Hub");
    });

    test("preserves paths and components.schemas", () => {
        const raw = JSON.stringify({
            openapi: "3.0.0",
            paths: {
                "/users": { get: { summary: "list", tags: ["Users"] } },
            },
            components: { schemas: { User: { type: "object" } } },
        });
        const parsed = parseSpec(raw);
        expect(parsed.paths["/users"]?.get?.summary).toBe("list");
        expect(parsed.components.schemas.User?.type).toBe("object");
    });

    test("defaults info fields when missing", () => {
        const parsed = parseSpec(JSON.stringify({ openapi: "3.0.0", paths: {} }));
        expect(parsed.info.title).toBe("");
        expect(parsed.info.version).toBe("");
    });

    test("throws on empty input", () => {
        expect(() => parseSpec("")).toThrow(SpecParseError);
    });

    test("throws on invalid JSON", () => {
        expect(() => parseSpec("not json")).toThrow(/Invalid JSON/);
    });

    test("throws when root is not an object", () => {
        expect(() => parseSpec("[]")).toThrow(/root must be an object/);
        expect(() => parseSpec('"hi"')).toThrow(/root must be an object/);
    });

    test("throws when openapi version is missing", () => {
        expect(() => parseSpec(JSON.stringify({ paths: {} }))).toThrow(/Missing 'openapi'/);
    });

    test("throws on unsupported version", () => {
        expect(() => parseSpec(JSON.stringify({ openapi: "4.0.0", paths: {} })))
            .toThrow(/Unsupported OpenAPI version/);
    });

    test("accepts Swagger 2.0 by normalising it to 3.x", () => {
        const raw = JSON.stringify({
            swagger: "2.0",
            info: { title: "Old", version: "1" },
            paths: {
                "/x": { get: { responses: { 200: { schema: { $ref: "#/definitions/X" } } } } },
            },
            definitions: { X: { type: "object", properties: { id: { type: "string" } } } },
        });
        const parsed = parseSpec(raw);
        expect(parsed.info.title).toBe("Old");
        expect(parsed.components.schemas.X?.type).toBe("object");
        // Response schema is wrapped + ref rewritten
        const ref = (parsed.paths["/x"]?.get as any)?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
        expect(ref).toBe("#/components/schemas/X");
    });

    test("throws when paths is missing or invalid", () => {
        expect(() => parseSpec(JSON.stringify({ openapi: "3.0.0" }))).toThrow(/Missing or invalid 'paths'/);
        expect(() => parseSpec(JSON.stringify({ openapi: "3.0.0", paths: "nope" }))).toThrow(/Missing or invalid 'paths'/);
        expect(() => parseSpec(JSON.stringify({ openapi: "3.0.0", paths: [] }))).toThrow(/Missing or invalid 'paths'/);
    });

    test("ignores invalid components shape silently (returns empty schemas)", () => {
        const parsed = parseSpec(JSON.stringify({ openapi: "3.0.0", paths: {}, components: "broken" }));
        expect(parsed.components.schemas).toEqual({});
    });

    test("preserves OpenAPI 3.x servers", () => {
        const parsed = parseSpec(JSON.stringify({
            openapi: "3.0.0",
            paths:   {},
            servers: [{ url: "https://api.example.com/v1" }, { url: "https://staging.example.com" }],
        }));
        expect(parsed.servers).toEqual([
            { url: "https://api.example.com/v1" },
            { url: "https://staging.example.com" },
        ]);
    });

    test("derives servers from Swagger 2.0 host info", () => {
        const parsed = parseSpec(JSON.stringify({
            swagger:  "2.0",
            schemes:  ["https"],
            host:     "api.example.com",
            basePath: "/v2",
            paths:    {},
        }));
        expect(parsed.servers).toEqual([{ url: "https://api.example.com/v2" }]);
    });

    test("returns empty servers when none declared", () => {
        const parsed = parseSpec(JSON.stringify({ openapi: "3.0.0", paths: {} }));
        expect(parsed.servers).toEqual([]);
    });

    test("filters malformed servers entries", () => {
        const parsed = parseSpec(JSON.stringify({
            openapi: "3.0.0",
            paths:   {},
            servers: [{ url: "https://valid.example.com" }, { description: "no url" }, "string"],
        }));
        expect(parsed.servers).toEqual([{ url: "https://valid.example.com" }]);
    });
});
