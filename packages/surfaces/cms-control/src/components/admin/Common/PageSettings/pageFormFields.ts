export type PageInputControl = HTMLElement & {
    value: string;
    setCustomValidity(message: string): void;
    reportValidity(): boolean;
};

export function resolvePageForm(host: HTMLElement): HTMLFormElement | null {
    const id = host.getAttribute("form")?.trim();
    const explicit = id ? host.ownerDocument.getElementById(id) : null;
    return explicit instanceof HTMLFormElement ? explicit : host.closest("form");
}

export function resolvePageInput(form: HTMLFormElement, name: "title" | "path"): PageInputControl | null {
    const associated = form.elements.namedItem(name);
    if (isPageInput(associated)) {
        return associated;
    }
    for (const candidate of Array.from(form.ownerDocument.querySelectorAll(`p9r-input[name="${name}"]`))) {
        if (!isPageInput(candidate)) {
            continue;
        }
        if (candidate.closest("form") === form || candidate.getAttribute("form") === form.id) {
            return candidate;
        }
    }
    return null;
}

function isPageInput(value: unknown): value is PageInputControl {
    return (
        value instanceof HTMLElement &&
        typeof (value as Partial<PageInputControl>).value === "string" &&
        typeof (value as Partial<PageInputControl>).setCustomValidity === "function"
    );
}
