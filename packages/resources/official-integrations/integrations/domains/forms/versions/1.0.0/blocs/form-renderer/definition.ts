export const fieldTypes = [
    "text",
    "email",
    "tel",
    "number",
    "date",
    "textarea",
    "select",
    "choice",
    "checkbox",
] as const;
export type FieldType = (typeof fieldTypes)[number];

export interface FormOption {
    label: string;
    value: string;
}

export interface FormField {
    key: string;
    type: FieldType;
    label: string;
    hint?: string;
    placeholder?: string;
    required?: boolean;
    autocomplete?: string;
    multiple?: boolean;
    options?: FormOption[];
}

export interface FormStep {
    id: string;
    title: string;
    description?: string;
    fields: FormField[];
}

export interface FormDefinition {
    schemaVersion: 1;
    title: string;
    description?: string;
    submitLabel?: string;
    successMessage?: string;
    minCompletionMs?: number;
    steps: FormStep[];
}

export interface PublishedForm {
    key: string;
    version: number;
    accessMode: "public" | "authenticated";
    definition: FormDefinition;
}

export type FormAnswers = Record<string, string | string[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePublishedForm(value: unknown): PublishedForm {
    if (!isRecord(value) || !isRecord(value.definition)) {
        throw new Error("The Forms Source returned an invalid form.");
    }
    const definition = value.definition;
    const steps = definition.steps;
    if (
        definition.schemaVersion !== 1 ||
        typeof definition.title !== "string" ||
        !Array.isArray(steps) ||
        steps.length === 0
    ) {
        throw new Error("This form definition is not supported.");
    }
    for (const step of steps) {
        assertStep(step);
    }
    if (typeof value.key !== "string" || !Number.isSafeInteger(value.version)) {
        throw new Error("The published form has no stable identity.");
    }
    return value as unknown as PublishedForm;
}

function assertStep(value: unknown): asserts value is FormStep {
    if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        typeof value.title !== "string" ||
        !Array.isArray(value.fields)
    ) {
        throw new Error("A form step is invalid.");
    }
    for (const field of value.fields) {
        if (
            !isRecord(field) ||
            typeof field.key !== "string" ||
            typeof field.label !== "string" ||
            !fieldTypes.includes(field.type as FieldType)
        ) {
            throw new Error("A form field is invalid.");
        }
    }
}
