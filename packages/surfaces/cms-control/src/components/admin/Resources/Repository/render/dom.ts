export function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) {
        node.textContent = text;
    }
    if (className) {
        node.className = className;
    }
    return node;
}

export function labelledValue(label: string, value: string): HTMLElement {
    const node = element("div", undefined, "metric");
    node.append(element("span", label), element("strong", value));
    return node;
}

export function metadata(parts: readonly (string | undefined)[]): HTMLElement {
    return element("p", parts.filter(Boolean).join(" · "), "metadata");
}

export function emptyMessage(message: string): HTMLElement {
    return element("p", message, "metadata");
}
