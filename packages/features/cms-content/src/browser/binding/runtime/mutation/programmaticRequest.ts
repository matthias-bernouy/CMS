import type { FormSubmitResult } from "../../form/formSubmit";
import { parseMutation } from "cms-content/blocs/core/markup/bindings";

const submittedControls = new WeakMap<HTMLFormElement, HTMLElement[]>();
type MutationRunner = () => Promise<FormSubmitResult | null>;
const activeForms = new WeakMap<HTMLFormElement, MutationRunner>();

export function activateMutationForm(form: HTMLFormElement, runner: MutationRunner): () => void {
    activeForms.set(form, runner);
    return () => {
        if (activeForms.get(form) === runner) {
            activeForms.delete(form);
        }
    };
}

export class MutationFormError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body: unknown,
    ) {
        super(message);
    }
}

/** Submit a declarative mutation form and await its successful output. */
export async function mutationFormRequest(
    host: ParentNode,
    mutationName: string,
    values: Record<string, unknown> = {},
): Promise<unknown> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(mutationName)) {
        throw new Error(`Invalid declarative mutation name: ${mutationName}`);
    }
    const candidates = mutationForms(host);
    const root = host.getRootNode();
    const parentHost = root instanceof ShadowRoot ? root.host : null;
    if (parentHost) {
        candidates.push(...mutationForms(parentHost));
    }
    const matches = candidates.filter(
        (form) => parseMutation(form.getAttribute("cms-mutation") ?? "")?.name === mutationName,
    );
    if (matches.length !== 1) {
        throw new Error(`Expected one declarative mutation form named ${mutationName}, found ${matches.length}`);
    }
    return requestForm(matches[0]!, values);
}

async function requestForm(form: HTMLFormElement, values: Record<string, unknown>): Promise<unknown> {
    const run = activeForms.get(form);
    if (!run) {
        throw new Error("Declarative mutation form is not active.");
    }
    replaceSubmittedControls(form, values);
    const result = await run();
    if (!result) {
        throw new Error("Declarative mutation is already running or no longer active.");
    }
    if (!result.ok) {
        throw new MutationFormError(resultMessage(result), result.status || 0, result.body);
    }
    return result.body;
}

function mutationForms(root: ParentNode): HTMLFormElement[] {
    return Array.from(root.querySelectorAll("form[cms-mutation]")).filter(
        (element): element is HTMLFormElement => element instanceof HTMLFormElement,
    );
}

function replaceSubmittedControls(form: HTMLFormElement, values: Record<string, unknown>): void {
    for (const control of submittedControls.get(form) || []) {
        control.remove();
    }
    const controls: HTMLElement[] = [];
    for (const [name, value] of Object.entries(values)) {
        appendValue(form, controls, name, value);
    }
    form.append(...controls);
    submittedControls.set(form, controls);
}

function appendValue(form: HTMLFormElement, controls: HTMLElement[], name: string, value: unknown): void {
    if (value === undefined || value === null || value === "") {
        return;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            const select = form.ownerDocument.createElement("select");
            select.name = name;
            select.multiple = true;
            select.hidden = true;
            controls.push(select);
            return;
        }
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
            throw new Error("This browser cannot transfer a selected file to the declarative mutation form.");
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

function resultMessage(result: FormSubmitResult): string {
    if (isRecord(result.body)) {
        const message = result.body.error ?? result.body.message;
        if (typeof message === "string" && message.trim()) {
            return message;
        }
    }
    return result.message || `${result.status} ${result.statusText}`.trim() || "Mutation request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFile(form: HTMLFormElement, value: unknown): value is File {
    const FileConstructor = form.ownerDocument.defaultView?.File;
    return Boolean(FileConstructor && value instanceof FileConstructor);
}
