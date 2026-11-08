import { mountInstallations } from "../installations/mount";
import { expect, test } from "bun:test";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    DefaultProviderCapabilityDispatcher,
    ProviderCapabilityDispatchError,
} from "@bernouy/ulvia-provider";
import { officialFailure } from "../../../src/dispatch/errors/failure";
import { context, resolvedContract, invokeHttp } from "./fixtures";

test("async official errors use admitted schemas and retain the original language on replay and detail reads", async () => {
    const contract = await resolvedContract("ulvia/cms.installations");
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store, undefined, { contracts: [contract] });
    let executions = 0;
    executor.register("ulvia/cms.installations", "apply-collection-upgrade", async () => {
        executions++;
        throw officialFailure("REVISION_CONFLICT", 409);
    });
    const firstContext = { ...context("fr", contract.release.version), idempotencyKey: "reviewed-upgrade" };
    const first = await executor.enqueue("ulvia/cms.installations", "apply-collection-upgrade", {}, firstContext);
    const replay = await executor.enqueue(
        "ulvia/cms.installations",
        "apply-collection-upgrade",
        {},
        { ...firstContext, ...context("en", contract.release.version) },
    );
    expect(replay).toEqual(first);
    await executor.stop();
    expect(executions).toBe(1);
    expect(await store.get("example--other--site", first.operationId)).toBeNull();
    const failed = (await store.get("default", first.operationId))!;
    expect(failed).toMatchObject({
        status: "failed",
        errorCode: "REVISION_CONFLICT",
        errorOutput: {
            message: "Les données ont été modifiées depuis leur chargement. Rechargez-les avant de réessayer.",
        },
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountInstallations(dispatcher, {}, { executor: executor });
    const detail = await invokeHttp(contract, dispatcher, "get-operation", first, "en");
    expect(detail.headers.get("content-language")).toBe("fr");
    expect(await detail.json()).toMatchObject({ errorCode: "REVISION_CONFLICT", errorOutput: failed.errorOutput });
    await expect(
        dispatcher.invoke("ulvia/cms.installations", "get-operation", first, {
            ...context("fr", contract.release.version),
            siteId: "example--other--site",
        }),
    ).rejects.toThrow("mounted Provider scope");
});

test("async undeclared and technical failures expose only a generic localized message", async () => {
    const contract = await resolvedContract("ulvia/cms.installations");
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
        executor.register("ulvia/cms.installations", "apply-collection-upgrade", async () => {
            throw error;
        });
        const operation = await executor.enqueue(
            "ulvia/cms.installations",
            "apply-collection-upgrade",
            {},
            { ...context("fr", contract.release.version), idempotencyKey: "one" },
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
    const contract = await resolvedContract("ulvia/cms.installations");
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store, undefined, { contracts: [contract] });
    executor.register("ulvia/cms.installations", "apply-collection-upgrade", async () => {
        throw new ProviderCapabilityDispatchError(
            "REVISION_CONFLICT",
            409,
            "private diagnostic",
            { "Content-Language": "es" },
            { message: "La selección ha cambiado.", internal: "private diagnostic" },
        );
    });
    const operation = await executor.enqueue(
        "ulvia/cms.installations",
        "apply-collection-upgrade",
        {},
        { ...context("fr", contract.release.version), idempotencyKey: "explicit-language" },
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
    await mountInstallations(dispatcher, {}, { executor: executor });
    const response = await invokeHttp(contract, dispatcher, "get-operation", operation, "en");
    expect(response.headers.get("content-language")).toBe("es");
    expect(await response.json()).toMatchObject({ errorOutput: { message: "La selección ha cambiado." } });
    expect(await store.get("example--other--site", operation.operationId)).toBeNull();
});
