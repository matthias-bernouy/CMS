import { expect, test } from "bun:test";
import { filesFixture } from "./fixture";

test("Files rejects unauthenticated, non-administrator and cross-instance changes before touching storage", async () => {
    const f = await filesFixture();
    try {
        const input = { name: "Private", defaultVisibility: "private" };
        const before = { ...f.counts };
        for (const [options, status] of [
            [{ authenticated: false }, 401],
            [{ claims: { actorKind: "user" } }, 403],
            [{ claims: { instanceId: "instance-b" } }, 401],
        ] as const) {
            const response = await f.call("namespace.create", input, options);
            expect(response.status).toBe(status);
            await response.body?.cancel();
        }
        expect(f.counts).toEqual(before);
    } finally {
        f.close();
    }
});

test("invalid, expired, revoked and foreign namespace credentials cannot mutate Files or read bytes", async () => {
    const f = await filesFixture();
    try {
        const first = await f.invoke("namespace.create", { name: "First", defaultVisibility: "private" });
        const other = await f.invoke("namespace.create", { name: "Other", defaultVisibility: "private" });
        const credentials = { namespaceId: first.namespaceId, namespaceKey: first.namespaceKey };
        const file = await f.upload(credentials);
        const readOnly = await f.invoke("namespace.keys.create", { ...credentials, permissions: ["files.read"] });
        const revoked = await f.invoke("namespace.keys.create", { ...credentials, permissions: ["files.write"] });
        await f.invoke("namespace.keys.revoke", { ...credentials, keyId: revoked.keyId });
        const expired = await f.invoke("namespace.keys.create", { ...credentials, permissions: ["files.write"] });
        const record = (await f.store.getKey(expired.keyId))!;
        await f.store.putKey({ ...record, expiresAt: "2026-11-06T00:00:00Z" });
        const before = { ...f.counts };
        for (const [namespaceId, namespaceKey, status] of [
            [first.namespaceId, readOnly.namespaceKey, 403],
            [first.namespaceId, revoked.namespaceKey, 403],
            [first.namespaceId, expired.namespaceKey, 403],
            [other.namespaceId, first.namespaceKey, 404],
        ] as const) {
            const response = await f.call("files.update", {
                namespaceId,
                namespaceKey,
                fileId: file.fileId,
                name: "changed.txt",
            });
            expect(response.status).toBe(status);
            expect(await response.text()).not.toContain(namespaceKey);
        }
        for (const input of [
            { name: "", defaultVisibility: "private" },
            { name: "A", defaultVisibility: "shared" },
            { name: "A", defaultVisibility: "private", extra: true },
        ]) {
            expect((await f.call("namespace.create", input)).status).toBe(400);
        }
        expect(f.counts.mutations).toBe(before.mutations);
        expect(f.counts.blobWrites).toBe(before.blobWrites);
        expect(f.counts.blobReads).toBe(before.blobReads);
        expect((await f.invoke("files.get", { ...credentials, fileId: file.fileId })).name).toBe(file.name);
    } finally {
        f.close();
    }
});

test("unexpected Files failures retain a private cause and expose only the declared localized error", async () => {
    const failure = new Error("private-blob-store-password");
    const f = await filesFixture({
        service: (service) =>
            new Proxy(service, {
                get(target, key, receiver) {
                    return key === "createNamespace"
                        ? async () => {
                              throw failure;
                          }
                        : Reflect.get(target, key, receiver);
                },
            }),
    });
    try {
        const response = await f.call(
            "namespace.create",
            { name: "Assets", defaultVisibility: "private" },
            { language: "fr" },
        );
        expect(response.status).toBe(503);
        expect(response.headers.get("content-language")).toBe("fr");
        expect(await response.text()).not.toContain(failure.message);
    } finally {
        f.close();
    }
});

test("a valid Files namespace key cannot delete another namespace's generations", async () => {
    const f = await filesFixture();
    try {
        const owner = await f.invoke("namespace.create", { name: "Owner", defaultVisibility: "private" });
        const foreign = await f.invoke("namespace.create", { name: "Foreign", defaultVisibility: "private" });
        const file = await f.upload(owner);
        const before = { ...f.counts };
        const response = await f.call("files.delete", {
            namespaceId: foreign.namespaceId,
            namespaceKey: foreign.namespaceKey,
            fileId: file.fileId,
        });
        expect(response.status).toBe(404);
        expect(f.counts.mutations).toBe(before.mutations);
        expect(f.counts.blobWrites).toBe(before.blobWrites);
        expect(await f.store.getFile(file.fileId, file.generation)).not.toBeNull();
        expect(
            (
                await f.invoke("files.get", {
                    namespaceId: owner.namespaceId,
                    namespaceKey: owner.namespaceKey,
                    fileId: file.fileId,
                })
            ).fileId,
        ).toBe(file.fileId);
    } finally {
        f.close();
    }
});
