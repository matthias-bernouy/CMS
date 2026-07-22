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
