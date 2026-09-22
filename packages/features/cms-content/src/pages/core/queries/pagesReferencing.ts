import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { escapeRegex } from "cms-content/pages/core/queries/escapeRegex";

export async function findPagesReferencingBloc(
    reader: Pick<CmsRepository, "getAllPages">,
    blocTag: string,
): Promise<TPage[]> {
    const tagRe = new RegExp(`<${escapeRegex(blocTag)}(\\s|>|/)`, "i");
    return findPagesReferencingPredicate(reader, (content) => tagRe.test(content));
}

export async function findPagesReferencingText(
    reader: Pick<CmsRepository, "getAllPages">,
    ref: string,
): Promise<TPage[]> {
    return findPagesReferencingPredicate(reader, (content) => content.includes(ref));
}

async function findPagesReferencingPredicate(
    reader: Pick<CmsRepository, "getAllPages">,
    matches: (content: string) => boolean,
): Promise<TPage[]> {
    const pages = await reader.getAllPages();
    return pages.filter((page) => matches(page.content ?? ""));
}
