import baseCss from "./base.css" with { type: "text" };
import imageChoiceCss from "./imageChoice.css" with { type: "text" };

export function installRendererStyles(host: HTMLElement): void {
    if (host.querySelector("style[data-forms-renderer-styles]")) {
        return;
    }
    const style = document.createElement("style");
    style.dataset.formsRendererStyles = "";
    style.textContent = `${baseCss}\n${imageChoiceCss}`;
    host.prepend(style);
}
