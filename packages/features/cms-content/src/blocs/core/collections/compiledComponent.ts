import { parseHTML } from "linkedom";
import type { CollectionComponent } from "@bernouy/cms-repository/collections";
import { sanitizeDomTree } from "cms-content/blocs/core/markup/security/sanitizeDomTree";

/** Compile an admitted static shell into the existing browser bloc contract. */
export function compileCollectionComponent(bloc: CollectionComponent): string {
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    document.body.innerHTML = bloc.shadowdom;
    sanitizeDomTree(document.body);
    const markup = JSON.stringify(document.body.innerHTML);
    const css = JSON.stringify(bloc.style ?? "");
    const tag = JSON.stringify(bloc.id);
    return `(() => {
        const tag = ${tag};
        if (customElements.get(tag)) return;
        customElements.define(tag, class extends HTMLElement {
            constructor() {
                super();
                const root = this.attachShadow({ mode: "open" });
                const style = document.createElement("style");
                style.textContent = ${css};
                root.append(style);
                const template = document.createElement("template");
                template.innerHTML = ${markup};
                root.append(template.content.cloneNode(true));
            }
        });
    })();`;
}
