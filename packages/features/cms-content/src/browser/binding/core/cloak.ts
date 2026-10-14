import { BINDING_CORE_TAG, MUTATION_ATTR, QUERY_ATTR } from "./attrs";

const CLOAK_ID = "cms-binding-cloak";
const CLOAK_CSS =
    `${BINDING_CORE_TAG}{display:contents}` +
    `${BINDING_CORE_TAG}:not(:defined) :is([${MUTATION_ATTR}],[${QUERY_ATTR}]){visibility:hidden}`;

export function injectCloak(doc: Document): void {
    if (doc.getElementById(CLOAK_ID)) {
        return;
    }
    const style = doc.createElement("style");
    style.id = CLOAK_ID;
    style.textContent = CLOAK_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
}
