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
    host.shadowRoot!.querySelector(".label")!.textContent = host.getAttribute("label") ?? "";
    host.shadowRoot!.querySelector(".hint")!.textContent = host.getAttribute("hint") ?? "";
}
