import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { createHash } from "node:crypto";
import type { CmsRepository } from "@bernouy/cms-content";
import type { TPage } from "@bernouy/cms-content";

const COLLECTION_MIGRATION_PAGE_BATCH_SIZE = 500;

/** Bounded ID-ordered scan with cursor-progress checks. */
export async function* collectionPageBatches(
    repository: Pick<CmsRepository, "scanPages">,
    batchSize = COLLECTION_MIGRATION_PAGE_BATCH_SIZE,
): AsyncGenerator<readonly TPage[]> {
    let cursor: string | undefined;
    for (;;) {
        const batch = await repository.scanPages(cursor, batchSize);
        if (!batch.pages.length) {
            if (batch.nextCursor !== undefined) {
                throw new Error("Page scan returned a cursor without pages");
            }
            return;
        }
        const ids = batch.pages.map(({ id }) => id);
        if (
            ids.some((id, index) => !id || (index > 0 && id.localeCompare(ids[index - 1]!) <= 0)) ||
            (cursor !== undefined && ids[0]!.localeCompare(cursor) <= 0)
        ) {
            throw new Error("Page scan did not return a strictly ordered batch");
        }
        yield batch.pages;
        if (batch.nextCursor === undefined) {
            return;
        }
        if (batch.nextCursor !== ids.at(-1) || batch.nextCursor === cursor) {
            throw new Error("Page scan cursor did not match the last page");
        }
        cursor = batch.nextCursor;
    }
}

export async function collectionPageRevisionDigestFromRepository(
    repository: Pick<CmsRepository, "scanPages">,
): Promise<string> {
    const hash = createHash("sha256").update("ulvia-page-revisions/v1\n");
    for await (const pages of collectionPageBatches(repository)) {
        for (const { id, revision } of pages) {
            hash.update(canonicalizeIJson({ id, revision })).update("\n");
        }
    }
    return `sha256:${hash.digest("hex")}`;
}
