import { expect, test } from "bun:test";
import { durableSecrets } from "./fixture";

test("Secrets creation replays across executor recreation and revoked namespace keys cannot read its receipt", async () => {
    const f = await durableSecrets();
    const input = { ...f.credentials, name: "token", value: "private-secret-value" };
    const before = { ...f.counts };
    const first = await (await f.mount())("secrets.create", input, "create-1");
    const replay = await (await f.mount())("secrets.create", input, "create-1");
    expect(replay).toEqual(first);
    expect(f.counts.writes - before.writes).toBe(1);
    expect(f.counts.credentials - before.credentials).toBe(3);
    expect(f.receipts.calls).toEqual({ insert: 2, find: 1, update: 1, retained: 0 });
    const stored = JSON.stringify([...f.receipts.documents.values()]);
    expect(stored).not.toContain(input.value);
    expect(stored).not.toContain(input.namespaceKey);
    await f.revoke();
    const calls = { ...f.receipts.calls };
    await expect((await f.mount())("secrets.create", input, "create-1")).rejects.toMatchObject({
        code: "NOT_AUTHORIZED",
        status: 403,
    });
    expect(f.receipts.calls).toEqual(calls);
    expect(JSON.stringify([...f.receipts.documents.values()])).toBe(stored);
    expect(f.counts.writes - before.writes).toBe(1);
});

test("Secrets rotation replays its exact metadata without persisting old or replacement values", async () => {
    const f = await durableSecrets();
    const created = await f.service.create(
        f.namespace.namespaceId,
        f.namespace.namespaceKey,
        "token",
        "old-private-value",
    );
    const input = { ...f.credentials, secretId: created.secretId, expectedVersion: 1, value: "new-private-value" };
    const before = { ...f.counts };
    const first = await (await f.mount())("secrets.rotate", input, "rotate-1");
    const replay = await (await f.mount())("secrets.rotate", input, "rotate-1");
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ version: 2 });
    expect(f.counts.writes - before.writes).toBe(1);
    expect(f.counts.credentials - before.credentials).toBe(3);
    expect(f.receipts.calls).toEqual({ insert: 2, find: 1, update: 1, retained: 0 });
    const stored = JSON.stringify([...f.receipts.documents.values()]);
    for (const privateValue of ["old-private-value", "new-private-value", input.namespaceKey]) {
        expect(stored).not.toContain(privateValue);
    }
    const calls = { ...f.receipts.calls };
    await f.revoke();
    await expect((await f.mount())("secrets.rotate", input, "rotate-1")).rejects.toMatchObject({
        code: "NOT_AUTHORIZED",
        status: 403,
    });
    expect(f.receipts.calls).toEqual(calls);
    expect(f.counts.writes - before.writes).toBe(1);
});

test("expired or foreign namespace credentials refuse before receipt access and changed inputs cannot reuse a key", async () => {
    const f = await durableSecrets();
    const input = { ...f.credentials, name: "token", value: "private-secret-value" };
    const call = await f.mount();
    await call("secrets.create", input, "create-1");
    const stored = JSON.stringify([...f.receipts.documents.values()]);
    const writes = f.counts.writes;
    await expect(call("secrets.create", { ...input, value: "changed" }, "create-1")).rejects.toMatchObject({
        code: "INVALID_INPUT",
        status: 422,
    });
    expect(f.counts.writes).toBe(writes);
    const other = await f.service.createNamespace({
        name: "Other",
        createdBy: { kind: "administrator", id: "admin-a" },
    });
    const before = { ...f.receipts.calls };
    await expect(
        call("secrets.create", { ...input, namespaceId: other.namespaceId }, "create-1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(f.receipts.calls).toEqual(before);
    f.expire();
    await expect(call("secrets.create", input, "create-1")).rejects.toMatchObject({
        code: "NOT_AUTHORIZED",
        status: 403,
    });
    expect(f.receipts.calls).toEqual(before);
    expect(JSON.stringify([...f.receipts.documents.values()])).toBe(stored);
    expect(f.counts.writes).toBe(writes);
});
