import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/files";
import { InMemoryCmsFilesStore } from "@bernouy/files/memory";
import { readFile } from "files/capabilities/files/access/read";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { fixture } from "../../../../tests/integration/gateway/providers/context/fixture";

test("Files executor preserves HEAD and conditional outcomes through the full signed Gateway exchange without resolving cookies", async () => {
    const f = await fixture(false, { binary: true });
    const store = new InMemoryCmsFilesStore();
    const blobs = new MemoryBlobStore();
    let gets = 0;
    let heads = 0;
    const get = blobs.get.bind(blobs);
    const head = blobs.head.bind(blobs);
    blobs.get = (...args) => {
        gets++;
        return get(...args);
    };
    blobs.head = (...args) => {
        heads++;
        return head(...args);
    };
    const generation = "a".repeat(64);
    await store.putFile({
        id: "one",
        generation,
        namespaceId: "namespace",
        name: "hello.txt",
        blobKey: "one",
        size: 5,
        contentHash: generation,
        generationNumber: 1,
        mimeType: "text/plain",
        visibility: "public",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    await blobs.put("one", new TextEncoder().encode("hello"));
    const files = new CmsFilesService({
        store,
        blobs,
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://site.test",
    });
    f.dispatcher.register("ulvia/catalog", "item.list", async (input, context) =>
        readFile.execute({
            input: { fileId: String(input.fileId), generation },
            services: { files } as never,
            context,
            fail: () => {
                throw new Error("unexpected capability failure");
            },
        }),
    );
    f.mount();
    const handler = createCapabilityHttpHandler({
        siteId: "site-a",
        basePath: "",
        invoker: f.gateway,
        resolveActor: async () => {
            throw new Error("public Files reads must not resolve a cookie");
        },
    });
    for (const method of ["GET", "HEAD"]) {
        const response = await handler(
            new Request("https://site.test/.cms/call/ulvia/catalog/v1/files/one", {
                method,
                headers: { cookie: "session=present" },
            }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-length")).toBe("5");
        expect(await response.text()).toBe(method === "HEAD" ? "" : "hello");
        const conditional = await handler(
            new Request("https://site.test/.cms/call/ulvia/catalog/v1/files/one", {
                method,
                headers: { "if-none-match": `W/"${generation}"` },
            }),
        );
        expect(conditional.status).toBe(304);
        expect(conditional.headers.get("etag")).toBe(`"${generation}"`);
        expect(await conditional.text()).toBe("");
    }
    expect(gets).toBe(1);
    expect(heads).toBe(3);
    expect(f.wireHeaders).toHaveLength(4);
});
