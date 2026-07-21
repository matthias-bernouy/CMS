import { BINDING_CORE_TAG, READY_ATTR, SOURCE_ATTR } from "../attrs";

const CLOAK_ID = "cms-binding-cloak";
const CLOAK_CSS = `${BINDING_CORE_TAG}{display:contents}` + `[${SOURCE_ATTR}]:not([${READY_ATTR}]){visibility:hidden}`;

export function injectCloak(doc: Document): void {
    if (doc.getElementById(CLOAK_ID)) {
        return;
    }
    const style = doc.createElement("style");
    style.id = CLOAK_ID;
    style.textContent = CLOAK_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
}
