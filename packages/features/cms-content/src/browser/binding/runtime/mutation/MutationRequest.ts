import {
    MUTATION_ATTR,
    MUTATION_IDEMPOTENCY_ATTR,
    MUTATION_INPUT_ATTR,
    SOURCE_BODY_ATTR,
    SOURCE_IDEMPOTENCY_ATTR,
    SOURCE_INHERIT_QUERY_ATTR,
    SOURCE_METHOD_ATTR,
    type SourceMethod,
} from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { resolveBindingInput } from "../../state/bindingInput";
import {
    collectFormData,
    normalizeFormMethod,
    serializeForm,
    submitForm,
    type AdditionalFormFields,
    type FormSubmitResult,
    type SerializedForm,
} from "../../form/formSubmit";
import { MutationResult } from "./events/MutationResult";
import { runFetch } from "../query/queryFetch";

type CapturedSubmission = {
    form: HTMLFormElement;
    method: SourceMethod;
    formData: FormData;
    bodyFields: AdditionalFormFields | undefined;
    serialized: SerializedForm;
    idempotencyKey?: string;
};

type IdempotencyAttempt = { fingerprint: string; key: string };
const idempotencyAttempts = new WeakMap<HTMLFormElement, IdempotencyAttempt>();

export class MutationRequest {
    private latestInput: SerializedForm["data"] | undefined;
    private readonly result: MutationResult;

    constructor(
        private readonly element: Element,
        filters: FilterMap,
    ) {
        this.result = new MutationResult(element, filters);
    }

    capture(url: string): CapturedSubmission | null {
        const form = ownerForm(this.element, this.element.ownerDocument);
        if (!form) {
            return null;
        }
        const method = this.sourceMethod();
        const formData = collectFormData(form);
        const bodyFields = method === "GET" ? undefined : this.resolveBodyFields(true);
        const serialized = serializeForm(form, { url: this.submitUrl(url), method, formData, bodyFields });
        this.latestInput = serialized.data;
        return {
            form,
            method,
            formData,
            bodyFields,
            serialized,
            ...this.idempotency(form, serialized),
        };
    }

    get input(): SerializedForm["data"] | undefined {
        return this.latestInput;
    }

    captureInput(url: string): void {
        const form = ownerForm(this.element, this.element.ownerDocument);
        if (!form) {
            return;
        }
        const method = this.sourceMethod();
        const formData = collectFormData(form);
        const bodyFields = method === "GET" ? undefined : this.resolveBodyFields(false);
        this.latestInput = serializeForm(form, {
            url: this.submitUrl(url),
            method,
            formData,
            bodyFields,
        }).data;
    }

    async send(captured: CapturedSubmission, url: string, signal: AbortSignal): Promise<FormSubmitResult> {
        if (this.element.hasAttribute(MUTATION_ATTR)) {
            const headers = new Headers();
            headers.set("Accept", "application/json");
            if (captured.idempotencyKey) {
                headers.set("Idempotency-Key", captured.idempotencyKey);
            }
            const init: RequestInit = { method: "POST", headers, signal };
            if (captured.serialized.kind === "json") {
                headers.set("Content-Type", "application/json");
                init.body = captured.serialized.body;
            } else if (captured.serialized.kind === "formData") {
                init.body = captured.serialized.body;
            }
            const outcome = await runFetch(captured.serialized.url, signal, init);
            if (outcome.kind === "success") {
                return {
                    ok: true,
                    status: outcome.status ?? 200,
                    statusText: "OK",
                    body: outcome.data,
                    message: "",
                    form: captured.form,
                    outcome: {
                        kind: "success",
                        status: outcome.status ?? 200,
                        ...(outcome.requestId ? { requestId: outcome.requestId } : {}),
                    },
                };
            }
            const failed =
                outcome.kind === "aborted" ? { kind: "failure" as const, code: "aborted", retryable: false } : outcome;
            return {
                ok: false,
                status: failed.status ?? 0,
                statusText: failed.kind === "error" ? "Command rejected" : "Mutation failed",
                body: failed.kind === "error" ? (failed.output ?? null) : null,
                message: failed.code,
                form: captured.form,
                outcome: failed,
            };
        }
        return submitForm(captured.form, {
            url: this.submitUrl(url),
            method: captured.method,
            signal,
            bodyFields: captured.bodyFields,
            formData: captured.formData,
            serialized: captured.serialized,
            ...(captured.idempotencyKey ? { headers: { "Idempotency-Key": captured.idempotencyKey } } : {}),
        });
    }

    private resolveBodyFields(required: boolean): AdditionalFormFields | undefined {
        const value = this.element.getAttribute(MUTATION_INPUT_ATTR) ?? this.element.getAttribute(SOURCE_BODY_ATTR);
        const resolved = resolveBindingInput(value, this.element.ownerDocument);
        if (!resolved.ready) {
            if (required) {
                throw new TypeError("cms-mutation-input requires synchronized state that is not available");
            }
            return undefined;
        }
        return Object.keys(resolved.fields).length ? resolved.fields : undefined;
    }

    complete(result: FormSubmitResult, alias: string | undefined): void {
        if (result.ok && result.refresh?.ok !== false) {
            idempotencyAttempts.delete(result.form);
        }
        this.result.complete(result, alias, this.sourceMethod());
    }

    private idempotency(form: HTMLFormElement, serialized: SerializedForm): { idempotencyKey?: string } {
        const mode =
            this.element.getAttribute(MUTATION_IDEMPOTENCY_ATTR) ?? this.element.getAttribute(SOURCE_IDEMPOTENCY_ATTR);
        if (mode === null) {
            return {};
        }
        if (mode.trim().toLowerCase() !== "auto") {
            throw new Error("cms-mutation-idempotency must be auto when specified.");
        }
        const fingerprint = submissionFingerprint(serialized);
        const current = idempotencyAttempts.get(form);
        if (current?.fingerprint === fingerprint) {
            return { idempotencyKey: current.key };
        }
        const key = crypto.randomUUID();
        idempotencyAttempts.set(form, { fingerprint, key });
        return { idempotencyKey: key };
    }

    private sourceMethod(): SourceMethod {
        if (this.element.hasAttribute(MUTATION_ATTR)) {
            return "POST";
        }
        return normalizeFormMethod(this.element.getAttribute(SOURCE_METHOD_ATTR), "POST") as SourceMethod;
    }

    private submitUrl(url: string): string {
        const next = new URL(url, location.href);
        if (this.element.hasAttribute(MUTATION_ATTR)) {
            return next.toString();
        }
        if (this.element.getAttribute(SOURCE_INHERIT_QUERY_ATTR)?.trim().toLowerCase() !== "false") {
            for (const [key, value] of new URLSearchParams(location.search)) {
                next.searchParams.append(key, value);
            }
        }
        return next.toString();
    }
}

function submissionFingerprint(serialized: SerializedForm): string {
    if (serialized.kind === "json") {
        return `${serialized.kind}\0${serialized.url}\0${serialized.body}`;
    }
    if (serialized.kind === "query") {
        return `${serialized.kind}\0${serialized.url}`;
    }
    throw new Error("Automatic idempotency is not available for multipart forms.");
}

function ownerForm(value: EventTarget | null, document: Document): HTMLFormElement | null {
    const ctor = document.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && value instanceof ctor ? (value as HTMLFormElement) : null;
}
