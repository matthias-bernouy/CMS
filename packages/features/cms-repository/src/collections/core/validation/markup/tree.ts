import { DomUtils, parseDocument } from "htmlparser2";

export type MarkupTree = ReturnType<typeof parseDocument>;
export type MarkupNode = MarkupTree["children"][number];
export type MarkupElement = Extract<MarkupNode, { attribs: Record<string, string> }>;

export const isElement = DomUtils.isTag;

/** HTML structure only: this does not compile bindings, CSS, or browser execution. */
export function markupTree(source: string): MarkupTree {
    return parseDocument(source, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
}

export function nodes(tree: MarkupTree): MarkupNode[] {
    const result: MarkupNode[] = [];
    const pending: MarkupNode[] = [...tree.children];
    while (pending.length > 0) {
        const current = pending.pop()!;
        result.push(current);
        if ("children" in current) {
            for (const child of current.children) {
                pending.push(child);
            }
        }
    }
    return result;
}

export function elements(tree: MarkupTree): MarkupElement[] {
    return nodes(tree).filter(isElement);
}

export function offeredSlots(tree: MarkupTree): Set<string> {
    return new Set(
        elements(tree)
            .filter((element) => element.name === "slot")
            .map((element) => element.attribs.name ?? ""),
    );
}

export function significantRoots(tree: MarkupTree): MarkupNode[] {
    return tree.children.filter(
        (node) => node.type !== "comment" && (node.type !== "text" || node.data.trim().length > 0),
    );
}
