import { MUTATION_INPUT_ATTR } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { resolveBindingInput } from "../../state/bindingInput";
import {
    collectFormData,
    serializeForm,
    type AdditionalFormFields,
    type FormSubmitResult,
    type SerializedForm,
} from "../../form/formSubmit";
import { MutationCompletion } from "./MutationCompletion";
import { runFetch } from "../query/queryFetch";

type CapturedSubmission = {
    form: HTMLFormElement;
    serialized: SerializedForm;
    automaticIdempotencyKey: string;
};

type IdempotencyAttempt = { fingerprint: string; key: string };
const idempotencyAttempts = new WeakMap<HTMLFormElement, IdempotencyAttempt>();

export class MutationRequest {
    private latestInput: SerializedForm["data"] | undefined;
    private readonly completion: MutationCompletion;

    constructor(
        private readonly element: Element,
        filters: FilterMap,
    ) {
        this.completion = new MutationCompletion(element, filters);
    }

    capture(url: string): CapturedSubmission | null {
        const form = ownerForm(this.element, this.element.ownerDocument);
        if (!form) {
            return null;
        }
        const serialized = this.serialize(form, url, true);
        this.latestInput = serialized.data;
        return {
            form,
            serialized,
            automaticIdempotencyKey: this.idempotency(form, serialized),
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
        this.latestInput = this.serialize(form, url, false).data;
    }

    private serialize(form: HTMLFormElement, url: string, required: boolean): SerializedForm {
        return serializeForm(form, {
            url: this.submitUrl(url),
            method: "POST",
            formData: collectFormData(form),
            bodyFields: this.resolveBodyFields(required),
            serialization: "typed-json",
        });
    }

    async send(captured: CapturedSubmission, signal: AbortSignal): Promise<FormSubmitResult> {
        const headers = new Headers();
        headers.set("Accept", "application/json");
        headers.set("X-Ulvia-Automatic-Idempotency-Key", captured.automaticIdempotencyKey);
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
                    requestId: outcome.requestId ?? crypto.randomUUID(),
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

    private resolveBodyFields(required: boolean): AdditionalFormFields | undefined {
        const value = this.element.getAttribute(MUTATION_INPUT_ATTR);
        const resolved = resolveBindingInput(value, this.element.ownerDocument);
        if (!resolved.ready) {
            if (required) {
                throw new TypeError("cms-mutation-input requires synchronized state that is not available");
            }
            return undefined;
        }
        return Object.keys(resolved.fields).length ? resolved.fields : undefined;
    }

    complete(result: FormSubmitResult, alias: string): void {
        if (result.ok) {
            idempotencyAttempts.delete(result.form);
        }
        this.completion.complete(result, alias);
    }

    private idempotency(form: HTMLFormElement, serialized: SerializedForm): string {
        const fingerprint = submissionFingerprint(serialized);
        const current = idempotencyAttempts.get(form);
        if (current?.fingerprint === fingerprint) {
            return current.key;
        }
        const key = crypto.randomUUID();
        idempotencyAttempts.set(form, { fingerprint, key });
        return key;
    }

    private submitUrl(url: string): string {
        return new URL(url, location.href).toString();
    }
}

function submissionFingerprint(serialized: SerializedForm): string {
    if (serialized.kind === "json") {
        return `${serialized.kind}\0${serialized.url}\0${serialized.body}`;
    }
    if (serialized.kind === "query") {
        return `${serialized.kind}\0${serialized.url}`;
    }
    const entries = Array.from(serialized.formData.entries(), ([name, value]) => [
        name,
        typeof value === "string" ? { kind: "string", value } : fileFingerprint(value),
    ]);
    return `${serialized.kind}\0${serialized.url}\0${JSON.stringify(entries)}`;
}

function fileFingerprint(value: unknown): Record<string, unknown> {
    const file = value as {
        readonly name?: unknown;
        readonly size?: unknown;
        readonly type?: unknown;
        readonly lastModified?: unknown;
    };
    return {
        kind: "file",
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
    };
}

function ownerForm(value: EventTarget | null, document: Document): HTMLFormElement | null {
    const ctor = document.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && value instanceof ctor ? (value as HTMLFormElement) : null;
}
