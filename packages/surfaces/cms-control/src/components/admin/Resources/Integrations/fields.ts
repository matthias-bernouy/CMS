import type { IntegrationAnswerValue, IntegrationDefinition, IntegrationInput } from "./model";

export function renderFields(root: HTMLElement, template: HTMLTemplateElement, definition: IntegrationDefinition): void {
    root.replaceChildren();
    if (!definition.inputs.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No inputs required.";
        root.append(empty);
        return;
    }
    for (const input of definition.inputs) {
        const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
        row.querySelector("[data-label]")!.textContent = input.label;
        row.querySelector("[data-hint]")!.textContent = hint(input);
        row.querySelector("[data-control]")!.append(control(input));
        root.append(row);
    }
}

export function collectAnswers(root: HTMLElement, definition: IntegrationDefinition): Record<string, IntegrationAnswerValue> {
    const answers: Record<string, IntegrationAnswerValue> = {};
    for (const input of definition.inputs) {
        const element = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${input.name}"]`);
        if (!element) continue;
        if (input.type === "boolean") answers[input.name] = (element as HTMLInputElement).checked;
        else if (input.type === "json") answers[input.name] = JSON.parse(element.value || "null");
        else answers[input.name] = element.value;
    }
    return answers;
}

function control(input: IntegrationInput): HTMLElement {
    if (input.type === "json") return textarea(input, 6);
    if (input.type === "select") return select(input);
    const element = document.createElement("input");
    element.name = input.name;
    element.type = input.type === "password" ? "password" : input.type === "boolean" ? "checkbox" : "text";
    if (input.defaultValue !== undefined && input.type !== "boolean") element.value = String(input.defaultValue);
    if (input.defaultValue === true && input.type === "boolean") element.checked = true;
    if (input.required) element.required = true;
    return element;
}

function select(input: IntegrationInput): HTMLElement {
    const element = document.createElement("select");
    element.name = input.name;
    for (const option of input.options ?? []) {
        const child = document.createElement("option");
        child.value = option.value;
        child.textContent = option.label;
        element.append(child);
    }
    return element;
}

function textarea(input: IntegrationInput, rows: number): HTMLElement {
    const element = document.createElement("textarea");
    element.name = input.name;
    element.rows = rows;
    if (typeof input.defaultValue === "string") element.value = input.defaultValue;
    return element;
}

function hint(input: IntegrationInput): string {
    if (input.secret || input.type === "password") return "Stored as a secret.";
    if (input.required) return "Required.";
    return "";
}
