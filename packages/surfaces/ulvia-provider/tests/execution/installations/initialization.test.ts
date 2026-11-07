import { expect, spyOn, test } from "bun:test";
import { installationHost, digest } from "./host";
const input = { root: null, planDigest: digest };
test("SDK initialization resolves the verified subject alias and checks current administrator authority before service calls", async () => {
    const f = await installationHost();
    try {
        const response = await f.call("initialization.plan", { root: null });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ planDigest: digest });
        expect(f.state.calls).toEqual([{ name: "plan", actorId: "local:admin" }]);
        f.state.administratorEnabled = false;
        expect((await f.call("initialization.plan", { root: null })).status).toBe(403);
        expect(f.state.calls).toHaveLength(1);
    } finally {
        await f.executor.stop();
    }
});
test("SDK initialization refuses missing identity, member, foreign instance and machine callers without queueing or business writes", async () => {
    const f = await installationHost();
    try {
        for (const claims of [
            { subjectId: undefined, actorKind: "anonymous" as const },
            { subjectId: "member-a" },
            { sourceInstallationId: "provider-b", rootRequestId: crypto.randomUUID() },
            { systemServiceId: "cms-gateway", subjectId: undefined, actorKind: undefined },
        ]) {
            expect((await f.call("initialization.apply", input, { claims })).status).toBe(403);
        }
        expect((await f.call("initialization.apply", input, { claims: { instanceId: "instance-b" } })).status).toBe(
            401,
        );
        expect((await f.call("initialization.apply", { ...input, planDigest: "invalid" })).status).toBe(422);
        expect(f.store.receipts).toBe(0);
        expect(f.state.calls).toEqual([]);
        const entry = await f.call(
            "initialization.entry",
            {},
            { claims: { subjectId: undefined, actorKind: "anonymous" } },
        );
        expect(entry.status).toBe(200);
        expect(await entry.json()).toEqual({ pending: true });
    } finally {
        await f.executor.stop();
    }
});
test("recovered SDK initialization reauthorizes before execution and denied retries cannot read a durable receipt", async () => {
    const f = await installationHost();
    try {
        const response = await f.call("initialization.apply", input);
        expect(response.status).toBe(202);
        const handle = await response.json();
        expect(f.store.receipts).toBe(1);
        expect(f.state.calls).toEqual([]);
        f.state.administratorEnabled = false;
        expect((await f.call("initialization.apply", input)).status).toBe(403);
        expect(f.store.receipts).toBe(1);
        f.store.held = false;
        await f.executor.recover();
        const record = await f.store.get("site-a", handle.operationId);
        expect(record).toMatchObject({ status: "failed", errorCode: "FORBIDDEN" });
        expect(f.state.calls).toEqual([]);
        f.state.administratorEnabled = true;
        const latest = spyOn(f.store, "latest");
        const status = await f.call("initialization.status");
        expect(status.status).toBe(200);
        expect(latest.mock.calls).toEqual([["site-a", "ulvia/cms.installations", "initialization.apply"]]);
        expect(await status.json()).toMatchObject({ operationId: handle.operationId, operationStatus: "failed" });
    } finally {
        await f.executor.stop();
    }
});
test("the SDK initialization worker returns a validated terminal DTO through the ordinary durable queue", async () => {
    const f = await installationHost();
    try {
        const { operationId } = await (await f.call("initialization.apply", input)).json();
        f.store.held = false;
        await f.executor.recover();
        const record = await f.store.get("site-a", operationId);
        expect(record).toMatchObject({ status: "succeeded", result: { status: "completed", totalPages: 0 } });
        expect(f.state.calls).toEqual([{ name: "initialize", actorId: "local:admin" }]);
        const latest = spyOn(f.store, "latest");
        expect(await (await f.call("initialization.status")).json()).toMatchObject({
            status: "completed",
            operationStatus: "none",
        });
        expect(latest).not.toHaveBeenCalled();
    } finally {
        await f.executor.stop();
    }
});
