import { describe, expect, test } from "bun:test";
import { openApiSpecToProvider, SpecParseError, validateProvider } from "@bernouy/cms-gateway";

describe("openApiSpecToProvider", () => {
    test("imports an OpenAPI 3.x spec into a valid provider", () => {
        const provider = openApiSpecToProvider(JSON.stringify({
            openapi: "3.0.0",
            info: { title: "Shop API", version: "1.2.3" },
            servers: [{ url: "https://api.example.com/v1" }],
            paths: {
                "/users/{id}": { get: {
                    operationId: "getUser",
                    summary: "Get user",
                    description: "Load one user",
                    parameters: [
                        { name: "id", in: "path", required: true, schema: { type: "string" } },
                        { name: "expand", in: "query", schema: { type: "integer" } },
                        { name: "X-Trace-ID", in: "header", schema: { type: "string" } },
                    ],
                    responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
                } },
            },
            components: { schemas: {
                BaseUser: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
                User: { allOf: [
                    { $ref: "#/components/schemas/BaseUser" },
                    { type: "object", required: ["age"], properties: { age: { type: "integer" } } },
                ] },
            } },
        }), { providerId: "shop" });

        expect(validateProvider(provider)).toEqual([]);
        expect(provider.urn).toBe("urn:shop");
        expect(provider.meta).toEqual({ name: "Shop API", description: "Version 1.2.3" });
        expect(provider.endpoints[0]!.urn).toBe("urn:shop:get-user");
        expect(provider.endpoints[0]!.targetUrl).toBe("https://api.example.com/v1/users/{id}");
        expect(provider.endpoints[0]!.input?.params).toEqual([
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "expand", in: "query", required: false, schema: { type: "number" } },
            { name: "X-Trace-ID", in: "header", required: false, schema: { type: "string" } },
        ]);
        expect(provider.endpoints[0]!.output).toEqual([
            { status: "200", body: { type: "object", properties: { id: { type: "string" }, age: { type: "number" } }, required: ["id", "age"] } },
        ]);
    });

    test("imports Swagger 2.0 body params and response schemas", () => {
        const provider = openApiSpecToProvider(JSON.stringify({
            swagger: "2.0",
            info: { title: "Pets", version: "2" },
            schemes: ["https"],
            host: "pets.example.com",
            basePath: "/api",
            paths: { "/pets": { post: {
                operationId: "createPet",
                parameters: [{ name: "pet", in: "body", required: true, schema: { $ref: "#/definitions/Pet" } }],
                responses: { "201": { schema: { $ref: "#/definitions/Pet" } } },
            } } },
            definitions: { Pet: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
        }), { providerId: "pets" });

        const endpoint = provider.endpoints[0]!;
        expect(endpoint.urn).toBe("urn:pets:create-pet");
        expect(endpoint.targetUrl).toBe("https://pets.example.com/api/pets");
        expect(endpoint.input?.body).toEqual({ type: "object", properties: { name: { type: "string" } }, required: ["name"] });
        expect(endpoint.output).toEqual([
            { status: "201", body: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
        ]);
    });

    test("imports Swagger 2.0 global parameter refs", () => {
        const provider = openApiSpecToProvider(JSON.stringify({
            swagger: "2.0",
            info: { title: "Supabase-like", version: "1" },
            schemes: ["https"],
            host: "project.supabase.co",
            paths: { "/tennis_racket_models": { get: {
                parameters: [
                    { $ref: "#/parameters/rowFilter.tennis_racket_models.id" },
                    { $ref: "#/parameters/range" },
                ],
                responses: { "200": { schema: { type: "array", items: { type: "object" } } } },
            } } },
            parameters: {
                "rowFilter.tennis_racket_models.id": { name: "id", required: false, in: "query", type: "string" },
                range: { name: "Range", required: false, in: "header", type: "string" },
            },
        }), { providerId: "supabase" });
        expect(provider.endpoints[0]!.input?.params).toEqual([
            { name: "id", in: "query", required: false, schema: { type: "string" } },
            { name: "Range", in: "header", required: false, schema: { type: "string" } },
        ]);
    });

    test("imports Swagger 2.0 path-level parameter refs", () => {
        const provider = openApiSpecToProvider(JSON.stringify({
            swagger: "2.0",
            info: { title: "Pets", version: "1" },
            schemes: ["https"],
            host: "pets.example.com",
            paths: { "/pets/{id}": {
                parameters: [{ $ref: "#/parameters/petId" }],
                get: { operationId: "getPet", responses: { "204": { description: "ok" } } },
            } },
            parameters: { petId: { name: "id", in: "path", type: "string", required: true } },
        }), { providerId: "pets" });
        expect(provider.endpoints[0]!.input?.params).toEqual([
            { name: "id", in: "path", required: true, schema: { type: "string" } },
        ]);
    });

    test("supports baseUrl override and operation filtering", () => {
        const raw = JSON.stringify({
            openapi: "3.0.0",
            info: { title: "Filter" },
            paths: {
                "/keep": { get: { operationId: "keep", responses: { "204": { description: "ok" } } } },
                "/drop": { get: { operationId: "drop", responses: { "204": { description: "ok" } } } },
            },
        });
        const provider = openApiSpecToProvider(raw, {
            providerId: "filter",
            baseUrl: "https://override.example.com",
            includeOperation: operation => operation.operationId === "keep",
        });
        expect(provider.endpoints.map(e => e.urn)).toEqual(["urn:filter:keep"]);
        expect(provider.endpoints[0]!.targetUrl).toBe("https://override.example.com/keep");
    });

    test("requires an absolute server URL when endpoints are imported", () => {
        const raw = JSON.stringify({ openapi: "3.0.0", paths: { "/x": { get: {} } } });
        expect(() => openApiSpecToProvider(raw, { providerId: "x" })).toThrow(SpecParseError);
        expect(() => openApiSpecToProvider(raw, { providerId: "x" })).toThrow(/pass baseUrl/);
    });
});
