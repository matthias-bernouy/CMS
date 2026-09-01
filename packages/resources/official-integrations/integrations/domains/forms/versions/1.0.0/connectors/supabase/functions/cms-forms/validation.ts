import { HttpError, isRecord } from "./http.ts";

const fieldTypes = new Set(["text", "email", "tel", "number", "date", "textarea", "select", "choice", "checkbox"]);

export function formDefinition(value: unknown): Record<string, unknown> {
    if (typeof value === "string") {
        value = parseJson(value);
    }
    if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.title !== "string") {
        throw new HttpError(422, "definition must use schemaVersion 1 and include a title");
    }
    const steps = value.steps;
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) {
        throw new HttpError(422, "definition must contain between 1 and 20 steps");
    }
    const keys = new Set<string>();
    const stepIds = new Set<string>();
    let fieldCount = 0;
    for (const step of steps) {
        if (!isRecord(step) || !shortText(step.id, 80) || !shortText(step.title, 240) || !Array.isArray(step.fields)) {
            throw new HttpError(422, "each step needs a stable id, title, and fields array");
        }
        if (stepIds.has(step.id as string)) {
            throw new HttpError(422, "step ids must be unique");
        }
        stepIds.add(step.id as string);
        for (const field of step.fields) {
            validateField(field, keys);
            fieldCount += 1;
        }
    }
    if (fieldCount < 1 || fieldCount > 100 || JSON.stringify(value).length > 262144) {
        throw new HttpError(422, "definition is too large");
    }
    return value;
}

export function submissionAnswers(definition: Record<string, unknown>, value: unknown): Record<string, unknown> {
    if (!isRecord(value) || JSON.stringify(value).length > 1048576) {
        throw new HttpError(422, "answers must be an object smaller than 1 MB");
    }
    const fields = definitionFields(definition);
    const errors: Record<string, string> = {};
    for (const key of Object.keys(value)) {
        if (!fields.has(key)) {
            errors[key] = "Unknown field";
        }
    }
    for (const [key, field] of fields) {
        const answer = value[key];
        if (field.required === true && emptyAnswer(answer)) {
            errors[key] = "This field is required";
            continue;
        }
        if (answer !== undefined) {
            validateAnswer(key, field, answer, errors);
        }
    }
    if (Object.keys(errors).length > 0) {
        throw new HttpError(422, "some answers are invalid", errors);
    }
    return value;
}

function validateField(value: unknown, keys: Set<string>): void {
    if (!isRecord(value) || !shortText(value.key, 80) || !/^[a-z][A-Za-z0-9_]*$/.test(value.key as string)) {
        throw new HttpError(422, "each field needs a valid stable key");
    }
    if (keys.has(value.key as string) || !shortText(value.label, 240) || !fieldTypes.has(String(value.type))) {
        throw new HttpError(422, "field keys must be unique and every field needs a supported type and label");
    }
    keys.add(value.key as string);
    if (["select", "choice"].includes(String(value.type))) {
        if (!Array.isArray(value.options) || value.options.length < 1 || value.options.length > 50) {
            throw new HttpError(422, `${value.key} needs between 1 and 50 options`);
        }
        const optionKeys = new Set<string>();
        for (const option of value.options) {
            const key = isRecord(option) ? stableOptionKey(option) : "";
            if (!isRecord(option) || !shortText(option.label, 160) || !key) {
                throw new HttpError(422, `${value.key} contains an invalid option`);
            }
            if (optionKeys.has(key)) {
                throw new HttpError(422, `${value.key} contains duplicate option keys`);
            }
            optionKeys.add(key);
            if (value.presentation === "image-grid" && !validImageUrl(option.imageUrl)) {
                throw new HttpError(422, `${value.key} image choices need HTTPS or CMS-relative image URLs`);
            }
        }
    }
    if (value.presentation !== undefined && (value.type !== "choice" || value.presentation !== "image-grid")) {
        throw new HttpError(422, `${value.key} contains an invalid choice presentation`);
    }
}

function definitionFields(definition: Record<string, unknown>): Map<string, Record<string, unknown>> {
    const fields = new Map<string, Record<string, unknown>>();
    for (const step of definition.steps as Record<string, unknown>[]) {
        for (const field of step.fields as Record<string, unknown>[]) {
            fields.set(field.key as string, field);
        }
    }
    return fields;
}

function validateAnswer(
    key: string,
    field: Record<string, unknown>,
    answer: unknown,
    errors: Record<string, string>,
): void {
    const values = Array.isArray(answer) ? answer : [answer];
    if (values.length > 50 || values.some((item) => typeof item !== "string" || item.length > 10000)) {
        errors[key] = "Invalid answer";
        return;
    }
    const options = Array.isArray(field.options) ? new Set(field.options.filter(isRecord).map(stableOptionKey)) : null;
    if (options && values.some((item) => !options.has(item as string))) {
        errors[key] = "Choose one of the available options";
    }
    if (field.multiple !== true && Array.isArray(answer)) {
        errors[key] = "Choose a single value";
    }
    if (field.type === "checkbox" && values.some((item) => !["true", "false"].includes(String(item)))) {
        errors[key] = "Invalid checkbox value";
    }
    const first = String(values[0] ?? "");
    if (field.type === "email" && first && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first)) {
        errors[key] = "Enter a valid email address";
    }
    if (field.type === "number" && first && !Number.isFinite(Number(first))) {
        errors[key] = "Enter a valid number";
    }
    if (field.type === "date" && first && !/^\d{4}-\d{2}-\d{2}$/.test(first)) {
        errors[key] = "Enter a valid date";
    }
}

function emptyAnswer(value: unknown): boolean {
    return (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "false" ||
        (Array.isArray(value) && value.length === 0)
    );
}

function shortText(value: unknown, maximum: number): boolean {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function stableOptionKey(option: Record<string, unknown>): string {
    const key = String(option.key ?? option.value ?? "").trim();
    return /^[a-z][A-Za-z0-9_-]*$/.test(key) && key.length <= 80 ? key : "";
}

function validImageUrl(value: unknown): boolean {
    if (typeof value !== "string" || !value || value.length > 2048) {
        return false;
    }
    if (value.startsWith("/") && !value.startsWith("//")) {
        return true;
    }
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

function parseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        throw new HttpError(422, "definitionJson must contain valid JSON");
    }
}
