import "../TopBar/TopBar";
import "../Panel/Panel";
import "../Outline/Outline";
import "../Canvas/Canvas";
import "../../Controls/ControlsPreview/ControlsPreview";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Shell extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }
}

if (!customElements.get("cms-editor-v2-shell")) {
    customElements.define("cms-editor-v2-shell", Shell);
}
