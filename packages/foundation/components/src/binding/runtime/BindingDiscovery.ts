import { PAGE_STATE_ATTR } from "../params/PageStateSync";
import { PARAM_SYNC_ATTR } from "../params/ParamSync";
import { SOURCE_ATTR } from "../core/attrs";
import type { BindingRegistry } from "./BindingRegistry";
import { eachMatching } from "./discovery";

export function registerWithin(node: Node, root: Element, registry: BindingRegistry): void {
    eachMatching(node, SOURCE_ATTR, root, (element) => registry.registerSource(element));
    eachMatching(node, PARAM_SYNC_ATTR, root, (element) => registry.registerParamSync(element));
    eachMatching(node, PAGE_STATE_ATTR, root, (element) => registry.registerPageStateSync(element));
}

export function unregisterWithin(node: Node, root: Element, registry: BindingRegistry): void {
    eachMatching(node, SOURCE_ATTR, root, (element) => registry.unregisterSource(element));
    eachMatching(node, PARAM_SYNC_ATTR, root, (element) => registry.unregisterParamSync(element));
    eachMatching(node, PAGE_STATE_ATTR, root, (element) => registry.unregisterPageStateSync(element));
}

export function reconcileAttribute(target: Node, attribute: string | null, registry: BindingRegistry): void {
    if (target.nodeType !== Node.ELEMENT_NODE || !attribute) {
        return;
    }
    const element = target as Element;
    if (!registry.isInScope(element)) {
        return;
    }

    if (attribute === SOURCE_ATTR) {
        registry.reconcileSource(element);
    } else if (attribute === PARAM_SYNC_ATTR) {
        if (element.hasAttribute(PARAM_SYNC_ATTR)) {
            registry.registerParamSync(element);
        } else {
            registry.unregisterParamSync(element);
        }
    } else if (attribute === PAGE_STATE_ATTR) {
        if (element.hasAttribute(PAGE_STATE_ATTR)) {
            registry.registerPageStateSync(element);
        } else {
            registry.unregisterPageStateSync(element);
        }
    }
}
