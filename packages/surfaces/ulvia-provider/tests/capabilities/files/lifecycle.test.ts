import { expect, test } from "bun:test";
import { filesFixture } from "./fixture";

test("signed HTTP Files capabilities preserve the complete namespace and immutable file lifecycle", async () => {
    const f = await filesFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Assets", defaultVisibility: "public" });
        const credentials = { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey };
        const details = await f.invoke("namespace.get", credentials);
        expect(details).toMatchObject({ id: namespace.namespaceId, name: "Assets" });
        expect(Object.keys(details).sort()).toEqual(["createdAt", "defaultVisibility", "id", "name", "quota"]);
        expect((await f.store.getNamespace(namespace.namespaceId))?.createdBy).toEqual({
            kind: "administrator",
            id: "admin-a",
        });
        const key = await f.invoke("namespace.keys.create", {
            ...credentials,
            permissions: ["files.read"],
            expiresAt: null,
        });
        const rotated = await f.invoke("namespace.keys.rotate", { ...credentials, keyId: key.keyId });
        await f.invoke("namespace.keys.revoke", { ...credentials, keyId: rotated.keyId });
        const file = await f.upload(credentials);
        const identity = { fileId: file.fileId, generation: file.generation };
        expect(await f.invoke("files.get", { ...credentials, fileId: file.fileId })).toEqual(file);
        const renamed = await f.invoke("files.update", { ...credentials, fileId: file.fileId, name: "renamed.txt" });
        expect(renamed).toMatchObject({ ...identity, name: "renamed.txt" });
        await f.invoke("files.make-private", { ...credentials, fileId: file.fileId });
        expect((await f.call("files.read", identity)).status).toBe(403);
        const signed = await f.invoke("files.sign", { ...credentials, ...identity, operation: "read", expiresIn: 60 });
        const access = new URL(signed.url).searchParams.get("access")!;
        const read = await f.call("files.read", { ...identity, access });
        expect(read.status).toBe(200);
        expect(await read.text()).toBe("hello");
        expect(await f.invoke("representations.list", { ...identity, access })).toMatchObject({ representations: [] });
        expect(await f.invoke("representations.sign", { ...credentials, ...identity, expiresIn: 60 })).toMatchObject({
            representations: [],
        });
        await f.invoke("files.publish", { ...credentials, fileId: file.fileId });
        const publicRead = await f.call("files.read", identity);
        expect(publicRead.status).toBe(200);
        await publicRead.body?.cancel();
        const before = { ...f.counts };
        expect(await f.invoke("files.list", { ...credentials, offset: 0, limit: 1 })).toMatchObject({
            items: [{ ...identity }],
            offset: 0,
            limit: 1,
        });
        expect(f.counts.listCalls - before.listCalls).toBe(1);
        expect(f.counts.loaded - before.loaded).toBe(1);
        expect(f.counts.blobReads).toBe(before.blobReads);
        expect(f.counts.keyReads - before.keyReads).toBe(1);
        await f.invoke("files.delete", { ...credentials, fileId: file.fileId });
        expect((await f.invoke("files.list", credentials)).items).toEqual([]);
        await f.invoke("namespace.delete", credentials);
        expect(await f.store.getNamespace(namespace.namespaceId)).toBeNull();
    } finally {
        f.close();
    }
});
