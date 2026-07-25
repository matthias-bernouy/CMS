import { BoundImageGroupActivation } from "./activation";
import { boundImageGroup, forEachBoundElement, rootContains } from "./dom";
import type { ResponsiveSourceImageBrowserApi } from "./element";

const OBSERVED_ATTRIBUTES = [
    "data-cms-network-inert",
    "data-cms-src",
    "data-src",
    "data-cms-srcset",
    "data-cms-sizes",
    "data-cms-media",
    "data-cms-width",
    "data-cms-height",
    "data-source-width",
    "data-source-height",
    "data-source-image-access",
    "loading",
];

export type BoundImageRuntime = Readonly<{
    disconnect(): void;
}>;

export function installBoundImageRuntime(
    root: Document | Element,
    api: ResponsiveSourceImageBrowserApi,
): BoundImageRuntime {
    const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    if (!doc) {
        throw new Error("Bound image runtime requires a Document-owned root.");
    }
    const activation = new BoundImageGroupActivation(doc, api);
    const managed = new Set<Element>();
    const pending = new Set<Element>();
    let active = true;
    let scheduled = false;

    const forget = (group: Element): void => {
        pending.delete(group);
        activation.forget(group);
        managed.delete(group);
    };
    const flush = (): void => {
        scheduled = false;
        if (!active) {
            pending.clear();
            return;
        }
        const groups = [...pending];
        pending.clear();
        for (const group of groups) {
            if (rootContains(root, group)) {
                activation.sync(group);
            } else {
                forget(group);
            }
        }
    };
    const enqueue = (element: Element): void => {
        const group = boundImageGroup(element);
        managed.add(group);
        pending.add(group);
        if (!scheduled) {
            scheduled = true;
            queueMicrotask(flush);
        }
    };
    const scan = (node: Node): void => forEachBoundElement(node, enqueue);

    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new Observer((records) => {
        for (const record of records) {
            if (record.type === "attributes") {
                enqueue(record.target as Element);
                continue;
            }
            if (record.target.nodeType === 1 && (record.target as Element).localName === "picture") {
                enqueue(record.target as Element);
            }
            record.removedNodes.forEach((node) =>
                forEachBoundElement(node, (element) => {
                    const group = boundImageGroup(element);
                    if (!rootContains(root, group)) {
                        forget(group);
                    }
                }),
            );
            record.addedNodes.forEach(scan);
        }
    });
    observer.observe(root, {
        attributes: true,
        attributeFilter: OBSERVED_ATTRIBUTES,
        childList: true,
        subtree: true,
    });
    scan(root);

    return {
        disconnect(): void {
            if (!active) {
                return;
            }
            active = false;
            observer.disconnect();
            pending.clear();
            for (const group of managed) {
                forget(group);
            }
        },
    };
}
