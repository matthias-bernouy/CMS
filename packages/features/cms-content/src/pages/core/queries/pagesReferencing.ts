import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";

export async function findPagesReferencingBloc(
    reader: Pick<CmsRepository, "scanPagesByContentReference">,
    blocTag: string,
): Promise<TPage[]> {
    return readReferencePages(reader, { kind: "bloc", tag: blocTag.toLowerCase() });
}

export async function findPagesReferencingText(
    reader: Pick<CmsRepository, "scanPagesByContentReference">,
    ref: string,
): Promise<TPage[]> {
    const match = /^(?:\{\{\s*)?cms\.i18n\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9-]{0,95})(?:\s*\}\})?$/.exec(ref);
    if (!match) {
        return [];
    }
    return readReferencePages(reader, { kind: "text", collectionId: match[1]!, textId: match[2]! });
}

async function readReferencePages(
    reader: Pick<CmsRepository, "scanPagesByContentReference">,
    reference: Parameters<CmsRepository["scanPagesByContentReference"]>[0],
): Promise<TPage[]> {
    const pages: TPage[] = [];
    let cursor: string | undefined;
    do {
        const batch = await reader.scanPagesByContentReference(reference, cursor, 250);
        pages.push(...batch.pages);
        cursor = batch.nextCursor;
    } while (cursor !== undefined);
    return pages;
}
