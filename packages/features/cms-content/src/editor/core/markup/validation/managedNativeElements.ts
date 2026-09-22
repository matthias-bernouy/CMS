import { parseHTML } from "linkedom";

export type ManagedNativeElementContract = {
    tag: string;
    nativeElement: string;
};

/** Returns the first managed-native structure issue found in an HTML fragment. */
export function managedNativeElementIssue(
    content: string,
    contracts: readonly ManagedNativeElementContract[],
    options: { requireExactlyOneHost?: boolean } = {},
): string | null {
    if (contracts.length === 0) {
        return null;
    }

    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = content;

    for (const contract of contracts) {
        const hosts = Array.from(document.body.querySelectorAll(contract.tag));
        if (options.requireExactlyOneHost && hosts.length !== 1) {
            return `default content for bloc "${contract.tag}" must contain exactly one <${contract.tag}> host`;
        }
        for (const host of hosts) {
            const children = Array.from(host.children);
            const child = children[0];
            const hasAuthoredSiblingText = Array.from(host.childNodes).some(
                (node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
            );
            if (
                children.length !== 1 ||
                child?.localName !== contract.nativeElement.toLowerCase() ||
                child.hasAttribute("slot") ||
                hasAuthoredSiblingText
            ) {
                return `bloc "${contract.tag}" requires exactly one direct, un-slotted <${contract.nativeElement}> child`;
            }
        }
    }

    return null;
}
