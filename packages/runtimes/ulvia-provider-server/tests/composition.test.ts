import { expect, test } from "bun:test";

test("the Provider composes only Provider-owned runtime services", async () => {
    const [entrypoint, stores] = await Promise.all([
        Bun.file(new URL("../src/index.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/runtime/stores/providerStores.ts", import.meta.url)).text(),
    ]);

    expect(entrypoint).not.toContain("cms-kernel-server");
    expect(entrypoint).not.toContain("cms-instance-runtime");
    expect(stores).not.toContain("MongoAuthTokenStore");
    expect(stores).not.toContain("MongoRateLimiter");
    expect(stores).not.toContain("sitemap");
    expect(stores).toContain("CmsFilesService");
});
