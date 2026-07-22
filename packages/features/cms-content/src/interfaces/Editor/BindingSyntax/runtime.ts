import { CMS_BINDING_RUNTIME_ATTRIBUTES } from "./types";

export function clearBindingRuntimeState(root: Element): void {
    const attribute = CMS_BINDING_RUNTIME_ATTRIBUTES.ready;
    root.removeAttribute(attribute);
    root.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
}
