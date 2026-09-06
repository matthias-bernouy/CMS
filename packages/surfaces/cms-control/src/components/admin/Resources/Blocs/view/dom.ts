export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = "",
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

export function button(label: string, action: string, className = "button"): HTMLButtonElement {
    const node = element("button", className, label);
    node.type = "button";
    node.dataset.action = action;
    return node;
}

export function icon(name: "stack" | "plus" | "arrow" | "search" | "close" | "check" = "stack"): SVGSVGElement {
    const shapes = {
        stack: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
        close: '<path d="m6 6 12 12M6 18 18 6"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
    };
    const template = document.createElement("template");
    template.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
    return template.content.firstElementChild as SVGSVGElement;
}

export function heading(title: string, description: string, eyebrow?: string): HTMLElement {
    const header = element("header", "page-heading");
    const copy = element("div", "heading-copy");
    if (eyebrow) {
        copy.append(element("p", "eyebrow", eyebrow));
    }
    copy.append(element("h1", "", title), element("p", "description", description));
    header.append(copy);
    return header;
}

export function empty(title: string, description: string): HTMLElement {
    const root = element("section", "empty-state");
    const mark = element("span", "empty-mark");
    mark.append(icon());
    root.append(mark, element("h2", "", title), element("p", "", description));
    return root;
}

export function searchInput(value: string, label: string): HTMLElement {
    const root = element("label", "search-field");
    const input = element("input");
    input.type = "search";
    input.value = value;
    input.placeholder = label;
    input.setAttribute("aria-label", label);
    input.dataset.search = "";
    root.append(icon("search"), input);
    return root;
}
