import { describe, expect, test } from "bun:test";
import { swagger2to3 } from "@bernouy/cms-sources";

describe("swagger2to3", () => {
    test("moves definitions into components.schemas", () => {
        const out = swagger2to3({
            swagger: "2.0",
            definitions: {
                User: { type: "object", properties: { id: { type: "string" } } },
            },
            paths: {},
        });
        expect((out.components as any).schemas.User.type).toBe("object");
    });

    test("rewrites refs from #/definitions/X to #/components/schemas/X", () => {
        const out = swagger2to3({
            swagger: "2.0",
            paths: {
                "/users": { get: { responses: { 200: { schema: { $ref: "#/definitions/User" } } } } },
            },
            definitions: { User: { type: "object" } },
        });
        const schema = (out.paths as any)["/users"].get.responses["200"].content["application/json"].schema;
        expect(schema.$ref).toBe("#/components/schemas/User");
    });

    test("wraps response schema in content[application/json]", () => {
        const out = swagger2to3({
            swagger: "2.0",
            paths: {
                "/x": { get: { responses: { 200: { schema: { type: "object" } } } } },
            },
        });
        const r200 = (out.paths as any)["/x"].get.responses["200"];
        expect(r200.content["application/json"].schema.type).toBe("object");
        expect(r200.schema).toBeUndefined();
    });

    test("moves body parameters to requestBody", () => {
        const out = swagger2to3({
            swagger: "2.0",
            paths: {
                "/pets": { post: { parameters: [
                    { name: "pet", in: "body", required: true, schema: { type: "object" } },
                    { name: "limit", in: "query", schema: { type: "integer" } },
                ] } },
            },
        });
        const op = (out.paths as any)["/pets"].post;
        expect(op.requestBody.content["application/json"].schema.type).toBe("object");
        expect(op.requestBody.required).toBe(true);
        expect(op.parameters).toEqual([{ name: "limit", in: "query", schema: { type: "integer" } }]);
    });

    test("inlines global parameter refs", () => {
        const out = swagger2to3({
            swagger: "2.0",
            paths: { "/items": { get: { parameters: [{ $ref: "#/parameters/limit" }] } } },
            parameters: { limit: { name: "limit", in: "query", type: "integer", required: false } },
        });
        expect((out.paths as any)["/items"].get.parameters).toEqual([
            { name: "limit", in: "query", required: false, schema: { type: "integer" } },
        ]);
    });

    test("inlines path-level global parameter refs", () => {
        const out = swagger2to3({
            swagger: "2.0",
            paths: { "/items/{id}": {
                parameters: [{ $ref: "#/parameters/id" }],
                get: { responses: { 204: { description: "ok" } } },
            } },
            parameters: { id: { name: "id", in: "path", type: "string", required: true } },
        });
        expect((out.paths as any)["/items/{id}"].parameters).toEqual([
            { name: "id", in: "path", required: true, schema: { type: "string" } },
        ]);
    });

    test("emits openapi 3.0.0 marker", () => {
        const out = swagger2to3({ swagger: "2.0", paths: {} });
        expect(out.openapi).toBe("3.0.0");
    });

    test("does not mutate the input", () => {
        const input = {
            swagger: "2.0",
            paths:   { "/x": { get: { responses: { 200: { schema: { $ref: "#/definitions/X" } } } } } },
            definitions: { X: { type: "object" } },
        };
        const before = JSON.stringify(input);
        swagger2to3(input);
        expect(JSON.stringify(input)).toBe(before);
    });

    test("handles missing definitions / paths gracefully", () => {
        const out = swagger2to3({ swagger: "2.0" });
        expect((out.components as any).schemas).toEqual({});
        expect(out.paths).toEqual({});
    });

    test("derives servers from schemes + host + basePath", () => {
        const out = swagger2to3({
            swagger:  "2.0",
            schemes:  ["https"],
            host:     "api.example.com",
            basePath: "/v1",
            paths:    {},
        });
        expect(out.servers).toEqual([{ url: "https://api.example.com/v1" }]);
    });

    test("defaults scheme to https when missing", () => {
        const out = swagger2to3({ swagger: "2.0", host: "api.example.com", paths: {} });
        expect(out.servers).toEqual([{ url: "https://api.example.com" }]);
    });

    test("returns empty servers when host is missing", () => {
        const out = swagger2to3({ swagger: "2.0", paths: {} });
        expect(out.servers).toEqual([]);
    });
});
