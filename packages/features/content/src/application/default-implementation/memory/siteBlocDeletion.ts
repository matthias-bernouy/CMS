import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { BlocRecord } from "content/blocs/interfaces/blocs";
import type { SiteBlocConsumer } from "content/blocs/core/catalogue/editing/references";
import {
    blocReferencesTag,
    requireSiteBlocDeletion,
    SiteBlocReferencedError,
    SITE_BLOC_REFERENCE_LIMIT,
} from "content/blocs/core/catalogue/editing/references";

export async function deleteMemorySiteBloc(
    repository: Pick<ContentRepository, "withContentReferenceWrite" | "scanPagesByContentReference">,
    blocs: Map<string, BlocRecord>,
    tag: string,
    revision: number,
    identity: string,
): Promise<void> {
    await repository.withContentReferenceWrite(async () => {
        requireSiteBlocDeletion(blocs.get(tag) ?? null, tag, revision, identity);
        const limit = SITE_BLOC_REFERENCE_LIMIT + 1;
        const pageBatch = await repository.scanPagesByContentReference({ kind: "bloc", tag }, undefined, limit);
        const references: SiteBlocConsumer[] = pageBatch.pages.map(({ id }) => ({ kind: "page", id }));
        for (const record of blocs.values()) {
            if (references.length >= limit) {
                break;
            }
            if (record.tag !== tag && blocReferencesTag(record, tag)) {
                references.push({ kind: "bloc", id: record.tag });
            }
        }
        if (references.length) {
            throw new SiteBlocReferencedError(references);
        }
        blocs.delete(tag);
    });
}
