import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher, type ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { ProviderOperationExecutor, MemoryProviderOperationStore } from "@bernouy/ulvia-provider";
import { registerJobCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
    subjectId: "00000000-0000-4000-8000-000000000002",
    idempotencyKey: "migration-1",
};

test("Provider operations deduplicate the same input and reject a changed replay", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    let calls = 0;
    executor.register("ulvia.cms.collections", "apply", async (input) => {
        calls += 1;
        return { applied: input.target };
    });

    const first = await executor.enqueue("ulvia.cms.collections", "apply", { target: "2.0.0" }, context);
    const replay = await executor.enqueue("ulvia.cms.collections", "apply", { target: "2.0.0" }, context);
    expect(replay).toEqual(first);
    await expectTerminal(store, first.operationId, "succeeded");
    expect(calls).toBe(1);

    await expect(
        executor.enqueue("ulvia.cms.collections", "apply", { target: "3.0.0" }, context),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const nextRelease = await executor.enqueue(
        "ulvia.cms.collections",
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
        contractId: "ulvia.cms.collections",
        capabilityId: "resume",
        idempotencyKey: "resume-1",
        inputDigest: `sha256:${"0".repeat(64)}`,
        input: { id: "migration-1" },
        context: { ...context, idempotencyKey: "resume-1" },
        status: "running",
        revision: 2,
        createdAt: "2026-10-06T10:00:00.000Z",
        updatedAt: "2026-10-06T10:00:00.000Z",
        lease: { token: "dead-worker", expiresAt: "2026-10-06T10:00:01.000Z" },
    });
    const executor = new ProviderOperationExecutor(store, () => new Date("2026-10-06T10:01:00.000Z"));
    executor.register("ulvia.cms.collections", "resume", async () => {
        throw new Error("boom");
    });

    await executor.recover();
    const record = await expectTerminal(store, "00000000-0000-7000-8000-000000000010", "failed");
    expect(record.errorCode).toBe("OPERATION_FAILED");
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
    executor.register("ulvia.cms.collections", "apply", async (_input, _context, execution) => {
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

    const queued = await executor.enqueue("ulvia.cms.collections", "apply", {}, context);
    for (let attempt = 0; attempt < 50 && !aborted; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(aborted).toBe(true);
    expect((await store.get("default", queued.operationId))?.status).toBe("running");
});

test("the jobs contract exposes a completed result only from its detail query", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    executor.register("ulvia.cms.collections", "apply", async () => ({ migrationId: "migration-1" }));
    const queued = await executor.enqueue("ulvia.cms.collections", "apply", {}, context);
    await expectTerminal(store, queued.operationId, "succeeded");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerJobCapabilities(dispatcher, executor);

    const detail = await dispatcher.invoke("ulvia.cms.jobs", "get", { jobId: queued.operationId }, context);
    expect(JSON.parse(String(detail.resultJson))).toEqual({ migrationId: "migration-1" });
    const listed = await dispatcher.invoke("ulvia.cms.jobs", "list", {}, context);
    expect(listed.items[0]).not.toHaveProperty("resultJson");
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
