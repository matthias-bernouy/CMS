import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { SiteBlocNode } from "cms-content/blocs/interfaces/blocs";

/** Converts validated Page-owned markup into the structured site-composition model. */
export function siteBlocStructureFromMarkup(markup: string): SiteBlocNode[] {
    if (typeof markup !== "string" || !markup.trim()) {
        throw new ContentValidationError("content", "non-empty Page markup expected");
    }
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const template = document.createElement("template");
    template.innerHTML = markup;
    return Array.from(template.content.childNodes).flatMap(toSiteBlocNode);
}

function toSiteBlocNode(node: Node): SiteBlocNode[] {
    if (node.nodeType === 3) {
        return [{ kind: "text", value: node.nodeValue ?? "" }];
    }
    if (node.nodeType !== 1) {
        return [];
    }
    const element = node as Element;
    const bloc = element.getAttribute("cms-bloc")?.trim();
    const attributes = Object.fromEntries(
        Array.from(element.attributes)
            .filter(({ name }) => name !== "cms-bloc")
            .map(({ name, value }) => [name, value]),
    );
    return [
        {
            kind: "bloc",
            tag: bloc || element.localName,
            ...(bloc ? { root: element.localName } : {}),
            attributes,
            children: Array.from(element.childNodes).flatMap(toSiteBlocNode),
        },
    ];
}
