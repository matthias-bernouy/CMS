import { describe, expect, test } from "bun:test";
import { SpecResolver } from "@bernouy/cms-sources";
import type { ParsedSpec } from "@bernouy/cms-sources";

const SPEC: ParsedSpec = {
    info: { title: "Hub", version: "1" },
    servers: [],
    paths: {
        "/users": {
            get: {
                summary: "List users",
                tags:    ["Users"],
                responses: {
                    "200": {
                        content: {
                            "application/json": {
                                schema: {
                                    type:  "array",
                                    items: { $ref: "#/components/schemas/User" },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: "Create user",
                tags:    ["Users", "Admin"],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": { schema: { $ref: "#/components/schemas/User" } },
                    },
                },
                responses: {
                    "201": {
                        content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
                    },
                },
            },
        },
        "/users/{id}": {
            parameters: [
                { name: "id", in: "path", required: true, schema: { type: "string" } },
            ],
            get: {
                summary: "Get user",
                tags:    ["Users"],
                parameters: [
                    { name: "include", in: "query", schema: { type: "string" } },
                ],
                responses: {
                    "200": {
                        content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            User: {
                type: "object",
                properties: {
                    id:        { type: "string" },
                    firstname: { type: "string" },
                    age:       { type: "integer" },
                },
            },
        },
    },
};

describe("SpecResolver", () => {
    test("listEndpoints enumerates every (method, path) pair", () => {
        const r  = new SpecResolver(SPEC);
        const ids = r.listEndpoints().map(e => e.id).sort();
        expect(ids).toEqual(["GET /users", "GET /users/{id}", "POST /users"]);
    });

    test("listEndpoints returns slim shape with summary + tags", () => {
        const r = new SpecResolver(SPEC);
        const get = r.listEndpoints().find(e => e.id === "GET /users")!;
        expect(get).toEqual({
            id: "GET /users", method: "GET", path: "/users", summary: "List users", tags: ["Users"],
        });
    });

    test("getEndpoint returns full detail with merged params", () => {
        const r = new SpecResolver(SPEC);
        const ep = r.getEndpoint("GET /users/{id}");
        expect(ep).not.toBeNull();
        expect(ep!.pathParams.map(p => p.name)).toEqual(["id"]);
        expect(ep!.pathParams[0]?.required).toBe(true);
        expect(ep!.queryParams.map(p => p.name)).toEqual(["include"]);
        expect(ep!.responseSchema?.type).toBe("object");
        expect(ep!.responseSchema?.properties?.firstname?.type).toBe("string");
    });

    test("getEndpoint returns null for unknown id", () => {
        const r = new SpecResolver(SPEC);
        expect(r.getEndpoint("DELETE /users")).toBeNull();
        expect(r.getEndpoint("nope")).toBeNull();
    });

    test("getEndpoint resolves $refs in requestBody", () => {
        const r = new SpecResolver(SPEC);
        const ep = r.getEndpoint("POST /users");
        expect(ep!.requestBody?.required).toBe(true);
        expect(ep!.requestBody?.contentType).toBe("application/json");
        expect(ep!.requestBody?.schema?.properties?.id?.type).toBe("string");
    });

    test("getResponseSchema resolves $refs in responses", () => {
        const r = new SpecResolver(SPEC);
        const schema = r.getResponseSchema("GET /users");
        // /users returns array<User>, items deref'd
        expect(schema?.type).toBe("array");
        expect(schema?.items?.properties?.firstname?.type).toBe("string");
    });

    test("getResponseSchema falls back to default + 2xx", () => {
        // POST /users only declares 201
        const r = new SpecResolver(SPEC);
        const schema = r.getResponseSchema("POST /users", "200"); // not declared
        // Falls back to 201
        expect(schema?.type).toBe("object");
        expect(schema?.properties?.id?.type).toBe("string");
    });

    test("getResponseFields flattens to dotted paths", () => {
        const r = new SpecResolver(SPEC);
        const fields = r.getResponseFields("GET /users/{id}");
        expect(fields.sort()).toEqual(["age", "firstname", "id"]);
    });

    test("search matches path, summary, and tags case-insensitively", () => {
        const r = new SpecResolver(SPEC);
        expect(r.search("user").map(e => e.id).sort()).toEqual(["GET /users", "GET /users/{id}", "POST /users"]);
        expect(r.search("create").map(e => e.id)).toEqual(["POST /users"]);
        expect(r.search("Admin").map(e => e.id)).toEqual(["POST /users"]);
        expect(r.search("missing")).toEqual([]);
    });

    test("search returns empty for empty query (no garbage list)", () => {
        const r = new SpecResolver(SPEC);
        expect(r.search("")).toEqual([]);
        expect(r.search("   ")).toEqual([]);
    });
});
