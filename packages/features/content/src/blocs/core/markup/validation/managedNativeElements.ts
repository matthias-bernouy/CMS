import { parseHTML } from "linkedom";
import type { ManagedNativeElement } from "content/pages/interfaces/document";
import { managedNativeAttributesIssue } from "content/blocs/core/markup/validation/contracts/managedNativePolicy";
import { nativeElementAttributesIssue } from "content/blocs/core/markup/validation/nativeElementPolicy";

export type ManagedNativeElementContract = {
    id: string;
    root: ManagedNativeElement;
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
    const hostsById = new Map<string, Element[]>();
    for (const host of document.body.querySelectorAll("[cms-bloc]")) {
        const id = host.getAttribute("cms-bloc")!;
        const hosts = hostsById.get(id) ?? [];
        hosts.push(host);
        hostsById.set(id, hosts);
    }

    for (const contract of contracts) {
        const hosts = hostsById.get(contract.id) ?? [];
        if (options.requireExactlyOneHost && hosts.length !== 1) {
            return `default content for bloc "${contract.id}" must contain exactly one annotated root`;
        }
        for (const host of hosts) {
            const nativeIssue = nativeElementAttributesIssue(host, true, false, true);
            if (nativeIssue) {
                return `bloc "${contract.id}" has invalid native root: ${nativeIssue}`;
            }
            const rootIssue = managedNativeElementContractIssue(host, contract.root, true);
            if (rootIssue) {
                return `bloc "${contract.id}" ${rootIssue}`;
            }
        }
    }

    return null;
}

export function managedNativeElementContractIssue(
    element: Element,
    contract: ManagedNativeElement,
    root = false,
): string | null {
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
    if (issue) {
        return `has invalid native attributes: ${issue}`;
    }
    if (tag === "a") {
        if (!element.hasAttribute("href")) {
            return `requires its native <a> ${root ? "root" : "element"} to declare href`;
        }
        if (hasInteractiveDescendant(element)) {
            return `cannot nest interactive content inside its native <a> ${root ? "root" : "element"}`;
        }
    }
    return null;
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
