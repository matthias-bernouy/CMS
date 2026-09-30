import { renderCollectionTexts, type CollectionTextSource } from "@bernouy/cms-content/rendering";

/** Resolve collection-owned output without rewriting the inert page input. */
export function renderEditorCollectionTexts(
    root: ParentNode,
    locale: string,
    sources: readonly CollectionTextSource[],
): void {
    const options = { skipSubtree: (element: Element) => element.hasAttribute("data-p9r-composition-authored") };
    for (const output of Array.from(root.querySelectorAll("[data-p9r-composition-output]"))) {
        renderCollectionTexts(output, locale, sources, options);
    }
    for (const host of Array.from(root.querySelectorAll("[data-p9r-component-composition]"))) {
        let inside = false;
        for (const node of Array.from(host.childNodes)) {
            if (node.nodeType === 8 && node.nodeValue === "p9r-component-output-start") {
                inside = true;
                continue;
            }
            if (node.nodeType === 8 && node.nodeValue === "p9r-component-output-end") {
                break;
            }
            if (inside && node.nodeType === 1) {
                renderCollectionTexts(node as Element, locale, sources, options);
            }
        }
    }
}
