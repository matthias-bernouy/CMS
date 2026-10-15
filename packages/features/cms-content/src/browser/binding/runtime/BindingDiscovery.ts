import { MUTATION_ATTR, QUERIES_ATTR, QUERY_ATTR, SYNC_ATTR } from "../core/attrs";
import type { BindingRegistry } from "./BindingRegistry";
import { eachMatching } from "./discovery";

export function registerWithin(node: Node, root: Element, registry: BindingRegistry): void {
    eachMatching(node, QUERY_ATTR, root, (element) => registry.registerQuery(element));
    eachMatching(node, QUERIES_ATTR, root, (element) => registry.registerQuery(element));
    eachMatching(node, MUTATION_ATTR, root, (element) => registry.registerMutation(element));
    eachMatching(node, SYNC_ATTR, root, (element) => {
        if (!element.hasAttribute(QUERY_ATTR) && !element.hasAttribute(QUERIES_ATTR) && element.localName !== "form") {
            registry.registerSyncControl(element);
        }
    });
}

export function unregisterWithin(node: Node, root: Element, registry: BindingRegistry): void {
    eachMatching(node, QUERY_ATTR, root, (element) => registry.unregisterQuery(element));
    eachMatching(node, QUERIES_ATTR, root, (element) => registry.unregisterQuery(element));
    eachMatching(node, MUTATION_ATTR, root, (element) => registry.unregisterMutation(element));
    eachMatching(node, SYNC_ATTR, root, (element) => registry.unregisterSyncControl(element));
}

export function reconcileAttribute(target: Node, attribute: string | null, registry: BindingRegistry): void {
    if (target.nodeType !== Node.ELEMENT_NODE || !attribute) {
        return;
    }
    const element = target as Element;
    if (!registry.isInScope(element)) {
        return;
    }

    if (attribute === QUERY_ATTR || attribute === QUERIES_ATTR) {
        registry.reconcileQuery(element);
    } else if (attribute === MUTATION_ATTR) {
        registry.reconcileMutation(element);
    } else if (attribute === SYNC_ATTR) {
        registry.unregisterSyncControl(element);
        if (
            element.hasAttribute(SYNC_ATTR) &&
            !element.hasAttribute(QUERY_ATTR) &&
            !element.hasAttribute(QUERIES_ATTR) &&
            element.localName !== "form"
        ) {
            registry.registerSyncControl(element);
        }
    }
}
