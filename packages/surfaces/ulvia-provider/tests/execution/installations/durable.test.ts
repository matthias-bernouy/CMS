import { expect, test, spyOn } from "bun:test";
import { installationHost, digest, reference } from "./host";
const selection = { installationId: "provider-a", contractId: "ulvia/catalog", version: "1.0.0", digest };
const operations = {
    "apply-collection-upgrade": { targets: [reference], planDigest: digest },
    "resume-collection-upgrade": { upgradeId: digest },
    "apply-contract-upgrade": { selections: [selection], planDigest: digest },
    "resume-contract-upgrade": { upgradeId: digest },
};
test("official Installations derives all four durable workers and recovers exact terminal DTOs without duplicate receipts", async () => {
    const first = await installationHost();
    let recovered: Awaited<ReturnType<typeof installationHost>> | undefined;
    try {
        expect(first.workers).toHaveBeenCalledTimes(4);
        expect(first.workers.mock.calls.map(([, id]) => id).sort()).toEqual(Object.keys(operations).sort());
        const handles: Record<string, string> = {};
        for (const [id, input] of Object.entries(operations)) {
            const response = await first.call(id, input);
            expect(response.status).toBe(202);
            const handle = await response.json();
            handles[id] = handle.operationId;
            expect((await first.store.get("site-a", handle.operationId))?.context.invocation?.bindingId).toBe("http");
            expect((await first.store.get("site-a", handle.operationId))?.status).toBe("queued");
            expect(await (await first.call(id, input)).json()).toEqual(handle);
        }
        expect(first.state.calls).toEqual([]);
        expect(first.store.receipts).toBe(8);
        await first.executor.stop();
        recovered = await installationHost(first.store, first.state);
        recovered.store.held = false;
        expect(await recovered.executor.recover()).toBe(4);
        expect(recovered.state.calls).toHaveLength(4);
        const gets = spyOn(recovered.store, "get");
        for (const [id, operationId] of Object.entries(handles)) {
            gets.mockClear();
            const detail = await recovered.call("get-operation", { operationId });
            expect(detail.status).toBe(200);
            expect(gets.mock.calls).toEqual([["site-a", operationId]]);
            expect(await detail.json()).toMatchObject({
                operationId,
                status: "succeeded",
                result: {
                    upgradeId: digest,
                    status: "completed",
                    [id.includes("collection") ? "collectionRevision" : "selectionRevision"]: 2,
                },
            });
            expect(
                (await (await recovered.call(id, operations[id as keyof typeof operations])).json()).operationId,
            ).toBe(operationId);
        }
        const lists = spyOn(recovered.store, "list");
        const page = await (await recovered.call("list-operations", { limit: 1 })).json();
        expect(lists.mock.calls).toEqual([["site-a", "ulvia/cms.installations", undefined, 1]]);
        expect(page.items).toHaveLength(1);
        expect(page.items[0]).not.toHaveProperty("result");
        expect(page.items[0]).not.toHaveProperty("errorOutput");
        expect(page.nextCursor).toEqual(expect.any(String));
        expect(recovered.state.calls).toHaveLength(4);
        expect(recovered.state.calls).toContainEqual({
            name: "apply-contract",
            args: ["site-a", [{ ...selection, siteId: "site-a" }], undefined, digest],
        });
        expect(recovered.state.calls).toContainEqual({
            name: "apply-collection",
            args: ["site-a", [{ digest, repositoryId: "official" }], digest],
        });
    } finally {
        await first.executor.stop();
        await recovered?.executor.stop();
    }
});
test("official Installations authorizes signed callers before receipt access and localizes recovered failures", async () => {
    const f = await installationHost();
    try {
        for (const claims of [{ actorKind: "user" as const }, { instanceId: "other-instance" }]) {
            expect([401, 403]).toContain(
                (await f.call("resume-contract-upgrade", { upgradeId: digest }, { claims })).status,
            );
        }
        expect((await f.call("resume-contract-upgrade", { upgradeId: 42 })).status).toBe(400);
        expect(f.store.receipts).toBe(0);
        expect(f.state.calls).toEqual([]);
        const { operationId } = await (
            await f.call("resume-contract-upgrade", { upgradeId: digest }, { language: "fr" })
        ).json();
        f.state.failure = Object.assign(new Error("private storage path and credential"), { status: 409 });
        f.store.held = false;
        await f.executor.recover();
        const record = await f.store.get("site-a", operationId);
        expect(record).toMatchObject({ status: "failed", errorCode: "REVISION_CONFLICT", errorContentLanguage: "fr" });
        expect(JSON.stringify(record)).not.toContain("private storage");
        const detail = await f.call("get-operation", { operationId }, { language: "en" });
        expect(detail.headers.get("content-language")).toBe("fr");
        expect(await detail.json()).toMatchObject({ errorOutput: record!.errorOutput });
        expect(await f.store.get("other-site", operationId)).toBeNull();
        expect(
            (await f.call("get-operation", { operationId }, { claims: { instanceId: "other-instance" } })).status,
        ).toBe(401);
    } finally {
        await f.executor.stop();
    }
});
