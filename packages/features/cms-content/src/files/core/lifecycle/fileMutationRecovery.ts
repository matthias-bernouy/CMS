import type { BlobStore } from "@bernouy/blob-store";
import { sha256Hex } from "@bernouy/binary-media";
import { InMemoryCmsFileMutationJournal } from "cms-content/files/default-implementation/memory/InMemoryCmsFileMutationJournal";
import type { CmsFileMutation, CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type { CmsFilesMetadataRepository } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

const fallbackJournals = new WeakMap<object, CmsFileMutationJournal>();

export function fileMutationJournal(metadata: CmsFilesMetadataRepository): CmsFileMutationJournal {
    let journal = fallbackJournals.get(metadata);
    if (!journal) {
        journal = new InMemoryCmsFileMutationJournal();
        fallbackJournals.set(metadata, journal);
    }
    return journal;
}

export async function recoverFileMutations(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    journal: CmsFileMutationJournal,
): Promise<void> {
    for (;;) {
        const operations = await journal.list(100);
        if (operations.length === 0) {
            return;
        }
        for (const operation of operations) {
            await recoverFileMutation(metadata, blob, journal, operation);
        }
    }
}

export async function recoverFileMutation(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    journal: CmsFileMutationJournal,
    operation: CmsFileMutation,
): Promise<void> {
    if (operation.kind === "delete") {
        await metadata.deleteItems(operation.itemIds);
        for (const blobKey of operation.blobKeys) {
            await blob.delete(blobKey);
        }
        await journal.complete(operation.id);
        return;
    }

    const stored = await blob.head(operation.target.blobKey);
    if (!stored || stored.size !== operation.target.size) {
        await discardWrite(blob, journal, operation);
        return;
    }
    const stream = await blob.get(operation.target.blobKey);
    const bytes = stream ? new Uint8Array(await new Response(stream).arrayBuffer()) : null;
    if (!bytes || (await sha256Hex(bytes)) !== operation.target.contentHash) {
        await discardWrite(blob, journal, operation);
        return;
    }
    const committed = await metadata.commitFile(operation.target, operation.previousBlobKey);
    if (!committed) {
        await discardWrite(blob, journal, operation);
        return;
    }
    if (operation.previousBlobKey && operation.previousBlobKey !== operation.target.blobKey) {
        await blob.delete(operation.previousBlobKey);
    }
    await journal.complete(operation.id);
}

async function discardWrite(
    blob: BlobStore,
    journal: CmsFileMutationJournal,
    operation: Extract<CmsFileMutation, { kind: "write" }>,
): Promise<void> {
    await blob.delete(operation.target.blobKey);
    await journal.complete(operation.id);
}
