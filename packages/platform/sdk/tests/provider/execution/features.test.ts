import { defineFeature } from "@bernouy/ulvia-sdk";
import { expect, test } from "bun:test";
import { contractString, capabilitiesFor, implementFeature, implementContract, z } from "@bernouy/ulvia-sdk";
import { compileContract, compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";

const metadata = { contractId: "example/defaults", name: "Defaults", publisherId: "example", version: "1.0.0" };
const exposure = {
    id: "read",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/read/{id}",
            input: { path: { id: "id" } },
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: { MISSING: 404 } },
        },
    ],
} as const;
const schemas = {
    input: z.strictObject({ id: contractString({ maxLength: 128 }) }),
    output: contractString({ maxLength: 128 }),
    errors: { MISSING: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 128 }) }) } },
};
interface Services {
    notes: { read(id: string): Promise<string> };
}

async function fixture() {
    const author = capabilitiesFor<Services>();
    let calls = 0;
    const read = author({
        ...exposure,
        ...schemas,
        execute: async ({ input, services, fail }) => {
            calls++;
            if (input.id === "missing") {
                throw fail("MISSING", { message: "Absent" });
            }
            return services.notes.read(input.id);
        },
    });
    const feature = defineFeature({ ...metadata, capabilities: [read] });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    return { read, feature, build, calls: () => calls };
}

test("default execution is absent from published contracts and never runs during authoring or build", async () => {
    const f = await fixture();
    const admission = await compileContract(f.feature);
    const declaration = await compileContract({ ...f.feature, capabilities: [{ ...exposure, ...schemas }] });
    expect(admission.canonicalJson).toBe(declaration.canonicalJson);
    expect(admission.digest).toBe(declaration.digest);
    expect(admission.canonicalJson).not.toContain("execute");
    expect(f.calls()).toBe(0);
});

test("the same default implementation receives independently mounted service instances", async () => {
    const f = await fixture();
    const first = unitProvider(f.build, { notes: { read: async (id) => `first:${id}` } });
    const second = unitProvider(f.build, { notes: { read: async (id) => `second:${id}` } });
    expect(await (await first.call(metadata.contractId, "read", "/read/one")).json()).toBe("first:one");
    expect(await (await second.call(metadata.contractId, "read", "/read/one")).json()).toBe("second:one");
    const refusal = await first.call(metadata.contractId, "read", "/read/missing");
    expect(refusal.status).toBe(404);
    expect(await refusal.json()).toEqual({ error: { code: "MISSING", output: { message: "Absent" } } });
    expect(f.calls()).toBe(3);
});

test("declarative capabilities compile but cannot be advertised without complete execution", async () => {
    const author = capabilitiesFor<Services>();
    const read = author({ ...exposure, ...schemas });
    const feature = defineFeature({ ...metadata, capabilities: [read] });
    expect((await compileContract(feature)).release.capabilities).toHaveLength(1);
    expect(() => implementFeature(feature)).toThrow("Missing execute for read");
    const alternate = implementContract(feature, { read: (_services: {}) => () => "Alternate" });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [alternate],
    });
    expect(await (await unitProvider(build, {}).call(metadata.contractId, "read", "/read/one")).json()).toBe(
        "Alternate",
    );
});

test("default executors are captured before asynchronous admission", async () => {
    const author = capabilitiesFor<Services>();
    const read = { ...author({ ...exposure, ...schemas, execute: () => "Original" }) };
    const feature = defineFeature({ ...metadata, capabilities: [read] });
    const pending = compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    read.execute = () => "Changed";
    const runtime = unitProvider(await pending, { notes: { read: async (id) => id } });
    expect(await (await runtime.call(metadata.contractId, "read", "/read/one")).json()).toBe("Original");
});

test("authorization and admitted input validation still refuse before capability execution", async () => {
    const f = await fixture();
    const runtime = unitProvider(f.build, { notes: { read: async (id) => id } }, { authorize: async () => false });
    expect((await runtime.call(metadata.contractId, "read", "/read/one")).status).toBe(403);
    const allowed = unitProvider(f.build, { notes: { read: async (id) => id } });
    expect((await allowed.call(metadata.contractId, "read", `/read/${"x".repeat(129)}`)).status).toBe(400);
    expect(f.calls()).toBe(0);
});
