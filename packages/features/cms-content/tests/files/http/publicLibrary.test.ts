import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";
import {
    createOriginalBlobReader,
    createPublicFileMetadataLookup,
    serveFilesRequest,
} from "@bernouy/cms-content/files/serving";

for (const reference of ["draft-only", "unreferenced"]) {
    test(`public author library retains ${reference} media by ID and path`, async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const file = await metadata.createFile({
            name: "announcement.txt",
            parentId: null,
            mimeType: "text/plain",
            size: 5,
        });
        await blob.put(file.id, new TextEncoder().encode("media"));
        const repository = new InMemoryCmsRepository();
        if (reference === "draft-only") {
            await repository.insertPage("/draft", "Draft", `<img src="/.cms/files/by-id/${file.id}">`);
            expect((await repository.getPage("/draft"))?.visible).toBe(false);
        }
        const deps = { metadata: createPublicFileMetadataLookup(metadata), blob: createOriginalBlobReader(blob) };
        for (const path of [`by-id/${file.id}`, file.name]) {
            const response = await serveFilesRequest(deps, new Request(`https://example.test/.cms/files/${path}`), {
                prefix: "/.cms/files",
            });
            expect(response.status).toBe(200);
            expect(await response.text()).toBe("media");
        }
        const result = await deps.metadata.getItem(file.id);
        result!.name = "consumer mutation";
        expect((await metadata.getItem(file.id))?.name).toBe("announcement.txt");
    });
}
