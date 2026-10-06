import { expect, test } from "bun:test";
import type { CoreCapabilityInvocationContext } from "@bernouy/cms-content";
import { CoreOperationExecutor } from "../src/runtime/core-operations/CoreOperationExecutor";
import { MemoryCoreOperationStore } from "../src/runtime/core-operations/MemoryCoreOperationStore";

const context: CoreCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "default",
    installationId: "official",
    origin: "control",
    actorKind: "administrator",
    providerSubjectId: "00000000-0000-4000-8000-000000000002",
    idempotencyKey: "migration-1",
};

test("Core operations deduplicate the same input and reject a changed replay", async () => {
    const store = new MemoryCoreOperationStore();
    const executor = new CoreOperationExecutor(store);
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
});

test("Core operation recovery reclaims an expired lease and records failures", async () => {
    const store = new MemoryCoreOperationStore();
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
    const executor = new CoreOperationExecutor(store, () => new Date("2026-10-06T10:01:00.000Z"));
    executor.register("ulvia.cms.collections", "resume", async () => {
        throw new Error("boom");
    });

    await executor.recover();
    const record = await expectTerminal(store, "00000000-0000-7000-8000-000000000010", "failed");
    expect(record.errorCode).toBe("OPERATION_FAILED");
});

async function expectTerminal(store: MemoryCoreOperationStore, id: string, status: "succeeded" | "failed") {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const record = await store.get("default", id);
        if (record?.status === status) {
            return record;
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Operation ${id} did not reach ${status}`);
}
