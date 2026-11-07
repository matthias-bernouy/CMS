import { expect, test } from "bun:test";
import { implementContract, capabilityError } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesFeature, readNote } from "../../../examples/notes";
import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";

async function fixture() {
    const capability = {
        ...readNote,
        bindings: [
            readNote.bindings[0],
            {
                ...readNote.bindings[0],
                id: "alternate",
                path: "/alternate/{id}",
                response: { ...readNote.bindings[0].response, errorStatuses: { NOT_FOUND: 410 } },
            },
        ],
    };
    const feature = { ...notesFeature, capabilities: [capability] };
    const cause = new Error("private-password");
    const failure = capabilityError(capability, "NOT_FOUND", { message: "Missing" }, { cause });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [
            implementContract(feature, {
                "notes.read": (_dependencies: {}) => () => {
                    throw failure;
                },
            }),
        ],
    });
    return { build, failure, cause };
}

test("host error presentation retains selected binding statuses and private causes stay off the wire", async () => {
    const { build, failure, cause } = await fixture();
    const statuses: number[] = [];
    const runtime = unitProvider(
        build,
        {},
        {
            formatCapabilityFailure: (error, context) => {
                expect(error).toBe(failure);
                expect(error.cause).toBe(cause);
                expect(context.contractId).toBe("example/notes");
                expect(context.invocation.siteId).toBe("site-test");
                statuses.push(context.status);
                return { output: { message: "Introuvable" }, responseHeaders: { "content-language": "fr" } };
            },
        },
    );
    for (const [path, status] of [
        ["/notes/missing", 404],
        ["/alternate/missing", 410],
    ] as const) {
        const response = await runtime.call("example/notes", "notes.read", path);
        expect(response.status).toBe(status);
        expect(response.headers.get("content-language")).toBe("fr");
        const body = await response.text();
        expect(JSON.parse(body)).toEqual({ error: { code: "NOT_FOUND", output: { message: "Introuvable" } } });
        expect(body).not.toContain("private-password");
    }
    expect(statuses).toEqual([404, 410]);
});

test("a formatter cannot invent payload fields or rescue an invalid original failure", async () => {
    const { build, failure } = await fixture();
    let calls = 0;
    const runtime = unitProvider(
        build,
        {},
        {
            formatCapabilityFailure: () => {
                calls++;
                return { output: { message: "Safe", extra: true } };
            },
        },
    );
    const invalidOutput = await runtime.call("example/notes", "notes.read", "/notes/missing");
    expect(invalidOutput.status).toBe(503);
    expect(await invalidOutput.json()).toEqual({ error: { code: "CORE_UNAVAILABLE" } });
    expect(calls).toBe(1);
    Object.assign(failure, { output: { message: 42 } });
    const invalidSource = await runtime.call("example/notes", "notes.read", "/notes/missing");
    expect(invalidSource.status).toBe(503);
    expect(calls).toBe(1);
});

test("authorization still runs before either feature handlers or host error presentation", async () => {
    const { build } = await fixture();
    let calls = 0;
    const runtime = unitProvider(
        build,
        {},
        {
            authorize: async () => false,
            formatCapabilityFailure: () => {
                calls++;
                return { output: { message: "Unused" } };
            },
        },
    );
    expect((await runtime.call("example/notes", "notes.read", "/notes/missing")).status).toBe(403);
    expect(calls).toBe(0);
});
