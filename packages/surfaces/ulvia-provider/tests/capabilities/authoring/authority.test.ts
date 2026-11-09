import { expect, test } from "bun:test";
import { MemoryProviderOperationStore, ProviderOperationExecutor } from "@bernouy/ulvia-provider";
import { authoringTransport } from "./transport";

class HeldStore extends MemoryProviderOperationStore {
    held = true;
    override async claim(...args: Parameters<MemoryProviderOperationStore["claim"]>) {
        return this.held ? false : super.claim(...args);
    }
}

test("durable Authoring publication checks current administrator authority before queueing and on recovery", async () => {
    const store = new HeldStore();
    const first = new ProviderOperationExecutor(store);
    const recovered = new ProviderOperationExecutor(store);
    let enabled = false;
    let calls = 0;
    const service = {
        publish: async () => {
            calls++;
            throw new Error("Publication must not execute");
        },
    };
    const administrator = async () => enabled;
    try {
        const { call } = await authoringTransport(service, { operations: first, administrator });
        const input = { preparationId: crypto.randomUUID(), expectedDigest: `sha256:${"a".repeat(64)}` };
        const options = { headers: { "idempotency-key": "reviewed-publication" } };
        expect((await call("publish-collection-operation", input, options)).status).toBe(403);
        expect((await store.list("default", "ulvia/cms.authoring", undefined, 20)).items).toHaveLength(0);
        enabled = true;
        const response = await call("publish-collection-operation", input, options);
        expect(response.status).toBe(202);
        const { operationId } = await response.json();
        await first.stop();
        enabled = false;
        store.held = false;
        const resumed = await authoringTransport(service, { operations: recovered, administrator });
        await recovered.recover();
        expect((await store.get("default", operationId))?.status).toBe("failed");
        expect((await store.get("default", operationId))?.errorCode).toBe("FORBIDDEN");
        expect(calls).toBe(0);
        expect((await resumed.call("get-publication-operation", { ...input, operationId })).status).toBe(403);
        enabled = true;
        const status = await resumed.call("get-publication-operation", { ...input, operationId });
        expect(status.status).toBe(200);
        const detail = await status.json();
        expect(detail).toMatchObject({ status: "failed", errorCode: "FORBIDDEN" });
        expect(typeof detail.errorOutput.message).toBe("string");
        expect(detail).not.toHaveProperty("input");
    } finally {
        await first.stop();
        await recovered.stop();
    }
});
