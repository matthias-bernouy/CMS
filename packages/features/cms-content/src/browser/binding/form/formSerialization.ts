import { collectFormData } from "./formControls";
import type { AdditionalFormFields, FormSubmitMethod, SerializedForm, SerializedFormData } from "./types";
import { serializeTypedForm } from "./typed/serialize";

const BODY_METHODS = new Set<FormSubmitMethod>(["POST", "PUT", "PATCH", "DELETE"]);

export function normalizeFormMethod(value: string | null | undefined, fallback: FormSubmitMethod): FormSubmitMethod {
    const method = (value ?? "").trim().toUpperCase();
    if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
        return method;
    }
    return fallback;
}

export function serializeForm(
    form: HTMLFormElement,
    options: { url: string; method: FormSubmitMethod; bodyFields?: AdditionalFormFields; formData?: FormData },
): SerializedForm {
    const formData = options.formData ?? collectFormData(form);
    if (!BODY_METHODS.has(options.method)) {
        throw new Error("Declarative mutations require a method with a request body.");
    }
    const data = withAdditionalFields(serializeTypedForm(form), formData, options.bodyFields);
    if (hasFile(formData)) {
        return { kind: "formData", url: options.url, formData, data, body: formData };
    }
    return { kind: "json", url: options.url, formData, data, body: JSON.stringify(data) };
}

function withAdditionalFields(
    data: SerializedFormData,
    formData: FormData,
    fields: AdditionalFormFields | undefined,
): SerializedFormData {
    if (!fields) {
        return data;
    }

    let next: SerializedFormData = data;
    for (const [rawKey, value] of Object.entries(fields)) {
        const key = rawKey.trim();
        if (!key || formData.has(key) || Object.prototype.hasOwnProperty.call(data, key)) {
            continue;
        }
        if (next === data) {
            next = { ...data };
        }
        next[key] = value;
        formData.append(key, typeof value === "object" && value !== null ? JSON.stringify(value) : String(value));
    }
    return next;
}

function hasFile(formData: FormData): boolean {
    return Array.from(formData.values()).some((value) => !isEmptyFile(value) && isFileLike(value));
}

function isEmptyFile(value: FormDataEntryValue): boolean {
    return isFileLike(value) && value.name === "" && value.size === 0;
}

function isFileLike(value: unknown): value is File {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as File).name === "string" &&
        typeof (value as File).size === "number"
    );
}
