import { expect, test } from "bun:test";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { defineOperation, operationError, z } from "@bernouy/ulvia-sdk";
import { notesProviderDefinition } from "../../examples/provider";
import { notesContract, readNote } from "../../examples/notes";
import { unitProvider } from "./support/runtime";

test("typed errors follow the selected HTTP alias instead of carrying a hardcoded status", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const original = notesContract.capabilities["notes.read"];
    const http = original.bindings[0];
    const contract = {
        ...notesContract,
        capabilities: {
            "notes.read": {
                ...original,
                bindings: [
                    http,
                    {
                        ...http,
                        id: "alias",
                        path: "/alternate/{id}",
                        response: { ...http.response, errorStatuses: { NOT_FOUND: 410 } },
                    },
                ],
            },
        },
    };
    const build = await compileProvider({
        ...base,
        implementations: [
            {
                contract,
                handlers: {
                    "notes.read": (_dependencies: {}) => () => {
                        throw operationError(readNote, "NOT_FOUND", { message: "Missing" });
                    },
                },
            },
        ],
    });
    const runtime = unitProvider(build, {});
    expect((await runtime.call("example/notes", "notes.read", "/notes/missing")).status).toBe(404);
    const alternate = await runtime.call("example/notes", "notes.read", "/alternate/missing");
    expect(alternate.status).toBe(410);
    expect(await alternate.json()).toEqual({ error: { code: "NOT_FOUND", output: { message: "Missing" } } });
});

test("invalid results, unrelated failures and malformed errors never expose implementation details", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const other = defineOperation({
        input: z.strictObject({}),
        output: z.boolean(),
        errors: { NOT_FOUND: { retryable: false } },
    });
    let output: unknown = { id: 42, text: "invalid" };
    const build = await compileProvider({
        ...base,
        implementations: [
            {
                ...base.implementations[0]!,
                handlers: {
                    "notes.read": (_dependencies: {}) => () => {
                        if (output instanceof Error) {
                            throw output;
                        }
                        return output;
                    },
                },
            },
        ],
    });
    const runtime = unitProvider(build, {});
    for (const value of [output, new Error("Private implementation secret"), operationError(other, "NOT_FOUND")]) {
        output = value;
        const response = await runtime.call("example/notes", "notes.read", "/notes/welcome");
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: { code: "CORE_UNAVAILABLE" } });
    }
});

test("error ownership is captured before asynchronous admission", async () => {
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const capability = { ...notesContract.capabilities["notes.read"] };
    const contract = { ...notesContract, capabilities: { "notes.read": capability } };
    const pending = compileProvider({
        ...base,
        implementations: [
            {
                contract,
                handlers: {
                    "notes.read": (_dependencies: {}) => () => {
                        throw operationError(readNote, "NOT_FOUND", { message: "Original" });
                    },
                },
            },
        ],
    });
    capability.operation = { ...readNote };
    const runtime = unitProvider(await pending, {});
    const response = await runtime.call("example/notes", "notes.read", "/notes/welcome");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", output: { message: "Original" } } });
});
