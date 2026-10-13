import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { CmsFileWorkspace } from "../src/runtime/stores/CmsFileWorkspace";

test("the managed file workspace persists its namespace authority without exposing it", async () => {
    const files = new CmsFilesService({
        store: new InMemoryCmsFilesStore(),
        blobs: new MemoryBlobStore(),
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://cms.example/site",
    });
    const secrets = new InMemorySecretStore();
    const first = new CmsFileWorkspace(files, secrets);
    const initial = await first.get({ limit: 10 });
    const upload = await first.createUpload({ filename: "asset.txt", size: 5 });
    await files.writeUpload(upload.uploadId, upload.uploadToken, new Blob(["hello"]).stream());
    const reference = await first.completeUpload(upload.uploadId);
    const renamed = await first.updateFile(reference.fileId, "renamed.txt");
    const published = await first.setFileVisibility(reference.fileId, "public");
    const privateFile = await first.setFileVisibility(reference.fileId, "private");
    const signed = await first.signFile(reference.fileId, privateFile.generation, 60);

    const resumed = new CmsFileWorkspace(files, secrets);
    const restored = await resumed.get({ limit: 10 });

    expect(restored.namespace.id).toBe(initial.namespace.id);
    expect(renamed.name).toBe("renamed.txt");
    expect(published.visibility).toBe("public");
    expect(restored.items).toMatchObject([{ fileId: reference.fileId, name: "renamed.txt", visibility: "private" }]);
    expect(new URL(signed.url).searchParams.has("access")).toBe(true);
    expect(JSON.stringify(restored)).not.toContain("namespaceKey");
    expect(await secrets.get("CMS_FILES_WORKSPACE")).toContain(initial.namespace.id);

    await resumed.deleteFile(reference.fileId);
    expect((await resumed.get({ limit: 10 })).items).toEqual([]);
});
