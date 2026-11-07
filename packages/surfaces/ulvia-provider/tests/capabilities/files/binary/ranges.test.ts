import { expect, test } from "bun:test";
import { filesFixture } from "../fixture";

test("Files preserves 200/206 streaming headers, Range failures and If-Range fallback", async () => {
    const f = await filesFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Assets", defaultVisibility: "public" });
        const file = await f.upload(namespace);
        const identity = { fileId: file.fileId, generation: file.generation };
        const full = await f.call("files.read", identity);
        expect(full.status).toBe(200);
        expect(full.headers.get("content-length")).toBe("5");
        expect(full.headers.get("cache-control")).toContain("immutable");
        expect(full.headers.get("content-disposition")).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.txt");
        const etag = full.headers.get("etag")!;
        expect(await full.text()).toBe("hello");
        const partial = await f.call("files.read", { ...identity, range: "bytes=1-3", ifRange: etag });
        expect(partial.status).toBe(206);
        expect(partial.headers.get("content-range")).toBe("bytes 1-3/5");
        expect(partial.headers.get("content-length")).toBe("3");
        expect(partial.headers.get("accept-ranges")).toBe("bytes");
        expect(await partial.text()).toBe("ell");
        const fallback = await f.call("files.read", { ...identity, range: "bytes=1-3", ifRange: '"old-generation"' });
        expect(fallback.status).toBe(200);
        expect(await fallback.text()).toBe("hello");
        const before = { ...f.counts };
        const invalid = await f.call("files.read", { ...identity, range: "bytes=10-20" });
        expect(invalid.status).toBe(416);
        expect(invalid.headers.get("content-range")).toBe("bytes */5");
        expect(await invalid.text()).not.toContain(file.fileId);
        expect(f.counts.blobReads).toBe(before.blobReads);
    } finally {
        f.close();
    }
});
