import { parseHTML } from "linkedom";
import type { ManagedNativeElement } from "cms-content/pages/interfaces/document";
import { managedNativeAttributesIssue } from "cms-content/blocs/core/markup/validation/contracts/managedNativePolicy";
import { nativeElementAttributesIssue } from "cms-content/blocs/core/markup/validation/nativeElementPolicy";

export type ManagedNativeElementContract = {
    id: string;
    root: ManagedNativeElement;
    content?: ManagedNativeElement;
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
        const hosts = Array.from(document.body.querySelectorAll(`[cms-bloc="${contract.id}"]`));
        if (options.requireExactlyOneHost && hosts.length !== 1) {
            return `default content for bloc "${contract.id}" must contain exactly one annotated root`;
        }
        for (const host of hosts) {
            const nativeIssue = nativeElementAttributesIssue(host, true, false, true);
            if (nativeIssue) {
                return `bloc "${contract.id}" has invalid native root: ${nativeIssue}`;
            }
            const rootIssue = elementContractIssue(host, contract.root, true);
            if (rootIssue) {
                return `bloc "${contract.id}" ${rootIssue}`;
            }
            if (host.localName.toLowerCase() === "a") {
                if (!host.hasAttribute("href")) {
                    return `bloc "${contract.id}" requires its native <a> root to declare href`;
                }
                if (hasInteractiveDescendant(host)) {
                    return `bloc "${contract.id}" cannot nest interactive content inside its native <a> root`;
                }
            }
            if (contract.content) {
                const children = Array.from(host.children).filter((child) => !child.hasAttribute("cms-bloc"));
                if (children.length !== 1) {
                    return `bloc "${contract.id}" requires exactly one Page-owned native child`;
                }
                const content = children[0]!;
                if (content.hasAttribute("slot")) {
                    return `bloc "${contract.id}" Page-owned native child cannot target a slot`;
                }
                const contentIssue = elementContractIssue(content, contract.content, false);
                if (contentIssue) {
                    return `bloc "${contract.id}" content ${contentIssue}`;
                }
                const semanticIssue = interactiveRootIssue(content, contract.id);
                if (semanticIssue) {
                    return semanticIssue;
                }
            }
        }
    }

    return null;
}

function interactiveRootIssue(element: Element, id: string): string | null {
    if (element.localName.toLowerCase() !== "a") {
        return null;
    }
    if (!element.hasAttribute("href")) {
        return `bloc "${id}" requires its native <a> content to declare href`;
    }
    return hasInteractiveDescendant(element)
        ? `bloc "${id}" cannot nest interactive content inside its native <a> content`
        : null;
}

function elementContractIssue(element: Element, contract: ManagedNativeElement, root: boolean): string | null {
    const tag = element.localName.toLowerCase();
    if (!contract.accepts.includes(tag as (typeof contract.accepts)[number])) {
        return `requires an accepted native ${root ? "root" : "element"} (${contract.accepts
            .map((accepted) => `<${accepted}>`)
            .join(", ")})`;
    }
    const issue = managedNativeAttributesIssue(
        contract,
        Object.fromEntries(
            element
                .getAttributeNames()
                .filter((name) => name !== "cms-bloc" && name !== "slot")
                .map((name) => [name, element.getAttribute(name) ?? ""]),
        ),
        tag,
        { allowUnknown: root },
    );
    return issue ? `has invalid native attributes: ${issue}` : null;
}

function hasInteractiveDescendant(anchor: Element): boolean {
    return Boolean(
        anchor.querySelector(
            [
                "a[href]",
                "audio[controls]",
                "button",
                "details",
                "embed",
                "iframe",
                "img[usemap]",
                'input:not([type="hidden"])',
                "label",
                "select",
                "textarea",
                "video[controls]",
                "[tabindex]",
                '[contenteditable]:not([contenteditable="false"])',
            ].join(","),
        ),
    );
}
