import { parseUlviaSchema, validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { expect, test } from "bun:test";
import {
    DefaultProviderCapabilityDispatcher,
    ProviderCapabilityDispatchError,
    type ProviderCapabilityInvocationContext,
} from "@bernouy/ulvia-provider";
import { ProviderOperationExecutor, MemoryProviderOperationStore } from "@bernouy/ulvia-provider";
import { registerCollectionOperationCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
    subjectId: "00000000-0000-4000-8000-000000000002",
    idempotencyKey: "upgrade-1",
};

test("Provider operations deduplicate the same input and reject a changed replay", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    let calls = 0;
    executor.register("ulvia.cms.installations", "apply", async (input) => {
        calls += 1;
        return { applied: input.target };
    });

    const first = await executor.enqueue("ulvia.cms.installations", "apply", { target: "2.0.0" }, context);
    const replay = await executor.enqueue("ulvia.cms.installations", "apply", { target: "2.0.0" }, context);
    expect(replay).toEqual(first);
    await expectTerminal(store, first.operationId, "succeeded");
    expect(calls).toBe(1);

    await expect(
        executor.enqueue("ulvia.cms.installations", "apply", { target: "3.0.0" }, context),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const nextRelease = await executor.enqueue(
        "ulvia.cms.installations",
        "apply",
        { target: "3.0.0" },
        { ...context, contractVersion: "2.0.0" },
    );
    expect(nextRelease).not.toEqual(first);
    await expectTerminal(store, nextRelease.operationId, "succeeded");
    expect(calls).toBe(2);
});

test("Provider operation recovery reclaims an expired lease and records failures", async () => {
    const store = new MemoryProviderOperationStore();
    await store.createOrGet({
        id: "00000000-0000-7000-8000-000000000010",
        siteId: "default",
        contractId: "ulvia.cms.installations",
        capabilityId: "resume",
        idempotencyKey: "resume-1",
        inputDigest: `sha256:${"0".repeat(64)}`,
        input: { id: "upgrade-1" },
        context: { ...context, idempotencyKey: "resume-1" },
        status: "running",
        revision: 2,
        createdAt: "2026-10-06T10:00:00.000Z",
        updatedAt: "2026-10-06T10:00:00.000Z",
        lease: { token: "dead-worker", expiresAt: "2026-10-06T10:00:01.000Z" },
    });
    const executor = new ProviderOperationExecutor(store, () => new Date("2026-10-06T10:01:00.000Z"));
    executor.register("ulvia.cms.installations", "resume", async () => {
        throw new Error("boom");
    });

    await executor.recover();
    const record = await expectTerminal(store, "00000000-0000-7000-8000-000000000010", "failed");
    expect(record.errorCode).toBe("OPERATION_FAILED");
});

test("Provider operations report technical failures without exposing their input", async () => {
    const store = new MemoryProviderOperationStore();
    const failures: Array<{ observation: Record<string, unknown>; error?: unknown }> = [];
    const executor = new ProviderOperationExecutor(store, undefined, {
        onFailure: (observation, error) => failures.push({ observation, error }),
    });
    const failure = new Error("database unavailable");
    executor.register("ulvia.cms.installations", "apply", async () => {
        throw failure;
    });

    const queued = await executor.enqueue(
        "ulvia.cms.installations",
        "apply",
        { administratorPassword: "must-never-be-observed" },
        context,
    );
    await expectTerminal(store, queued.operationId, "failed");

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
        observation: {
            operationId: queued.operationId,
            contractId: "ulvia.cms.installations",
            capabilityId: "apply",
            requestId: context.requestId,
            errorCode: "OPERATION_FAILED",
            kind: "handler-failed",
            durationMs: expect.any(Number),
        },
        error: failure,
    });
    expect(JSON.stringify(failures[0]?.observation)).not.toContain("must-never-be-observed");
});

test("Provider operations report expected domain rejections without a technical error", async () => {
    const store = new MemoryProviderOperationStore();
    const failures: Array<{ observation: Record<string, unknown>; error?: unknown }> = [];
    const executor = new ProviderOperationExecutor(store, undefined, {
        onFailure: (observation, error) => failures.push({ observation, error }),
    });
    executor.register("ulvia.cms.installations", "apply", async () => {
        throw new ProviderCapabilityDispatchError("COLLECTION_CONFLICT", 409);
    });

    const queued = await executor.enqueue("ulvia.cms.installations", "apply", {}, context);
    await expectTerminal(store, queued.operationId, "failed");

    expect(failures).toEqual([
        {
            observation: expect.objectContaining({
                operationId: queued.operationId,
                errorCode: "COLLECTION_CONFLICT",
                kind: "handler-rejected",
            }),
            error: undefined,
        },
    ]);
});

test("Provider operation recovery terminates work whose handler no longer exists", async () => {
    const store = new MemoryProviderOperationStore();
    await store.createOrGet({
        id: "00000000-0000-7000-8000-000000000011",
        siteId: "default",
        contractId: "ulvia.cms.removed",
        capabilityId: "removed",
        idempotencyKey: "removed-1",
        inputDigest: `sha256:${"0".repeat(64)}`,
        input: {},
        context: { ...context, idempotencyKey: "removed-1" },
        status: "queued",
        revision: 1,
        createdAt: "2026-10-06T10:00:00.000Z",
        updatedAt: "2026-10-06T10:00:00.000Z",
    });
    const executor = new ProviderOperationExecutor(store, () => new Date("2026-10-06T10:01:00.000Z"));

    await executor.recover();

    const record = await expectTerminal(store, "00000000-0000-7000-8000-000000000011", "failed");
    expect(record.errorCode).toBe("OPERATION_HANDLER_UNAVAILABLE");
});

test("Provider operations abort cooperative work when lease renewal is lost", async () => {
    class LostLeaseStore extends MemoryProviderOperationStore {
        override async renew(): Promise<boolean> {
            return false;
        }
    }
    const store = new LostLeaseStore();
    const executor = new ProviderOperationExecutor(store, () => new Date(), { leaseMs: 9 });
    let aborted = false;
    executor.register("ulvia.cms.installations", "apply", async (_input, _context, execution) => {
        await new Promise<void>((resolve) => {
            execution.signal.addEventListener(
                "abort",
                () => {
                    aborted = true;
                    resolve();
                },
                { once: true },
            );
        });
        execution.throwIfLeaseLost();
    });

    const queued = await executor.enqueue("ulvia.cms.installations", "apply", {}, context);
    for (let attempt = 0; attempt < 50 && !aborted; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(aborted).toBe(true);
    expect((await store.get("default", queued.operationId))?.status).toBe("running");
});

test("Provider operation shutdown drains active work and rejects new work", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
        finish = resolve;
    });
    let started = false;
    executor.register("ulvia.cms.installations", "apply", async () => {
        started = true;
        await completion;
        return { applied: true };
    });

    await executor.enqueue("ulvia.cms.installations", "apply", {}, context);
    await waitUntil(() => started);
    let stopped = false;
    const stopping = executor.stop().then(() => {
        stopped = true;
    });
    await Bun.sleep(2);
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);
    await expect(
        executor.enqueue("ulvia.cms.installations", "apply", {}, { ...context, idempotencyKey: "after-stop" }),
    ).rejects.toMatchObject({ code: "PROVIDER_SHUTTING_DOWN", status: 503 });
});

test("Provider operations retain their instance resource until execution finishes", async () => {
    const store = new MemoryProviderOperationStore();
    let retained = 0;
    let released = 0;
    const executor = new ProviderOperationExecutor(store, undefined, {
        retainResource: () => {
            retained += 1;
            return () => {
                released += 1;
            };
        },
    });
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
        finish = resolve;
    });
    executor.register("ulvia.cms.installations", "apply", async () => {
        await completion;
        return { applied: true };
    });

    const queued = await executor.enqueue("ulvia.cms.installations", "apply", {}, context);
    await waitUntil(() => retained === 1);
    expect(released).toBe(0);
    finish();
    await expectTerminal(store, queued.operationId, "succeeded");
    await waitUntil(() => released === 1);
});

test("the installations contract exposes a completed operation result only from its detail query", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    executor.register("ulvia.cms.installations", "apply-collection-upgrade", async () => ({
        upgradeId: `sha256:${"a".repeat(64)}`,
        status: "completed",
        collectionRevision: 2,
    }));
    const queued = await executor.enqueue("ulvia.cms.installations", "apply-collection-upgrade", {}, context);
    executor.register("ulvia.cms.content", "rebuild", async () => ({ rebuilt: true }));
    const unrelated = await executor.enqueue("ulvia.cms.content", "rebuild", {}, context);
    await expectTerminal(store, queued.operationId, "succeeded");
    await expectTerminal(store, unrelated.operationId, "succeeded");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionOperationCapabilities(dispatcher, executor);

    const detail = record(
        await dispatcher.invoke(
            "ulvia.cms.installations",
            "get-operation",
            { operationId: queued.operationId },
            context,
        ),
    );
    expect(detail.result).toEqual({
        upgradeId: `sha256:${"a".repeat(64)}`,
        status: "completed",
        collectionRevision: 2,
    });
    const listed = record(await dispatcher.invoke("ulvia.cms.installations", "list-operations", {}, context));
    expect(listed.items).toHaveLength(1);
    for (const [name, value] of [
        ["get-operation", detail],
        ["list-operations", listed],
    ] as const) {
        const definition = await Bun.file(
            new URL(
                `../../../../official-repository/contracts/ulvia.cms.installations/capabilities/queries/${name}.json`,
                import.meta.url,
            ),
        ).json();
        validateSchemaValue(parseUlviaSchema(definition.output), value);
    }

    expect((listed.items as unknown[])[0]).not.toHaveProperty("result");
    await expect(
        dispatcher.invoke("ulvia.cms.installations", "get-operation", { operationId: unrelated.operationId }, context),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});

async function expectTerminal(store: MemoryProviderOperationStore, id: string, status: "succeeded" | "failed") {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const record = await store.get("default", id);
        if (record?.status === status) {
            return record;
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Operation ${id} did not reach ${status}`);
}

async function waitUntil(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 200;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for Provider operation");
        }
        await Bun.sleep(2);
    }
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Expected a Provider operation record");
    }
    return value as Record<string, unknown>;
}
