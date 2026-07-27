import type { IntegrationAnswerValue, IntegrationDefinition, IntegrationInput } from "../model";

export function isSecretInput(input: IntegrationInput, secretInputs: string[]): boolean {
    return (
        secretInputs.includes(input.name) ||
        (input.type !== "object-list" && (input.type === "password" || input.secret === true))
    );
}

export function hasStoredSecret(input: IntegrationInput, secretInputs: string[]): boolean {
    return secretInputs.includes(input.name);
}

export function reconfigureAnswer(input: IntegrationInput, answer: unknown, secretInputs: string[]): unknown {
    return isSecretInput(input, secretInputs) ? undefined : answer;
}

export function configureReconfigureField(row: HTMLElement, input: IntegrationInput, secretInputs: string[]): void {
    if (input.name === "id") {
        for (const control of Array.from(
            row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
        )) {
            control.disabled = true;
            control.setAttribute("aria-disabled", "true");
        }
        for (const button of Array.from(row.querySelectorAll<HTMLButtonElement>("button"))) {
            button.disabled = true;
        }
    }
    if (!isSecretInput(input, secretInputs)) {
        return;
    }
    const control = row.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (!control) {
        return;
    }
    if (control instanceof HTMLInputElement) {
        control.type = "password";
        control.autocomplete = "new-password";
    }
    control.value = "";
    if (hasStoredSecret(input, secretInputs)) {
        control.required = false;
        control.placeholder = "Leave blank to keep the current secret";
    } else {
        control.placeholder = input.required ? "Enter the required secret" : "Enter a secret (optional)";
    }
}

export function filterReconfigureAnswers(
    answers: Record<string, IntegrationAnswerValue>,
    definition: IntegrationDefinition,
    secretInputs: string[],
    savedAnswers: Record<string, IntegrationAnswerValue>,
): Record<string, IntegrationAnswerValue> {
    const overrides: Record<string, IntegrationAnswerValue> = {};
    for (const input of definition.inputs) {
        if (input.name === "id" || !(input.name in answers)) {
            continue;
        }
        const answer = answers[input.name];
        if (answer === undefined) {
            continue;
        }
        if (isSecretInput(input, secretInputs)) {
            if (typeof answer === "string" && answer !== "") {
                overrides[input.name] = answer;
            }
            continue;
        }
        if (!answersEqual(answer, savedAnswers[input.name])) {
            overrides[input.name] = answer;
        }
    }
    return overrides;
}

function answersEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        return (
            Array.isArray(left) &&
            Array.isArray(right) &&
            left.length === right.length &&
            left.every((value, index) => answersEqual(value, right[index]))
        );
    }
    if (!isObject(left) || !isObject(right)) {
        return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
        leftKeys.length === rightKeys.length &&
        leftKeys.every((key) => Object.hasOwn(right, key) && answersEqual(left[key], right[key]))
    );
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
