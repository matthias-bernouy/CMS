import {
    NETWORK_BINDING_ATTRIBUTES,
    type NetworkBindingAttribute,
    writeNetworkBindingAttribute,
} from "@bernouy/components/binding-dom";

export function writeSettingAttribute(element: Element, name: string, value: string | null): void {
    if (isNetworkBindingAttribute(name)) {
        writeNetworkBindingAttribute(element, name, value);
        return;
    }
    if (value === null) {
        element.removeAttribute(name);
    } else {
        element.setAttribute(name, value);
    }
}

function isNetworkBindingAttribute(name: string): name is NetworkBindingAttribute {
    return (NETWORK_BINDING_ATTRIBUTES as readonly string[]).includes(name);
}
