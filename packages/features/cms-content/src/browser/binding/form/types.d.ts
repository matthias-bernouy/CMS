export type FormSubmitMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type SerializedFormValue =
    | null
    | FormDataEntryValue
    | number
    | boolean
    | SerializedFormValue[]
    | { [key: string]: SerializedFormValue };

export type SerializedFormData = Record<string, SerializedFormValue>;

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
    refresh?: { ok: boolean; message: string };
    outcome?: import("../runtime/query/queryState").QueryOutcome;
};

export type AdditionalFormFields = Record<string, SerializedFormValue>;

export type SubmitFormOptions = {
    url: string;
    method: FormSubmitMethod;
    signal?: AbortSignal;
    bodyFields?: AdditionalFormFields;
    formData?: FormData;
    serialized?: SerializedForm;
    headers?: HeadersInit;
};
