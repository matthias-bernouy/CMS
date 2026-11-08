import { expect, test } from "bun:test";
import {
    capabilityResponse,
    capabilitiesFor,
    contractString,
    defineFeature,
    implementFeature,
    z,
} from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";
const author = capabilitiesFor<{ read(): unknown }>();
async function fixture(invalid = false) {
    const capability = author({
        id: "read",
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input: z.strictObject({}),
        output: z.strictObject({ message: contractString({ maxLength: 32 }) }),
        errors: {},
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: "/read",
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
        execute: ({ services }) =>
            capabilityResponse(services.read() as { message: string }, undefined, { contentLanguage: "fr-fr" }),
    });
    const feature = defineFeature({
        contractId: "example/localized",
        publisherId: "example",
        version: "1.0.0",
        name: "Localized",
        capabilities: [capability],
    });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    let reads = 0;
    return {
        runtime: unitProvider(build, {
            read: () => {
                reads++;
                return invalid ? { private: "storage-secret" } : { message: "Bonjour" };
            },
        }),
        reads: () => reads,
    };
}
test("typed JSON representation preserves canonical language outside the validated body without session authority", async () => {
    const f = await fixture();
    const response = await f.runtime.call("example/localized", "read", "/read", { method: "GET", body: "{}" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-language")).toBe("fr-FR");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("x-ulvia-session-effect")).toBe(false);
    expect(await response.json()).toEqual({ message: "Bonjour" });
    expect(f.reads()).toBe(1);
});
test("JSON representation metadata cannot bypass admitted output validation or disclose private results", async () => {
    const f = await fixture(true);
    const response = await f.runtime.call("example/localized", "read", "/read", { method: "GET", body: "{}" });
    expect(response.status).toBe(503);
    expect(response.headers.has("content-language")).toBe(false);
    expect(await response.text()).not.toContain("storage-secret");
    expect(f.reads()).toBe(1);
});
test("JSON representation snapshots its tag and refuses oversized, invalid or arbitrary header metadata", () => {
    const metadata = { contentLanguage: "es" };
    const response = capabilityResponse({ ok: true }, undefined, metadata);
    metadata.contentLanguage = "en";
    expect(response.representation).toEqual({ contentLanguage: "es" });
    expect(Object.isFrozen(response.representation)).toBe(true);
    for (const contentLanguage of ["", "*", "fr, en", "fr\r\nx-private: secret", "x".repeat(65)]) {
        expect(() => capabilityResponse({}, undefined, { contentLanguage })).toThrow();
    }
    expect(() =>
        capabilityResponse({}, undefined, { contentLanguage: "fr", authorization: "private" } as never),
    ).toThrow("Invalid JSON representation metadata");
});
