import { describe, expect, test } from "bun:test";
import {
    deleteFileTree,
    InMemoryCmsFilesBlob,
    InMemoryCmsFilesMetadata,
    updateFileContent,
    uploadFile,
} from "@bernouy/cms-files";

const file = (name: string, content: string, type = "text/plain") =>
    new File([content], name, { type });

describe("files core failure boundaries", () => {
    test.failing("preserves a pre-existing file when replacement blob storage fails", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null, "stable-id");
        const before = await metadata.getItem(existing.id);

        blob.put = async () => {
            throw new Error("blob unavailable");
        };

        await expect(uploadFile(
            metadata,
            blob,
            file("replacement.txt", "NEW"),
            null,
            existing.id,
        )).rejects.toThrow();

        expect(await metadata.getItem(existing.id)).toEqual(before);
        expect(await readBlobText(blob, existing.id)).toBe("OLD");
    });

    test.failing("keeps published bytes aligned when the metadata update fails", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null);
        const before = await metadata.getItem(existing.id);

        metadata.updateFileContent = async () => {
            throw new Error("metadata unavailable");
        };

        await expect(updateFileContent(
            metadata,
            blob,
            existing.id,
            file("stable.txt", "NEW"),
        )).rejects.toThrow("metadata unavailable");

        expect(await metadata.getItem(existing.id)).toEqual(before);
        expect(await readBlobText(blob, existing.id)).toBe("OLD");
    });

    test.failing("keeps failed physical deletion retryable", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const existing = await uploadFile(metadata, blob, file("stable.txt", "OLD"), null);
        const deleteBlob = blob.delete.bind(blob);
        let unavailable = true;

        blob.delete = async (id) => {
            if (unavailable) throw new Error("blob unavailable");
            return deleteBlob(id);
        };

        await deleteFileTree(metadata, blob, existing.id, false).catch(() => undefined);
        unavailable = false;
        await deleteFileTree(metadata, blob, existing.id, false);

        expect(await metadata.getItem(existing.id)).toBeNull();
        expect(await readBlobText(blob, existing.id)).toBeNull();
    });
});

async function readBlobText(blob: InMemoryCmsFilesBlob, id: string): Promise<string | null> {
    const stream = await blob.get(id);
    return stream ? new Response(stream).text() : null;
}
