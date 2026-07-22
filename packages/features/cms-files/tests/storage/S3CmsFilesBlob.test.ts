import { describe, expect, test } from "bun:test";
import { S3CmsFilesBlob } from "@bernouy/cms-files/s3";

const bytes = new TextEncoder().encode("content");

describe("S3CmsFilesBlob", () => {
    test("rejects empty and traversal-like keys before contacting object storage", async () => {
        const store = new S3CmsFilesBlob({
            bucket: "cms-files",
            accessKeyId: "test-access-key",
            secretAccessKey: "test-secret-key",
            endpoint: "https://s3.example.test",
            prefix: "tenant/",
        });

        await expect(store.put("", bytes)).rejects.toThrow('invalid blob key ""');
        await expect(store.get("../secret")).rejects.toThrow("invalid blob key");
        await expect(store.delete("folder/../../secret")).rejects.toThrow("invalid blob key");
        await expect(store.exists("file..backup")).rejects.toThrow("invalid blob key");
    });
});
