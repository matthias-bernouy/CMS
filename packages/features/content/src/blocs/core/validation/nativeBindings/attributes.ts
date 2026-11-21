import { CMS_BINDING_ATTRIBUTES } from "content/blocs/core/markup/bindings/types";

const BINDING_ATTRIBUTE_SET = new Set<string>(Object.values(CMS_BINDING_ATTRIBUTES));

export function isCmsBindingAttribute(attribute: string): boolean {
    return BINDING_ATTRIBUTE_SET.has(attribute.toLowerCase());
}
