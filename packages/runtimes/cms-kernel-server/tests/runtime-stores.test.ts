import { describe, expect, test } from "bun:test";
import { createKernelStores } from "../src/runtime/stores/kernelStores";

describe("production runtime stores", () => {
    test("does not compose Provider-owned file services", async () => {
        const source = await Bun.file(new URL("../src/runtime/stores/kernelStores.ts", import.meta.url)).text();
        expect(source).not.toContain("CmsFilesService");
        expect(source).not.toContain("MongoCmsFilesStore");
    });

    test("rejects an invalid Mongo connection string before initializing stores", async () => {
        const env = {
            KERNEL_PUBLIC_URL: "https://www.example.test",
            CMS_SESSION_SECRET: "session-secret",
            CMS_KEK: { activeKeyId: "legacy", keysHex: { legacy: "00".repeat(32) }, rotateOnStart: false },
            CMS_FILES_DIR: "/data/files",
            MONGO_URL: "not-a-mongodb-url",
            CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: 100,
        };

        await expect(createKernelStores(env)).rejects.toThrow(/Invalid scheme/);
    });
});
