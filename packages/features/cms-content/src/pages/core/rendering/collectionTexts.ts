import { replaceTextExpressions } from "./textExpressions";
import type { CollectionRelease } from "@bernouy/cms-repository/collections";
import { resolveCollectionTexts, formatCollectionText } from "@bernouy/cms-repository/collections/texts";

/** Trusted, public render inputs. Do not include actor-specific values in cached pages. */
export interface CollectionTextSource {
    collection: Pick<CollectionRelease, "collectionId" | "locale" | "texts">;
    overrides?: unknown;
    parameters?: Readonly<Record<string, string | number>>;
}

const ATTRIBUTES = new Set(["title", "placeholder", "alt", "aria-label", "aria-description"]);

/** Server-only DOM pass. Does not inspect or evaluate browser binding expressions. */
export function renderCollectionTexts(
    root: Element,
    locale: string,
    sources: readonly CollectionTextSource[],
    options: { skipSubtree?: (element: Element) => boolean } = {},
): void {
    const catalogues = new Map<string, ReturnType<typeof resolveCollectionTexts>>();
    const parameters = new Map<string, CollectionTextSource["parameters"]>();
    for (const source of sources) {
        const id = source.collection.collectionId;
        if (catalogues.has(id)) {
            throw new TypeError(`Duplicate text collection: ${id}`);
        }
        catalogues.set(id, resolveCollectionTexts(source.collection, locale, source.overrides));
        parameters.set(id, source.parameters);
    }
    const message = (collection: string, id: string): string => {
        const key = `${collection}:${id}`;
        const texts = catalogues.get(collection!);
        if (!texts || !Object.hasOwn(texts, id)) {
            throw new TypeError(`Unknown collection text: ${key}`);
        }
        const value = formatCollectionText(texts[id], parameters.get(collection!));
        return value;
    };
    const walk = (element: Element, inert = false): void => {
        if (options.skipSubtree?.(element)) {
            return;
        }
        const blocked =
            inert ||
            /^(template|script|style|textarea|iframe|xmp|plaintext|noembed|noframes|noscript)$/.test(element.localName);
        const replace = (value: string, allowed: boolean): string =>
            replaceTextExpressions(value, (collection, id) => {
                if (!allowed || blocked) {
                    throw new TypeError("Server texts are unsupported in this HTML context");
                }
                return message(collection, id);
            });
        for (const name of element.getAttributeNames()) {
            const value = element.getAttribute(name)!;
            const rendered = replace(value, ATTRIBUTES.has(name));
            if (rendered !== value) {
                element.setAttribute(name, rendered);
            }
        }
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === 3) {
                node.textContent = replace(node.textContent ?? "", true);
            } else if (node.nodeType === 1) {
                walk(node as Element, blocked);
            }
        }
        if (element.localName === "template") {
            for (const node of Array.from((element as HTMLTemplateElement).content.childNodes)) {
                if (node.nodeType === 1) {
                    walk(node as Element, true);
                } else if (node.nodeType === 3) {
                    replace(node.textContent ?? "", false);
                }
            }
        }
    };
    walk(root);
}
