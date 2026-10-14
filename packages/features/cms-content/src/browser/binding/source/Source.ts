/** Executes one native form-owned `cms-source` mutation. */

import type { FilterMap } from "../core/interpolate";
import { SOURCE_ATTR } from "../core/attrs";
import { parseSyncAttribute, writeSyncValue } from "../params/SyncState";
import { cloneSourceContent } from "./presentation/sourceContent";
import { connectSourceContext } from "./presentation/sourceContext";
import { SourcePresenter } from "./presentation/sourcePresenter";
import { SourceRenderer } from "./presentation/sourceRenderer";
import type { SourceStatusOptions, SourceStatusValue } from "./presentation/sourceStatus";
import { activateSourceForm } from "./runtime/formRequest";
import { disposeSourceObservation, publishSourceObservation } from "./runtime/observation";
import { parseSourceSpec } from "./runtime/sourceSpec";
import { SubmissionTransaction } from "./runtime/submission/transaction";
import { listenSourceEvents } from "./sourceEvents";
import { SourceSubmission } from "./submission";
import { disconnectSourceData, rememberSourceData } from "./values";

export type { SourceStatusValue } from "./presentation/sourceStatus";

type SourceOptions = SourceStatusOptions & { afterSourceRender?: (source: Element) => void };

export class Source {
    private readonly renderer: SourceRenderer;
    private readonly presenter: SourcePresenter;
    private readonly submission: SourceSubmission;
    private abort: AbortController | null = null;
    private stopActivation: (() => void) | null = null;
    private stopListeners: (() => void) | null = null;
    private stopContext: (() => void) | null = null;
    private transaction: SubmissionTransaction | null = null;
    private pendingChange = false;
    private syncDirty = false;
    private status: SourceStatusValue = {
        loading: false,
        loaded: false,
        empty: false,
        error: false,
    };

    constructor(
        private readonly form: HTMLFormElement,
        filters: FilterMap = {},
        private readonly options: SourceOptions = {},
    ) {
        this.submission = new SourceSubmission(form, filters);
        const captured = cloneSourceContent(form);
        this.renderer = new SourceRenderer(form, captured, filters, { inPlace: true });
        this.presenter = new SourcePresenter(form, captured, this.renderer, {
            ...options,
            setSourceStatus: (source, status) => {
                this.status = status;
                options.setSourceStatus?.(source, status);
            },
        });
    }

    start(): void {
        this.stopContext = connectSourceContext(this.form, () => {
            this.renderer.refreshContext();
            this.afterRender();
        });
        this.stopListeners = listenSourceEvents(this.form, {
            onSubmit: (event) => this.onSubmit(event),
            onChange: () => this.onChange(),
        });
        this.form.addEventListener("input", this.onFormInput);
        const spec = parseSourceSpec(this.form.getAttribute(SOURCE_ATTR) ?? "");
        if (spec.url) {
            this.presenter.initial(spec.alias);
            this.afterRender();
        }
        this.stopActivation = activateSourceForm(this.form);
    }

    dispose(): void {
        this.stopActivation?.();
        this.stopActivation = null;
        this.transaction?.release();
        this.transaction = null;
        this.stopContext?.();
        this.stopContext = null;
        disconnectSourceData(this.form);
        disposeSourceObservation(this.form);
        this.abort?.abort();
        this.abort = null;
        this.stopListeners?.();
        this.stopListeners = null;
        this.form.removeEventListener("input", this.onFormInput);
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.transaction?.release();
        this.transaction = null;
        this.renderer.template();
    }

    async run(): Promise<boolean> {
        if (this.transaction?.locked) {
            return false;
        }
        const spec = parseSourceSpec(this.form.getAttribute(SOURCE_ATTR) ?? "");
        if (!spec.url) {
            return false;
        }
        let transaction: SubmissionTransaction | null = null;
        try {
            transaction = SubmissionTransaction.prepare(this.form, this.submission, spec.url);
            if (!transaction) {
                return false;
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
            this.presenter.result(spec.alias, result);
            this.afterRender();
            this.submission.complete(result, spec.alias);
            return false;
        }

        this.presenter.loading(spec.alias);
        this.afterRender();
        this.abort?.abort();
        const controller = new AbortController();
        this.abort = controller;
        try {
            const result = await transaction.send(spec.url, controller.signal);
            if (!result) {
                if (!controller.signal.aborted) {
                    this.presenter.initial(spec.alias);
                    this.afterRender();
                }
                return false;
            }
            rememberSourceData(this.form, result);
            if (result.ok) {
                this.syncDirty = false;
            }
            this.presenter.result(spec.alias, result);
            this.afterRender();
            this.submission.complete(result, spec.alias);
            return result.ok && result.refresh?.ok !== false;
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

    private onSubmit(event: SubmitEvent): void {
        if (!this.form.reportValidity()) {
            event.preventDefault();
            return;
        }
        event.preventDefault();
        if (this.form.isConnected) {
            void this.run();
        }
    }

    private onChange(): void {
        if (!this.form.reportValidity() || !this.form.isConnected) {
            return;
        }
        if (this.transaction?.locked) {
            this.pendingChange = true;
            return;
        }
        void this.run().finally(() => {
            if (this.pendingChange) {
                this.pendingChange = false;
                this.onChange();
            }
        });
    }

    private readonly onFormInput = (): void => {
        this.syncDirty = true;
        const spec = parseSourceSpec(this.form.getAttribute(SOURCE_ATTR) ?? "");
        if (spec.url) {
            this.submission.captureInput(spec.url);
        }
        this.publishFormSync();
    };

    private afterRender(): void {
        this.options.afterSourceRender?.(this.form);
        publishSourceObservation(this.form, this.status);
        this.publishFormSync();
    }

    private publishFormSync(): void {
        const target = parseSyncAttribute(this.form);
        if (!target) {
            return;
        }
        try {
            const data = this.status.data;
            const synchronizedStatus =
                data && typeof data === "object" && "form" in data
                    ? { ...this.status, data: formResultState(data as Record<string, unknown>) }
                    : this.status;
            const input = this.submission.input;
            writeSyncValue(
                target,
                { ...synchronizedStatus, ...(input === undefined ? {} : { input }), dirty: this.syncDirty },
                this.form.ownerDocument,
            );
        } catch (error) {
            console.warn("cms-sync could not publish form state", error);
        }
    }
}

function formResultState(result: Record<string, unknown>): Record<string, unknown> {
    const { form: _form, ...serializable } = result;
    return serializable;
}
