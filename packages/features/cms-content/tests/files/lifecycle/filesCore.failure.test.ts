import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import {
    deleteFileTree,
    InMemoryCmsFileMutationJournal,
    InMemoryCmsFilesMetadata,
    recoverFileMutations,
    updateFileContent,
    uploadFile,
} from "@bernouy/cms-content/files";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });

describe("files core failure boundaries", () => {
    test("preserves a pre-existing file when replacement blob storage fails", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null, "stable-id");
        const before = await metadata.getItem(existing.id);

        blob.put = async () => {
            throw new Error("blob unavailable");
        };

        await expect(uploadFile(metadata, blob, file("replacement.txt", "NEW"), null, existing.id)).rejects.toThrow();

        expect(await metadata.getItem(existing.id)).toEqual(before);
        expect(await readBlobText(blob, existing.id)).toBe("OLD");
    });

    test("keeps published bytes aligned when the metadata update fails", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null);
        const before = await metadata.getItem(existing.id);

        metadata.commitFile = async () => {
            throw new Error("metadata unavailable");
        };

        await expect(updateFileContent(metadata, blob, existing.id, file("stable.txt", "NEW"))).rejects.toThrow(
            "metadata unavailable",
        );

        expect(await metadata.getItem(existing.id)).toEqual(before);
        expect(await readBlobText(blob, existing.id)).toBe("OLD");
    });

    test("keeps failed physical deletion retryable", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null);
        const deleteBlob = blob.delete.bind(blob);
        let unavailable = true;

        blob.delete = async (id) => {
            if (unavailable) {
                throw new Error("blob unavailable");
            }
            return deleteBlob(id);
        };

        await deleteFileTree(metadata, blob, existing.id, false).catch(() => undefined);
        unavailable = false;
        await deleteFileTree(metadata, blob, existing.id, false);

        expect(await metadata.getItem(existing.id)).toBeNull();
        expect(await readBlobText(blob, existing.id)).toBeNull();
    });

    test("startup recovery completes a byte write that crashed before its metadata commit", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const journal = new InMemoryCmsFileMutationJournal();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null, undefined, journal);
        const commitFile = metadata.commitFile.bind(metadata);
        let unavailable = true;
        metadata.commitFile = async (...args) => {
            if (unavailable) {
                throw new Error("process stopped before metadata commit");
            }
            return commitFile(...args);
        };

        await expect(
            updateFileContent(metadata, blob, existing.id, file("stable.txt", "NEW"), journal),
        ).rejects.toThrow("process stopped");
        expect(await readBlobText(blob, existing.id)).toBe("OLD");

        unavailable = false;
        await recoverFileMutations(metadata, blob, journal);
        const recovered = await metadata.getItem(existing.id);
        expect(recovered).toMatchObject({ type: "file", size: 3 });
        expect(await readBlobText(blob, recovered!.type === "file" ? recovered.blobKey! : "missing")).toBe("NEW");
        expect(await journal.list()).toEqual([]);
    });
});

async function readBlobText(blob: MemoryBlobStore, id: string): Promise<string | null> {
    const stream = await blob.get(id);
    return stream ? new Response(stream).text() : null;
}
