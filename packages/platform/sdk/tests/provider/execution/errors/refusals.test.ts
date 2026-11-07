import { expect, test } from "bun:test";
import { defineFeature, implementFeature } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";
import { errorFeature, metadata, read, unavailable } from "./fixture";

test("feature mappings reject undeclared codes, invalid output and payloads for payload-free errors", async () => {
    for (const mapping of [
        { code: "UNKNOWN", output: { message: "private" } },
        { code: "MISSING", output: { message: 42 } },
        { code: "EMPTY", output: undefined },
    ]) {
        const build = await compileProvider({
            ...notesProviderDefinition("http://127.0.0.1:5103"),
            implementations: [implementFeature(errorFeature(() => mapping))],
        });
        const response = await unitProvider(build, unavailable).call(metadata.contractId, read.id, "/read/one");
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("private");
    }
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(errorFeature(() => ({ code: "EMPTY" })))],
    });
    const response = await unitProvider(build, unavailable).call(metadata.contractId, read.id, "/read/one");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "EMPTY" } });
});

test("non-function feature error policies refuse before service projection", () => {
    expect(() => defineFeature({ ...metadata, capabilities: [read], mapError: 42 as never })).toThrow(
        "Feature mapError must be a function",
    );
    expect(() => implementFeature({ ...errorFeature(), mapError: 42 as never })).toThrow(
        "Feature mapError must be a function",
    );
});
