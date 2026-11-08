import { expect, test } from "bun:test";
import { capabilityError, defineFeature, implementFeature, implementContract } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";
import { author, context, errorFeature, metadata, read, unavailable } from "./fixture";

test("inherited executors use their declaring feature's policy, including local child invocations", async () => {
    let childMappings = 0;
    const parent = errorFeature();
    const child = defineFeature({
        ...metadata,
        contractId: "example/child-errors",
        extends: parent,
        capabilities: [
            author({
                ...read,
                id: "own",
                bindings: read.bindings.map((binding) => ({ ...binding, path: "/own/{id}" })),
            }),
        ],
        mapError: () => {
            childMappings++;
            return { code: "UNAVAILABLE", output: { message: "Child" } };
        },
    });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(child)],
    });
    const response = await unitProvider(build, unavailable).call(child.contractId, read.id, "/read/one");
    expect(response.status).toBe(404);
    await response.body?.cancel();
    await expect(
        executeCapability(child, "read", { input: { id: "one" }, services: unavailable, context }),
    ).rejects.toMatchObject({ capability: read, code: "MISSING" });
    expect(childMappings).toBe(0);
});

test("foreign failures are never reassigned to the executing capability's owner", async () => {
    let mappings = 0;
    const feature = errorFeature(() => {
        mappings++;
        return { code: "MISSING", output: { message: "Forged" } };
    });
    const foreign = capabilityError({ ...read, id: "foreign" }, "MISSING", { message: "private-foreign-failure" });
    const services = {
        notes: {
            read: async () => {
                throw foreign;
            },
        },
    };
    await expect(executeCapability(feature, "read", { input: { id: "one" }, services, context })).rejects.toBe(foreign);
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const response = await unitProvider(build, services).call(metadata.contractId, read.id, "/read/one");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-foreign-failure");
    expect(mappings).toBe(0);
});

test("complete alternative implementations retain their own error handling", async () => {
    let mappings = 0;
    const feature = errorFeature(() => {
        mappings++;
        return { code: "MISSING", output: { message: "Default" } };
    });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [
            implementContract(feature, {
                read: () => async () => {
                    throw new Error("private-alternative-token");
                },
            }),
        ],
    });
    const response = await unitProvider(build, {}).call(metadata.contractId, read.id, "/read/one");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-alternative-token");
    expect(mappings).toBe(0);
});

test("the same standalone capability can belong to features with independent error policies", async () => {
    const first = errorFeature();
    const second = defineFeature({
        ...first,
        contractId: "example/other-errors",
        mapError: () => ({ code: "UNAVAILABLE", output: { message: "Other feature" } }),
    });
    await expect(
        executeCapability(first, "read", { input: { id: "one" }, services: unavailable, context }),
    ).rejects.toMatchObject({ code: "MISSING" });
    await expect(
        executeCapability(second, "read", { input: { id: "one" }, services: unavailable, context }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE", output: { message: "Other feature" } });
    await expect(
        executeCapability(first, "read", { input: { id: "one" }, services: unavailable, context }),
    ).rejects.toMatchObject({ code: "MISSING" });
});
