export function value(root: ParentNode, fieldName: string): string {
    return (
        root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-field="${fieldName}"]`)
            ?.value ?? ""
    );
}

export function parseOptional(raw: string, label: string): unknown {
    return raw.trim() ? parseJson(raw, label) : undefined;
}

export function field(labelText: string, control: HTMLElement): HTMLElement {
    const label = document.createElement("label");
    label.append(document.createTextNode(labelText), control);
    return label;
}

export function mappingGroup(title: string, editor: HTMLElement): HTMLElement {
    const group = document.createElement("div");
    group.className = "mapping-group";
    const heading = document.createElement("strong");
    heading.textContent = title;
    group.append(heading, editor);
    return group;
}

export function grid(...children: HTMLElement[]): HTMLElement {
    const element = document.createElement("div");
    element.className = "grid";
    element.append(...children);
    return element;
}

export function input(
    current: string,
    onChange: (value: string) => void,
    placeholder = "",
    type = "text",
): HTMLInputElement {
    const element = document.createElement("input");
    element.type = type;
    element.value = current;
    element.placeholder = placeholder;
    element.addEventListener("input", () => onChange(element.value));
    return element;
}

export function select(
    options: Array<[string, string]>,
    current: string,
    onChange: (value: string) => void,
): HTMLSelectElement {
    const element = document.createElement("select");
    for (const [optionValue, label] of options) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = label;
        element.append(option);
    }
    element.value = current;
    element.addEventListener("change", () => onChange(element.value));
    return element;
}

export function identifier(value: string): string {
    const words =
        value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .match(/[A-Za-z0-9]+/g) ?? [];
    return words.map((word, index) => (index ? word[0]?.toUpperCase() + word.slice(1) : word.toLowerCase())).join("");
}

export function dataShapeType(value: string | undefined): "string" | "number" | "boolean" | "object" | "array" {
    return value === "number" || value === "boolean" || value === "object" || value === "array" ? value : "string";
}

function parseJson(raw: string, label: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`${label} is not valid JSON.`);
    }
}
