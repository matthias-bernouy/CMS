/** Executes one native form-owned `cms-mutation`. */

import { parseMutation } from "cms-content/blocs/core/markup/bindings";
import { MUTATION_ATTR } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import type { FormSubmitResult } from "../../form/formSubmit";
import { BindingRenderer } from "../../reactive/renderer/BindingRenderer";
import { cloneBindingContent } from "../../reactive/renderer/bindingContent";
import { publishFormSync } from "./formSync";
import { MutationPresenter } from "./MutationPresenter";
import { MutationRequest } from "./MutationRequest";
import { activateMutationForm } from "./programmaticRequest";
import { MutationTransaction } from "./transaction/MutationTransaction";

type FormMutationOptions = { afterMutationRender?: (mutation: Element) => void };

export class FormMutation {
    private readonly renderer: BindingRenderer;
    private readonly presenter: MutationPresenter;
    private readonly request: MutationRequest;
    private abort: AbortController | null = null;
    private stopActivation: (() => void) | null = null;
    private transaction: MutationTransaction | null = null;
    private syncDirty = false;

    constructor(
        private readonly form: HTMLFormElement,
        filters: FilterMap = {},
        private readonly options: FormMutationOptions = {},
    ) {
        this.request = new MutationRequest(form, filters);
        const captured = cloneBindingContent(form);
        this.renderer = new BindingRenderer(form, captured, filters, { inPlace: true });
        this.presenter = new MutationPresenter(this.renderer);
    }

    start(): void {
        this.form.addEventListener("submit", this.onSubmit);
        this.form.addEventListener("input", this.onFormInput);
        const spec = mutationBinding(this.form);
        if (spec) {
            this.presenter.initial(spec.alias);
            this.afterRender();
        }
        this.stopActivation = activateMutationForm(this.form, () => this.run());
    }

    dispose(): void {
        this.stopActivation?.();
        this.stopActivation = null;
        this.transaction?.release();
        this.transaction = null;
        this.abort?.abort();
        this.abort = null;
        this.form.removeEventListener("submit", this.onSubmit);
        this.form.removeEventListener("input", this.onFormInput);
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.transaction?.release();
        this.transaction = null;
        this.renderer.template();
    }

    async run(): Promise<FormSubmitResult | null> {
        if (this.transaction?.locked) {
            return null;
        }
        const spec = mutationBinding(this.form);
        if (!spec) {
            return null;
        }
        let transaction: MutationTransaction | null = null;
        try {
            transaction = MutationTransaction.prepare(this.form, this.request, spec.url);
            if (!transaction) {
                return null;
            }
            this.transaction = transaction;
        } catch (error) {
            const result = {
                ok: false,
                status: 0,
                statusText: "Invalid form",
                body: null,
                message: error instanceof Error ? error.message : String(error),
                form: this.form,
            };
            this.presenter.result(spec.alias, result, this.request.input);
            this.afterRender();
            this.request.complete(result, spec.alias);
            return result;
        }

        this.presenter.loading(spec.alias, this.request.input);
        this.afterRender();
        this.abort?.abort();
        const controller = new AbortController();
        this.abort = controller;
        try {
            const result = await transaction.send(controller.signal);
            if (!result) {
                if (!controller.signal.aborted) {
                    this.presenter.initial(spec.alias);
                    this.afterRender();
                }
                return null;
            }
            if (result.ok) {
                this.syncDirty = false;
            }
            this.presenter.result(spec.alias, result, this.request.input);
            this.afterRender();
            this.request.complete(result, spec.alias);
            return result;
        } finally {
            if (this.abort === controller) {
                this.abort = null;
            }
            transaction.release();
            if (this.transaction === transaction) {
                this.transaction = null;
            }
        }
    }

    private readonly onSubmit = (event: SubmitEvent): void => {
        if (!this.form.reportValidity()) {
            event.preventDefault();
            return;
        }
        event.preventDefault();
        if (this.form.isConnected) {
            void this.run();
        }
    };

    private readonly onFormInput = (): void => {
        this.syncDirty = true;
        const spec = mutationBinding(this.form);
        if (spec) {
            this.request.captureInput(spec.url);
        }
        this.publishFormSync();
    };

    private afterRender(): void {
        this.options.afterMutationRender?.(this.form);
        this.publishFormSync();
    }

    private publishFormSync(): void {
        publishFormSync(this.form, this.presenter.current, this.request.input, this.syncDirty);
    }
}

function mutationBinding(form: HTMLFormElement): { readonly url: string; readonly alias: string } | null {
    const mutation = parseMutation(form.getAttribute(MUTATION_ATTR) ?? "");
    if (mutation) {
        return {
            url: `/.cms/call/${mutation.contractId}/${mutation.capabilityId}`,
            alias: mutation.name,
        };
    }
    return null;
}
