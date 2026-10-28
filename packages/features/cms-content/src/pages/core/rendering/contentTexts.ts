import { transformContentTexts } from "./contentTextTraversal";
export { replaceContentTextExpressions } from "./contentTextExpressions";

export interface ContentTextSource {
    readonly namespace: string;
    resolve(locale: string): Readonly<Record<string, string>>;
}

/** Server-only DOM pass over trusted public text sources. */
export function renderContentTexts(
    root: Element,
    locale: string,
    sources: readonly ContentTextSource[],
    options: {
        skipSubtree?: (element: Element) => boolean;
    } = {},
): void {
    const catalogues = new Map<string, Readonly<Record<string, string>>>();
    for (const source of sources) {
        if (catalogues.has(source.namespace)) {
            throw new TypeError(`Duplicate text namespace: ${source.namespace}`);
        }
        catalogues.set(source.namespace, source.resolve(locale));
    }
    const message = (namespace: string, id: string): string => {
        const texts = catalogues.get(namespace);
        if (!texts || !Object.hasOwn(texts, id)) {
            throw new TypeError(`Unknown content text: ${namespace}:${id}`);
        }
        return texts[id]!;
    };
    transformContentTexts(root, message, options);
}
