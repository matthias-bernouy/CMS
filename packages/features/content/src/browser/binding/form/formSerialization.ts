import { collectFormData } from "./formControls";
import { appendSerializedValue } from "./nestedFormData";
import type { AdditionalFormFields, FormSubmitMethod, SerializedForm, SerializedFormData } from "./types";
import { serializeTypedForm } from "./typed/serialize";

const BODY_METHODS = new Set<FormSubmitMethod>(["POST", "PUT", "PATCH", "DELETE"]);

export function serializeForm(
    form: HTMLFormElement,
    options: {
        url: string;
        method: FormSubmitMethod;
        bodyFields?: AdditionalFormFields;
        formData?: FormData;
        serialization?: "typed-json";
    },
): SerializedForm {
    const formData = options.formData ?? collectFormData(form);
    if (options.serialization === "typed-json") {
        if (!BODY_METHODS.has(options.method)) {
            throw new Error("Typed JSON requires a method with a request body.");
        }
        const data = withAdditionalFields(serializeTypedForm(form), formData, options.bodyFields);
        if (hasFile(formData)) {
            return { kind: "formData", url: options.url, formData, data, body: formData };
        }
        return { kind: "json", url: options.url, formData, data, body: JSON.stringify(data) };
    }
    if (options.method === "GET") {
        return {
            kind: "query",
            url: appendQuery(options.url, formData),
            formData,
            data: serializeFormData(formData),
        };
    }
    const data = withAdditionalFields(serializeFormData(formData), formData, options.bodyFields);
    if (hasFile(formData)) {
        return { kind: "formData", url: options.url, formData, data, body: formData };
    }
    return { kind: "json", url: options.url, formData, data, body: JSON.stringify(data) };
}

function serializeFormData(formData: FormData): SerializedFormData {
    const data: SerializedFormData = {};
    for (const [key, value] of formData.entries()) {
        if (!isEmptyFile(value)) {
            appendSerializedValue(data, key, value);
        }
    }
    return data;
}

function appendQuery(url: string, formData: FormData): string {
    const next = new URL(url, location.href);
    for (const [key, value] of formData.entries()) {
        if (!isEmptyFile(value)) {
            next.searchParams.append(key, isFileLike(value) ? value.name : value);
        }
    }
    return next.toString();
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
