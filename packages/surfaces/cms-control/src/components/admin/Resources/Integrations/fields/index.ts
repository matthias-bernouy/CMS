import type { IntegrationAnswerValue, IntegrationDefinition, IntegrationInput } from "../model";
import { getPageLinks } from "../api";
import { collectObjectListAnswer, objectListControl } from "./objectList";
import { collectValueAnswer, valueControl } from "./value";

export function renderFields(
    root: HTMLElement,
    template: HTMLTemplateElement,
    definition: IntegrationDefinition,
    answers: Record<string, unknown> = {},
): void {
    root.replaceChildren();
    if (!definition.inputs.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No inputs required.";
        root.append(empty);
        return;
    }
    let pageLinks: ReturnType<typeof getPageLinks> | undefined;
    const loadPageLinks = definition.inputs.some(
        (input) => input.type === "object-list" && input.fields.some((field) => field.type === "page-link"),
    )
        ? () => (pageLinks ??= getPageLinks())
        : undefined;
    for (const input of definition.inputs) {
        root.append(inputRow(template, input, answers[input.name], loadPageLinks));
    }
}

export function collectAnswers(
    root: HTMLElement,
    definition: IntegrationDefinition,
): Record<string, IntegrationAnswerValue> {
    const answers: Record<string, IntegrationAnswerValue> = {};
    for (const input of definition.inputs) {
        const value =
            input.type === "object-list" ? collectObjectListAnswer(root, input) : collectValueAnswer(root, input);
        if (value !== undefined) {
            answers[input.name] = value;
        }
    }
    return answers;
}

function inputRow(
    template: HTMLTemplateElement,
    input: IntegrationInput,
    answer: unknown,
    loadPageLinks?: () => ReturnType<typeof getPageLinks>,
): HTMLElement {
    if (input.type === "object-list") {
        const row = document.createElement("section");
        row.className = "field object-list-fieldset";
        const label = document.createElement("strong");
        label.className = "object-list-label";
        label.textContent = input.label;
        row.append(label, objectListControl(input, answer, loadPageLinks));
        return row;
    }
    const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    row.querySelector("[data-label]")!.textContent = input.label;
    row.querySelector("[data-hint]")!.textContent = hint(input);
    row.querySelector("[data-control]")!.append(valueControl(input, answer));
    return row;
}

function hint(input: IntegrationInput): string {
    if (input.type !== "object-list" && (input.secret || input.type === "password")) {
        return "Stored as a secret.";
    }
    return input.required ? "Required." : "";
}
