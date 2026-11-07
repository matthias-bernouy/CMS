import { expect, test } from "bun:test";
import { filesFixture } from "../fixture";

test("Files signs and streams image representations with their own Range bounds", async () => {
    const f = await filesFixture();
    try {
        const ns = await f.invoke("namespace.create", { name: "Images", defaultVisibility: "private" });
        const keys = { namespaceId: ns.namespaceId, namespaceKey: ns.namespaceKey };
        const file = await f.upload(keys);
        const identity = { fileId: file.fileId, generation: file.generation };
        const original = (await f.store.getFile(file.fileId, file.generation))!;
        await f.blobs.put("derivative/test", new Uint8Array([1, 2, 3, 4]));
        await f.store.putFile({
            ...original,
            width: 100,
            height: 100,
            variants: [
                {
                    profile: "thumbnail",
                    width: 32,
                    height: 32,
                    mimeType: "image/webp",
                    size: 4,
                    blobKey: "derivative/test",
                },
            ],
        });
        const variants = await f.invoke("representations.list", { ...identity, namespaceKey: ns.namespaceKey });
        expect(variants.representations).toHaveLength(1);
        const denied = await f.call("representations.read", { ...identity, profile: "thumbnail", width: 32 });
        expect(denied.status).toBe(403);
        const signed = await f.invoke("representations.sign", { ...keys, ...identity, expiresIn: 60 });
        const access = new URL(signed.representations[0]!.url).searchParams.get("access")!;
        const response = await f.call("representations.read", {
            ...identity,
            profile: "thumbnail",
            width: 32,
            access,
            range: "bytes=1-2",
        });
        expect(response.status).toBe(206);
        expect(response.headers.get("content-type")).toBe("image/webp");
        expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([2, 3]));
        const invalid = await f.call("representations.read", {
            ...identity,
            profile: "thumbnail",
            width: 32,
            access,
            range: "bytes=10-20",
        });
        expect(invalid.status).toBe(416);
        expect(invalid.headers.get("content-range")).toBe("bytes */4");
    } finally {
        f.close();
    }
});
