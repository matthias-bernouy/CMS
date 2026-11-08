import { expect, test } from "bun:test";
import { operationFixture } from "./fixture";

test("SDK terminal execution survives host recreation and guarded replays never access a second receipt", async () => {
    const first = await operationFixture();
    let second: Awaited<ReturnType<typeof operationFixture>> | undefined;
    try {
        const response = await first.call({
            path: "/review/jobs",
            headers: { "accept-language": "fr", "x-ulvia-binding-id": "primary" },
        });
        expect(response.status).toBe(202);
        const { operationId } = await response.json();
        const queued = (await first.store.get("site-a", operationId))!;
        expect(queued.status).toBe("queued");
        expect(queued.context.invocation?.bindingId).toBe("review");
        expect(queued.context).not.toHaveProperty("http");
        expect(queued.context).not.toHaveProperty("signal");
        expect(first.control.calls).toEqual([]);
        expect(first.store.lookups).toBe(1);
        first.control.allowed = false;
        const denied = await first.call({ path: "/review/jobs" });
        expect(denied.status).toBe(422);
        expect(await denied.text()).not.toContain("private-authorization-detail");
        expect(first.store.lookups).toBe(1);
        first.control.allowed = true;
        await first.executor.stop();
        second = await operationFixture({ store: first.store, control: first.control });
        second.store.held = false;
        expect(await second.executor.recover()).toBe(1);
        expect((await second.store.get("site-a", operationId))?.result).toEqual({ marker: "1.0.0" });
        expect(second.control.calls).toEqual(["1.0.0"]);
        expect((await second.call()).status).toBe(202);
        expect(second.store.lookups).toBe(2);
        expect(second.control.calls).toEqual(["1.0.0"]);
        second.control.allowed = false;
        expect((await second.call()).status).toBe(409);
        expect(second.store.lookups).toBe(2);
    } finally {
        await first.executor.stop();
        await second?.executor.stop();
    }
});

test("SDK rechecks a queued operation guard before a recovered business mutation", async () => {
    const f = await operationFixture();
    try {
        const { operationId } = await (await f.call()).json();
        f.control.allowed = false;
        f.store.held = false;
        await f.executor.recover();
        const failed = (await f.store.get("site-a", operationId))!;
        expect(failed.status).toBe("failed");
        expect(failed.errorCode).toBe("REFUSED");
        expect(f.control.calls).toEqual([]);
        expect(JSON.stringify(failed)).not.toContain("private-authorization-detail");
    } finally {
        await f.executor.stop();
    }
});

test("recovered SDK failures use the original admitted binding and request language", async () => {
    const f = await operationFixture();
    try {
        const { operationId } = await (
            await f.call({ path: "/review/jobs", headers: { "accept-language": "fr" } })
        ).json();
        f.control.fail = true;
        f.store.held = false;
        await f.executor.recover();
        const failed = (await f.store.get("site-a", operationId))!;
        expect(failed.status).toBe("failed");
        expect(failed.errorCode).toBe("REFUSED");
        expect(failed.errorOutput).toEqual({ message: "Refus public." });
        expect(failed.errorContentLanguage).toBe("fr");
        expect(f.presentations).toEqual([422]);
        expect(JSON.stringify(failed)).not.toContain("private-business-detail");
    } finally {
        await f.executor.stop();
    }
});

test("mounted operation ports retain the captured enqueue identity", async () => {
    const f = await operationFixture();
    try {
        f.operations.enqueue = async () => {
            throw new Error("Mutated port must not replace the mounted callback");
        };
        expect((await f.call()).status).toBe(202);
        expect(f.store.lookups).toBe(1);
        expect(f.control.calls).toEqual([]);
    } finally {
        await f.executor.stop();
    }
});
