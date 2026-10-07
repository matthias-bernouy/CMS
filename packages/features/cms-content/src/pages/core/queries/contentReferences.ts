import { replaceCollectionTextExpressions } from "@bernouy/cms-repository/collections/texts";
import { pageContentReferences } from "cms-content/pages/core/routing/links";
import { parseHTML } from "linkedom";

export type PageContentReference =
    | { readonly kind: "bloc"; readonly tag: string }
    | { readonly kind: "site-page"; readonly pageId: string }
    | { readonly kind: "text"; readonly collectionId: string; readonly textId: string };

/** Stable persistence key used by the Page reference projection. */
export function pageContentReferenceKey(reference: PageContentReference): string {
    switch (reference.kind) {
        case "bloc":
            return `bloc:${reference.tag}`;
        case "site-page":
            return `site-page:${reference.pageId}`;
        case "text":
            return `text:${reference.collectionId}:${reference.textId}`;
    }
}

/** Extracts the references whose reverse lookup must stay bounded as a site grows. */
export function pageContentReferenceKeys(content: string): readonly string[] {
    const keys = new Set<string>();
    const { document } = parseHTML(`<body>${content}</body>`);
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
        const tag = element.tagName.toLowerCase();
        if (tag.includes("-")) {
            keys.add(pageContentReferenceKey({ kind: "bloc", tag }));
        }
    }
    replaceCollectionTextExpressions(content, (collectionId, textId) => {
        keys.add(pageContentReferenceKey({ kind: "text", collectionId, textId }));
        return "";
    });
    for (const reference of pageContentReferences(content)) {
        if (reference.kind === "site") {
            keys.add(pageContentReferenceKey({ kind: "site-page", pageId: reference.pageId }));
        }
    }
    return [...keys].sort();
}
