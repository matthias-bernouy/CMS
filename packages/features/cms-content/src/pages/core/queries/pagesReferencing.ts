import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { escapeRegex } from "cms-content/pages/core/queries/escapeRegex";

export async function findPagesReferencingBloc(reader: ContentReader, blocTag: string): Promise<TPage[]> {
    const tagRe = new RegExp(`<${escapeRegex(blocTag)}(\\s|>|/)`, "i");
    return findPagesReferencingPredicate(reader, (content) => tagRe.test(content));
}

export async function findPagesReferencingText(reader: ContentReader, ref: string): Promise<TPage[]> {
    return findPagesReferencingPredicate(reader, (content) => content.includes(ref));
}

async function findPagesReferencingPredicate(
    reader: ContentReader,
    matches: (content: string) => boolean,
): Promise<TPage[]> {
    const pages = await reader.getAllPages();
    return pages.filter((page) => matches(page.content ?? ""));
}
