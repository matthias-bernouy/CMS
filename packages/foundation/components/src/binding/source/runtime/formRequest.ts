import { READY_ATTR } from "../../core/attrs";
import type { FormSubmitResult } from "../../submit/formSubmit";
import { CMS_SOURCE_FAILED_EVENT, CMS_SOURCE_SUCCESS_EVENT } from "../submissionEvents";

const submittedControls = new WeakMap<HTMLFormElement, HTMLInputElement[]>();

export class SourceFormError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body: unknown,
    ) {
        super(message);
    }
}

/** Submit a declarative form source and await the result owned by binding. */
export async function sourceFormRequest(
    host: ParentNode,
    sourceId: string,
    values: Record<string, unknown> = {},
): Promise<unknown> {
    if (!/^[a-z][a-z0-9-]*$/.test(sourceId)) {
        throw new Error(`Invalid declarative source id: ${sourceId}`);
    }
    const selector = `[cms-source-id="${sourceId}"]`;
    const local = host.querySelector(selector);
    const root = host instanceof Node ? host.getRootNode() : null;
    const parentHost = root instanceof ShadowRoot ? root.host : null;
    const form = local || parentHost?.querySelector(selector);
    if (!(form instanceof HTMLFormElement)) {
        throw new Error(`Missing declarative source form: ${sourceId}`);
    }
    await sourceReady(form);
    replaceSubmittedControls(form, values);
    const result = await submit(form);
    if (!result.ok) {
        throw new SourceFormError(resultMessage(result), result.status || 0, result.body);
    }
    return result.body;
}

function replaceSubmittedControls(form: HTMLFormElement, values: Record<string, unknown>): void {
    for (const control of submittedControls.get(form) || []) {
        control.remove();
    }
    const controls: HTMLInputElement[] = [];
    for (const [name, value] of Object.entries(values)) {
        appendValue(form, controls, name, value);
    }
    form.append(...controls);
    submittedControls.set(form, controls);
}

function appendValue(form: HTMLFormElement, controls: HTMLInputElement[], name: string, value: unknown): void {
    if (value === undefined || value === null || value === "") {
        return;
    }
    if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
            appendValue(
                form,
                controls,
                isRecord(item) || Array.isArray(item) ? `${name}[${index}]` : `${name}[]`,
                item,
            );
        }
        return;
    }
    if (isFile(form, value)) {
        const input = form.ownerDocument.createElement("input");
        input.type = "file";
        input.name = name;
        const DataTransferConstructor = form.ownerDocument.defaultView?.DataTransfer;
        if (!DataTransferConstructor) {
            throw new Error("This browser cannot transfer a selected file to the declarative source form.");
        }
        const transfer = new DataTransferConstructor();
        transfer.items.add(value);
        input.files = transfer.files;
        controls.push(input);
        return;
    }
    if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
            appendValue(form, controls, `${name}[${key}]`, item);
        }
        return;
    }
    const input = form.ownerDocument.createElement("input");
    input.type = "hidden";
    input.name = name;
    if (typeof value === "number") {
        input.setAttribute("cms-form-value-type", "number");
    } else if (typeof value === "boolean") {
        input.setAttribute("cms-form-value-type", "boolean");
    }
    input.value = String(value);
    controls.push(input);
}

function submit(form: HTMLFormElement): Promise<FormSubmitResult> {
    return new Promise((resolve) => {
        const complete = (event: Event): void => {
            if (event.target !== form) {
                return;
            }
            form.removeEventListener(CMS_SOURCE_SUCCESS_EVENT, complete);
            form.removeEventListener(CMS_SOURCE_FAILED_EVENT, complete);
            resolve((event as CustomEvent<FormSubmitResult>).detail);
        };
        form.addEventListener(CMS_SOURCE_SUCCESS_EVENT, complete);
        form.addEventListener(CMS_SOURCE_FAILED_EVENT, complete);
        form.requestSubmit();
    });
}

function sourceReady(form: HTMLFormElement): Promise<void> {
    if (form.hasAttribute(READY_ATTR)) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const Observer = form.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        const observer = new Observer(() => {
            if (form.hasAttribute(READY_ATTR)) {
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(form, { attributes: true, attributeFilter: [READY_ATTR] });
    });
}

function resultMessage(result: FormSubmitResult): string {
    if (isRecord(result.body)) {
        const message = result.body.error ?? result.body.message;
        if (typeof message === "string" && message.trim()) {
            return message;
        }
    }
    return result.message || `${result.status} ${result.statusText}`.trim() || "Source request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFile(form: HTMLFormElement, value: unknown): value is File {
    const FileConstructor = form.ownerDocument.defaultView?.File;
    return Boolean(FileConstructor && value instanceof FileConstructor);
}
