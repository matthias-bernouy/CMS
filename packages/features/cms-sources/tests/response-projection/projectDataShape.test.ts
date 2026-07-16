import { describe, expect, test } from "bun:test";
import { projectDataShape } from "cms-sources/core/response-projection/projectDataShape";
import type { DataShape } from "cms-sources/interfaces/DataShape";

describe("projectDataShape", () => {
    test("projects declared properties recursively and drops undeclared data", () => {
        const shape: DataShape = {
            type: "object",
            properties: {
                id: { type: "string" },
                profile: {
                    type: "object",
                    properties: { displayName: { type: "string" } },
                },
                rows: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: { value: { type: "number" } },
                    },
                },
            },
        };

        expect(projectDataShape({
            id: "account-1",
            token: "must-not-leak",
            profile: { displayName: "Ada", privateEmail: "ada@example.test" },
            rows: [{ value: 1, internal: true }, { value: 2, internal: false }],
        }, shape)).toEqual({
            ok: true,
            value: {
                id: "account-1",
                profile: { displayName: "Ada" },
                rows: [{ value: 1 }, { value: 2 }],
            },
        });
    });

    test("keeps C14 required and unstructured shapes permissive", () => {
        const requiredShape: DataShape = {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
        };
        expect(projectDataShape({}, requiredShape)).toEqual({ ok: true, value: {} });

        const object = { arbitrary: { nested: true } };
        expect(projectDataShape(object, { type: "object" })).toEqual({ ok: true, value: object });

        const array = [{ arbitrary: true }];
        expect(projectDataShape(array, { type: "array" })).toEqual({ ok: true, value: array });
    });

    test("rejects scalar and nested type mismatches", () => {
        expect(projectDataShape("1", { type: "number" })).toEqual({
            ok: false,
            reason: "type_mismatch",
            path: "$",
            expectedType: "number",
            actualType: "string",
        });
        expect(projectDataShape({ rows: [{ value: "1" }] }, {
            type: "object",
            properties: {
                rows: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: { value: { type: "number" } },
                    },
                },
            },
        })).toEqual({
            ok: false,
            reason: "type_mismatch",
            path: "$.rows[].value",
            expectedType: "number",
            actualType: "string",
        });
    });

    test("accepts JSON null only when the shape declares it nullable", () => {
        expect(projectDataShape(null, { type: "string", nullable: true }))
            .toEqual({ ok: true, value: null });
        expect(projectDataShape(null, { type: "string" }))
            .toEqual({
                ok: false,
                reason: "type_mismatch",
                path: "$",
                expectedType: "string",
                actualType: "null",
            });
        expect(projectDataShape(null, { type: "string", nullable: false }))
            .toEqual({
                ok: false,
                reason: "type_mismatch",
                path: "$",
                expectedType: "string",
                actualType: "null",
            });
        expect(projectDataShape({ email: null }, {
            type: "object",
            properties: { email: { type: "string", nullable: true } },
        })).toEqual({ ok: true, value: { email: null } });
    });

    test("only projects own properties", () => {
        const value = Object.assign(Object.create({ inherited: "secret" }), { own: "visible" });
        expect(projectDataShape(value, {
            type: "object",
            properties: {
                inherited: { type: "string" },
                own: { type: "string" },
            },
        })).toEqual({ ok: true, value: { own: "visible" } });
    });

    test("redacts non-identifier property names from diagnostic paths", () => {
        expect(projectDataShape({ "private@example.test": 42 }, {
            type: "object",
            properties: { "private@example.test": { type: "string" } },
        })).toEqual({
            ok: false,
            reason: "type_mismatch",
            path: "$.*",
            expectedType: "string",
            actualType: "number",
        });
    });
});
