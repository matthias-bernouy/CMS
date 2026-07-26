import type { IntegrationAnswerValue, IntegrationDefinition, IntegrationInput } from "../model";
import { getPageLinks } from "../api";
import { collectObjectListAnswer, objectListControl } from "./objectList";
import {
    configureReconfigureField,
    filterReconfigureAnswers,
    hasStoredSecret,
    isSecretInput,
    reconfigureAnswer,
} from "./reconfigure";
import { collectValueAnswer, valueControl } from "./value";

export type RenderFieldsOptions = {
    mode?: "install" | "reconfigure";
    secretInputs?: string[];
};

export function renderFields(
    root: HTMLElement,
    template: HTMLTemplateElement,
    definition: IntegrationDefinition,
    answers: Record<string, unknown> = {},
    options: RenderFieldsOptions = {},
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
        root.append(inputRow(template, input, answers[input.name], loadPageLinks, options));
    }
}

export function collectReconfigureAnswers(
    root: HTMLElement,
    definition: IntegrationDefinition,
    secretInputs: string[],
    savedAnswers: Record<string, IntegrationAnswerValue>,
): Record<string, IntegrationAnswerValue> {
    return filterReconfigureAnswers(collectAnswers(root, definition), definition, secretInputs, savedAnswers);
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
    options: RenderFieldsOptions = {},
): HTMLElement {
    const displayedAnswer =
        options.mode === "reconfigure" ? reconfigureAnswer(input, answer, options.secretInputs ?? []) : answer;
    if (input.type === "object-list") {
        const row = document.createElement("section");
        row.className = "field object-list-fieldset";
        const label = document.createElement("strong");
        label.className = "object-list-label";
        label.textContent = input.label;
        row.append(label, objectListControl(input, displayedAnswer, loadPageLinks));
        if (options.mode === "reconfigure") {
            configureReconfigureField(row, input, options.secretInputs ?? []);
        }
        return row;
    }
    const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    row.querySelector("[data-label]")!.textContent = input.label;
    row.querySelector("[data-hint]")!.textContent = hint(input, options);
    row.querySelector("[data-control]")!.append(valueControl(input, displayedAnswer));
    if (options.mode === "reconfigure") {
        configureReconfigureField(row, input, options.secretInputs ?? []);
    }
    return row;
}

function hint(input: IntegrationInput, options: RenderFieldsOptions): string {
    if (options.mode === "reconfigure" && input.name === "id") {
        return "The identifier cannot be changed after installation.";
    }
    if (options.mode === "reconfigure" && isSecretInput(input, options.secretInputs ?? [])) {
        if (hasStoredSecret(input, options.secretInputs ?? [])) {
            return "Leave blank to keep the current secret.";
        }
        return input.required
            ? "Required. Enter a value for this new secret."
            : "Optional. No secret is currently stored.";
    }
    if (isSecretInput(input, [])) {
        return "Stored as a secret.";
    }
    return input.required ? "Required." : "";
}
