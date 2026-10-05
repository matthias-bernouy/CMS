import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import {
    deleteFileTree,
    InMemoryCmsFileMutationJournal,
    InMemoryCmsFilesMetadata,
    updateFileContent,
    updateFileItem,
    uploadFile,
} from "@bernouy/cms-content/files";

const file = (name: string, content: string) => new File([content], name, { type: "text/plain" });

describe("file tree concurrency", () => {
    test("recursive deletion excludes a child upload committed after its subtree snapshot", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const journal = new InMemoryCmsFileMutationJournal();
        const folder = await metadata.createFolder({ name: "deleting", parentId: null });
        const barrier = subtreeBarrier(metadata);

        const deletion = deleteFileTree(metadata, blob, folder.id, true, journal);
        await barrier.reached;
        const upload = uploadFile(metadata, blob, file("late.txt", "LATE"), folder.id, "late-id", journal);
        barrier.release();

        await deletion;
        await expect(upload).rejects.toThrow("changed while its bytes were being stored");
        expect(await metadata.getItem(folder.id)).toBeNull();
        expect(await metadata.getItem("late-id")).toBeNull();
        expect(await blob.exists("late-id")).toBeFalse();
    });

    test("recursive deletion rejects a concurrent move into the removed folder", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const journal = new InMemoryCmsFileMutationJournal();
        const folder = await metadata.createFolder({ name: "deleting", parentId: null });
        const source = await uploadFile(metadata, blob, file("source.txt", "SOURCE"), null, "source-id", journal);
        const barrier = subtreeBarrier(metadata);

        const deletion = deleteFileTree(metadata, blob, folder.id, true, journal);
        await barrier.reached;
        const move = updateFileItem(metadata, journal, source.id, { parentId: folder.id });
        barrier.release();

        await deletion;
        await expect(move).rejects.toThrow("destination folder not found");
        expect(await metadata.getItem(source.id)).toMatchObject({ parentId: null });
    });

    test("content replacement preserves a move completed while bytes are stored", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const journal = new InMemoryCmsFileMutationJournal();
        const folder = await metadata.createFolder({ name: "destination", parentId: null });
        const existing = await uploadFile(metadata, blob, file("before.txt", "OLD"), null, "moving-id", journal);
        const barrier = blobPutBarrier(blob);

        const replacement = updateFileContent(metadata, blob, existing.id, file("before.txt", "NEW"), journal);
        await barrier.reached;
        await updateFileItem(metadata, journal, existing.id, { name: "after.txt", parentId: folder.id });
        barrier.release();

        await expect(replacement).resolves.toMatchObject({ name: "after.txt", parentId: folder.id, size: 3 });
        expect(await metadata.getItem(existing.id)).toMatchObject({ name: "after.txt", parentId: folder.id });
    });
});

function subtreeBarrier(metadata: InMemoryCmsFilesMetadata): { reached: Promise<void>; release(): void } {
    const listSubtree = metadata.listSubtree.bind(metadata);
    const barrier = createBarrier();
    metadata.listSubtree = async (folderId) => {
        const items = await listSubtree(folderId);
        barrier.signal();
        await barrier.wait;
        return items;
    };
    return { reached: barrier.reached, release: barrier.release };
}

function blobPutBarrier(blob: MemoryBlobStore): { reached: Promise<void>; release(): void } {
    const put = blob.put.bind(blob);
    const barrier = createBarrier();
    blob.put = async (key, bytes) => {
        if (key.includes("/versions/")) {
            barrier.signal();
            await barrier.wait;
        }
        return put(key, bytes);
    };
    return { reached: barrier.reached, release: barrier.release };
}

function createBarrier() {
    let signal!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
        signal = resolve;
    });
    const wait = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { reached, signal, wait, release };
}
