import type { ContentReader } from "cms-content/interfaces/ContentReader";
import type { TPage } from "cms-content/interfaces/pages";
import { extractRefs } from "cms-content/core/utils/contentRefs";
import { escapeRegex } from "cms-content/core/utils/escapeRegex";

export async function findPagesReferencingBloc(reader: ContentReader, blocTag: string): Promise<TPage[]> {
    const tagRe = new RegExp(`<${escapeRegex(blocTag)}(\\s|>|/)`, "i");
    return findPagesReferencingPredicate(reader, content => tagRe.test(content));
}

export async function findPagesReferencingText(reader: ContentReader, ref: string): Promise<TPage[]> {
    return findPagesReferencingPredicate(reader, content => content.includes(ref));
}

async function findPagesReferencingPredicate(
    reader: ContentReader,
    matches: (content: string) => boolean,
): Promise<TPage[]> {
    const [pages, snippets] = await Promise.all([
        reader.getAllPages(),
        reader.getAllSnippets(),
    ]);

    const affectedSnippetIds = new Set(
        snippets
            .filter(s => matches(s.content ?? ""))
            .map(s => s.identifier),
    );

    return pages.filter(page => {
        const content = page.content ?? "";
        if (matches(content)) return true;
        const refs = extractRefs(content);
        for (const id of affectedSnippetIds) {
            if (refs.snippets.has(id)) return true;
        }
        return false;
    });
}
