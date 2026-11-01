import { expect, test } from "bun:test";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    DefaultProviderCapabilityDispatcher,
    ProviderCapabilityDispatchError,
} from "@bernouy/ulvia-provider";
import { registerCollectionOperationCapabilities } from "../../../src/capabilities/installations/operations";
import { officialFailure } from "../../../src/dispatch/errors/failure";
import { context, resolvedContract } from "./fixtures";

test("async official errors use admitted schemas and retain the original language on replay and detail reads", async () => {
    const contract = await resolvedContract("ulvia.cms.installations");
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store, undefined, { contracts: [contract] });
    let executions = 0;
    executor.register("ulvia.cms.installations", "apply-collection-upgrade", async () => {
        executions++;
        throw officialFailure("REVISION_CONFLICT", 409);
    });
    const firstContext = { ...context("fr"), idempotencyKey: "reviewed-upgrade" };
    const first = await executor.enqueue("ulvia.cms.installations", "apply-collection-upgrade", {}, firstContext);
    const replay = await executor.enqueue(
        "ulvia.cms.installations",
        "apply-collection-upgrade",
        {},
        { ...firstContext, ...context("en") },
    );
    expect(replay).toEqual(first);
    await executor.stop();
    expect(executions).toBe(1);
    expect(await store.get("other-site", first.operationId)).toBeNull();
    const failed = (await store.get("default", first.operationId))!;
    expect(failed).toMatchObject({
        status: "failed",
        errorCode: "REVISION_CONFLICT",
        errorOutput: {
            message: "Les données ont été modifiées depuis leur chargement. Rechargez-les avant de réessayer.",
        },
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionOperationCapabilities(dispatcher, executor);
    const detail = (await dispatcher.invoke(
        "ulvia.cms.installations",
        "get-operation",
        first,
        context("en"),
    )) as Response;
    expect(detail.headers.get("content-language")).toBe("fr");
    expect(await detail.json()).toMatchObject({ errorCode: "REVISION_CONFLICT", errorOutput: failed.errorOutput });
    await expect(
        dispatcher.invoke("ulvia.cms.installations", "get-operation", first, {
            ...context("fr"),
            siteId: "other-site",
        }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("async undeclared and technical failures expose only a generic localized message", async () => {
    const contract = await resolvedContract("ulvia.cms.installations");
    for (const error of [
        new TypeError("secret endpoint"),
        new ProviderCapabilityDispatchError("UNDECLARED", 422, "secret endpoint", {}, { message: "secret endpoint" }),
    ]) {
        const store = new MemoryProviderOperationStore();
        const failures: unknown[] = [];
        const executor = new ProviderOperationExecutor(store, undefined, {
            contracts: [contract],
            onFailure: (...args) => {
                failures.push(args);
            },
        });
        executor.register("ulvia.cms.installations", "apply-collection-upgrade", async () => {
            throw error;
        });
        const operation = await executor.enqueue(
            "ulvia.cms.installations",
            "apply-collection-upgrade",
            {},
            { ...context("fr"), idempotencyKey: "one" },
        );
        await executor.stop();
        const record = await store.get("default", operation.operationId);
        expect(record).toMatchObject({ status: "failed", errorCode: "OPERATION_FAILED" });
        expect(record?.errorOutput).toHaveProperty("message");
        expect(JSON.stringify(record?.errorOutput)).not.toContain("secret endpoint");
        expect(failures).toHaveLength(1);
    }
});

test("explicit async messages retain their actual language and schema-projected details", async () => {
    const contract = await resolvedContract("ulvia.cms.installations");
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store, undefined, { contracts: [contract] });
    executor.register("ulvia.cms.installations", "apply-collection-upgrade", async () => {
        throw new ProviderCapabilityDispatchError(
            "REVISION_CONFLICT",
            409,
            "private diagnostic",
            { "Content-Language": "es" },
            { message: "La selección ha cambiado.", internal: "private diagnostic" },
        );
    });
    const operation = await executor.enqueue(
        "ulvia.cms.installations",
        "apply-collection-upgrade",
        {},
        { ...context("fr"), idempotencyKey: "explicit-language" },
    );
    await executor.stop();
    const record = await store.get("default", operation.operationId);
    expect(record).toMatchObject({
        status: "failed",
        errorContentLanguage: "es",
        errorOutput: { message: "La selección ha cambiado." },
    });
    expect(record?.errorOutput).not.toHaveProperty("internal");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionOperationCapabilities(dispatcher, executor);
    const response = (await dispatcher.invoke(
        "ulvia.cms.installations",
        "get-operation",
        operation,
        context("en"),
    )) as Response;
    expect(response.headers.get("content-language")).toBe("es");
    expect(await response.json()).toMatchObject({ errorOutput: { message: "La selección ha cambiado." } });
    expect(await store.get("other-site", operation.operationId)).toBeNull();
});
