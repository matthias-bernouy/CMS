import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";
import { PageLinkController } from "./Internals/PageLinkController";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type PageLinkInputDetail = {
    value: string;
};

export class PageLink extends PageLinkController {
    constructor() {
        super(template);
    }
}

if (!customElements.get("cms-editor-v2-page-link")) {
    customElements.define("cms-editor-v2-page-link", PageLink);
}
