import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { attachFieldShadow, createFieldTemplate } from "../fieldElement";

const template = createFieldTemplate(templateHtml, componentCss);

export class SegmentedControl extends HTMLElement {
    constructor() {
        super();
        attachFieldShadow(this, template);
    }
}

if (!customElements.get("cms-editor-v2-segmented-control")) {
    customElements.define("cms-editor-v2-segmented-control", SegmentedControl);
}
