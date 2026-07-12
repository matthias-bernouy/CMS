export type FormSubmitMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type SerializedFormData = Record<string, FormDataEntryValue | FormDataEntryValue[] | string | number | boolean>;

export type SerializedForm =
    | { kind: "query"; url: string; formData: FormData; data: SerializedFormData }
    | { kind: "json"; url: string; formData: FormData; data: SerializedFormData; body: string }
    | { kind: "formData"; url: string; formData: FormData; data: SerializedFormData; body: FormData };

export type FormSubmitResult = {
    ok: boolean;
    status: number;
    statusText: string;
    body: unknown;
    message: string;
    form: HTMLFormElement;
};

export type AdditionalFormFields = Record<string, string | number | boolean>;

export type SubmitFormOptions = {
    url: string;
    method: FormSubmitMethod;
    signal?: AbortSignal;
    bodyFields?: AdditionalFormFields;
    formData?: FormData;
};

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | FormAssociatedLike;

type FormAssociatedLike = HTMLElement & {
    name?: string;
    value?: string | string[];
    checked?: boolean;
    uncheckedValue?: string | null;
    files?: FileList | File[];
    disabled?: boolean;
};

const BODY_METHODS = new Set<FormSubmitMethod>(["POST", "PUT", "PATCH", "DELETE"]);

export function normalizeFormMethod(value: string | null | undefined, fallback: FormSubmitMethod): FormSubmitMethod {
    const method = (value ?? "").trim().toUpperCase();
    if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE" || method === "HEAD") {
        return method;
    }
    return fallback;
}

export function collectFormData(form: HTMLFormElement): FormData {
    const formData = new FormData(form);
    if (Array.from(formData.keys()).length > 0) return formData;

    for (const control of formControls(form)) appendControl(formData, control);
    return formData;
}

export function serializeForm(
    form: HTMLFormElement,
    options: { url: string; method: FormSubmitMethod; bodyFields?: AdditionalFormFields; formData?: FormData },
): SerializedForm {
    const formData = options.formData ?? collectFormData(form);
    const method = options.method;

    if (method === "GET" || method === "HEAD") {
        return {
            kind: "query",
            url: appendQuery(options.url, formData),
            formData,
            data: serializeFormData(formData),
        };
    }

    const data = withAdditionalFields(serializeFormData(formData), formData, options.bodyFields);

    if (BODY_METHODS.has(method) && hasFile(formData)) {
        return { kind: "formData", url: options.url, formData, data, body: formData };
    }

    return {
        kind: "json",
        url: options.url,
        formData,
        data,
        body: JSON.stringify(data),
    };
}

export async function submitForm(
    form: HTMLFormElement,
    options: SubmitFormOptions,
): Promise<FormSubmitResult> {
    const serialized = serializeForm(form, options);
    const headers = new Headers({ Accept: "application/json" });
    const init: RequestInit = {
        method: options.method,
        headers,
        signal: options.signal,
    };

    if (serialized.kind === "json") {
        headers.set("Content-Type", "application/json");
        init.body = serialized.body;
    } else if (serialized.kind === "formData") {
        init.body = serialized.body;
    }

    try {
        const response = await fetch(serialized.url, init);
        const body = await readResponseBody(response);
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body,
            message: response.ok ? "" : errorMessage(response, body),
            form,
        };
    } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") {
            return {
                ok: false,
                status: 0,
                statusText: "Aborted",
                body: null,
                message: "Aborted",
                form,
            };
        }
        return {
            ok: false,
            status: 0,
            statusText: "Network Error",
            body: null,
            message: error instanceof Error ? error.message : String(error),
            form,
        };
    }
}

export function serializeFormData(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
    const data: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

    for (const [key, value] of formData.entries()) {
        if (isEmptyFile(value)) continue;
        const current = data[key];
        if (current === undefined) {
            data[key] = value;
        } else if (Array.isArray(current)) {
            current.push(value);
        } else {
            data[key] = [current, value];
        }
    }

    return data;
}

function appendQuery(url: string, formData: FormData): string {
    const next = new URL(url, location.href);
    for (const [key, value] of formData.entries()) {
        if (isEmptyFile(value)) continue;
        next.searchParams.append(key, isFileLike(value) ? value.name : value);
    }
    return next.toString();
}

function withAdditionalFields(
    data: SerializedFormData,
    formData: FormData,
    fields: AdditionalFormFields | undefined,
): SerializedFormData {
    if (!fields) return data;

    let next: SerializedFormData = data;
    for (const [rawKey, value] of Object.entries(fields)) {
        const key = rawKey.trim();
        if (!key || formData.has(key) || Object.prototype.hasOwnProperty.call(data, key)) continue;
        if (next === data) next = { ...data };
        next[key] = value;
        formData.append(key, String(value));
    }
    return next;
}

function formControls(form: HTMLFormElement): FormControl[] {
    return Array.from(form.querySelectorAll<FormControl>("input, select, textarea, [name]"));
}

function appendControl(formData: FormData, control: FormControl): void {
    const name = control.name?.trim();
    if (!name || control.disabled) return;

    const view = control.ownerDocument.defaultView ?? globalThis;
    if (control instanceof view.HTMLInputElement) {
        if ((control.type === "checkbox" || control.type === "radio") && !control.checked) return;
        if (control.type === "file") {
            for (const file of Array.from(control.files ?? [])) formData.append(name, file);
            return;
        }
    }

    if (control instanceof view.HTMLSelectElement && control.multiple) {
        for (const option of Array.from(control.selectedOptions)) formData.append(name, option.value);
        return;
    }

    if (!(control instanceof view.HTMLInputElement) && "files" in control) {
        for (const file of Array.from(control.files ?? [])) formData.append(name, file);
        return;
    }

    if (!(control instanceof view.HTMLInputElement) && "checked" in control && control.checked === false) {
        const uncheckedValue = control.uncheckedValue;
        if (uncheckedValue !== undefined && uncheckedValue !== null) formData.append(name, uncheckedValue);
        return;
    }

    const value = control.value ?? "";
    if (Array.isArray(value)) {
        for (const item of value) formData.append(name, String(item));
        return;
    }
    formData.append(name, String(value));
}

function hasFile(formData: FormData): boolean {
    for (const value of formData.values()) {
        if (!isEmptyFile(value) && isFileLike(value)) return true;
    }
    return false;
}

function isEmptyFile(value: FormDataEntryValue): boolean {
    return isFileLike(value) && value.name === "" && value.size === 0;
}

function isFileLike(value: unknown): value is File {
    return typeof value === "object" && value !== null
        && typeof (value as File).name === "string"
        && typeof (value as File).size === "number";
}

async function readResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return null;
    const text = await response.clone().text().catch(() => "");
    if (text.trim() === "") return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        try { return JSON.parse(text); }
        catch { return null; }
    }
    try { return JSON.parse(text); }
    catch { return text; }
}

function errorMessage(response: Response, body: unknown): string {
    if (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string") {
        return (body as { error: string }).error;
    }
    if (body && typeof body === "object" && "message" in body && typeof (body as { message?: unknown }).message === "string") {
        return (body as { message: string }).message;
    }
    return response.statusText || `Request failed (${response.status})`;
}
