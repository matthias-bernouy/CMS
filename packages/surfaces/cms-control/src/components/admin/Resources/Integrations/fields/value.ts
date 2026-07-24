import type { IntegrationAnswerValue, IntegrationInput } from "../model";

type ValueInput = Exclude<IntegrationInput, { type: "object-list" }>;

export function valueControl(input: ValueInput, answer: unknown): HTMLElement {
    if (input.type === "json") {
        return textarea(input, answer);
    }
    if (input.type === "select") {
        return select(input, answer);
    }
    const element = document.createElement("input");
    element.name = input.name;
    element.type = input.type === "password" ? "password" : input.type === "boolean" ? "checkbox" : "text";
    if (input.type === "boolean") {
        element.checked = typeof answer === "boolean" ? answer : input.defaultValue === true;
    } else {
        const value = answer ?? input.defaultValue;
        element.value = value == null ? "" : String(value);
    }
    element.required = input.required === true;
    return element;
}

export function collectValueAnswer(root: HTMLElement, input: ValueInput): IntegrationAnswerValue | undefined {
    const element = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[name="${cssEscape(input.name)}"]`,
    );
    if (!element) {
        return undefined;
    }
    if (input.type === "boolean") {
        return (element as HTMLInputElement).checked;
    }
    if (input.type === "json") {
        return JSON.parse(element.value || "null") as IntegrationAnswerValue;
    }
    return element.value;
}

function select(input: ValueInput, answer: unknown): HTMLElement {
    const element = document.createElement("select");
    element.name = input.name;
    for (const option of input.options ?? []) {
        const child = document.createElement("option");
        child.value = option.value;
        child.textContent = option.label;
        element.append(child);
    }
    element.value = typeof answer === "string" ? answer : String(input.defaultValue ?? "");
    element.required = input.required === true;
    return element;
}

function textarea(input: ValueInput, answer: unknown): HTMLElement {
    const element = document.createElement("textarea");
    element.name = input.name;
    element.rows = 6;
    const value = answer ?? input.defaultValue;
    element.value = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    element.required = input.required === true;
    return element;
}

function cssEscape(value: string): string {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(value)
        : value.replaceAll('"', '\\"');
}
