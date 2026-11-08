import { expect, test } from "bun:test";
import { defineFeature, defineCapability } from "@bernouy/ulvia-sdk";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { z } from "zod";
import { ResourceInitializationService, assertResourceRequirements } from "../../src/exports/initialization";
import { initializationFixture, workerGuard } from "./fixtures";

test("resource requirements reject unavailable capabilities, incompatible versions and denied execution", async () => {
    const feature = defineFeature({
        contractId: "acme/resource",
        name: "Resource",
        publisherId: "acme",
        version: "1.0.0",
        capabilities: [
            defineCapability({
                id: "read",
                description: "Read a resource.",
                access: "public",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                input: z.strictObject({}),
                output: z.strictObject({}),
                errors: {},
                bindings: [{ id: "mcp", transport: "mcp", tool: { name: "resource_read" } }],
            }),
        ],
    });
    const compiled = await compileContract(feature);
    const requirement = { contractId: "acme/resource", capabilityId: "read", versionRange: "^1.0.0" };
    const execution = {
        fingerprint: "selected",
        selected: [
            await resolveContract(
                { get: async () => null, findByDigest: async () => null, list: async () => [] },
                compiled,
            ),
        ],
        denied: [],
    };
    expect(() => assertResourceRequirements([requirement], execution)).not.toThrow();
    for (const input of [
        { ...execution, selected: [] },
        { ...execution, denied: [{ contractId: requirement.contractId, capabilityId: requirement.capabilityId }] },
    ]) {
        expect(() => assertResourceRequirements([requirement], input)).toThrow("cannot satisfy");
    }
    expect(() => assertResourceRequirements([{ ...requirement, versionRange: "^2.0.0" }], execution)).toThrow(
        "cannot satisfy",
    );
    expect(() => assertResourceRequirements([{ ...requirement, capabilityId: "missing" }], execution)).toThrow(
        "cannot satisfy",
    );
});

test("invalid or substituted source archives refuse before creating live entities or durable intents", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    f.options.source = async () => ({ digest: f.archive.digest, bytes: new Blob(["not a ZIP"]) });
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toBeInstanceOf(Error);
    expect(await f.metadata.isEmpty()).toBe(true);
    expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
    expect(await f.intents.getActive("site-a")).toBeNull();
    expect(f.retained.size).toBe(0);
});

test("aborting a pending asset persistence prevents metadata and subsequent content writes", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const controller = new AbortController();
    const put = f.blobs.put.bind(f.blobs);
    f.blobs.put = async (...args) => {
        const result = await put(...args);
        controller.abort(new Error("lease stopped"));
        return result;
    };
    await expect(f.service.apply("admin", review, null, workerGuard(controller))).rejects.toThrow("lease stopped");
    expect(await f.metadata.isEmpty()).toBe(true);
    expect(await f.raw.getBlocRecord("sample-card")).toBeNull();
    expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
    expect((await f.state.read())?.progress.assets).toHaveLength(0);
});

test("recovery refuses changed completed Page roles and missing checkpointed Pages without recreating them", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const replace = f.state.replace.bind(f.state);
    f.state.replace = async (input, revision) => {
        if (input.status === "completed") {
            throw new Error("pause before completion");
        }
        await replace(input, revision);
    };
    await expect(f.service.apply("admin", review, null, workerGuard())).rejects.toThrow("pause before completion");
    const before = await f.state.read();
    const system = await f.raw.getSystem();
    await f.raw.updateSystem({ site: { ...system.site, login: null } });
    await expect(
        new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard()),
    ).rejects.toThrow("login Page role was changed");
    expect((await f.raw.getSystem()).site.login).toBeNull();
    expect(await f.state.read()).toEqual(before);
    const page = (await f.raw.getPage("/"))!;
    await f.raw.deletePage(page.id, page.revision);
    await expect(
        new ResourceInitializationService(f.options).apply("admin", review, null, workerGuard()),
    ).rejects.toThrow("Page disappeared");
    expect(await f.raw.getPage("/")).toBeNull();
});
