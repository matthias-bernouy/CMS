import { expect, test } from "bun:test";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileContract, compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";
import { errorFeature, metadata, unavailable, mapError, read } from "./fixture";

test("feature error policies are private code and never run during authoring, compilation or mounting", async () => {
    let calls = 0;
    const feature = errorFeature((cause, capability) => {
        calls++;
        return mapError(cause, capability);
    });
    const compiled = await compileContract(feature);
    const declaration = await compileContract({ ...feature, mapError: undefined });
    expect(compiled.canonicalJson).toBe(declaration.canonicalJson);
    expect(compiled.canonicalJson).not.toContain("mapError");
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const runtime = unitProvider(build, unavailable);
    expect(calls).toBe(0);
    const response = await runtime.call(metadata.contractId, read.id, "/read/one");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "MISSING", output: { message: "Note is absent." } } });
    expect(calls).toBe(1);
});

test("default implementations capture their owner's error policy before asynchronous admission", async () => {
    const feature = { ...errorFeature() };
    const pending = compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    feature.mapError = () => ({ code: "UNAVAILABLE", output: { message: "Changed" } });
    const response = await unitProvider(await pending, unavailable).call(metadata.contractId, read.id, "/read/one");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Changed");
});
