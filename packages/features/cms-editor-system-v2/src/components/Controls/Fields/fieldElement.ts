export function createFieldTemplate(templateHtml: unknown, componentCss: unknown): HTMLTemplateElement {
    const template = document.createElement("template");
    template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;
    return template;
}

export function attachFieldShadow(host: HTMLElement, template: HTMLTemplateElement): ShadowRoot {
    const root = host.attachShadow({ mode: "open" });
    root.append(template.content.cloneNode(true));
    return root;
}

export function syncFieldCopy(host: HTMLElement): void {
    const label = host.getAttribute("label") ?? "";
    host.shadowRoot!.querySelector(".label")!.textContent = label;
    host.shadowRoot!.querySelector(".hint")!.textContent = host.getAttribute("hint") ?? "";
    const labelDisplay = host.getAttribute("label-display") ?? "visible";
    const ariaLabel = host.getAttribute("aria-label");
    if (ariaLabel || labelDisplay !== "visible") {
        const control = host.shadowRoot!.querySelector<HTMLElement>("input, select, textarea, button");
        control?.setAttribute("aria-label", ariaLabel ?? label);
    }
}
